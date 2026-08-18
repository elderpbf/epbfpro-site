// Codex-owned Worker transport.
//
// This REPLACES the Trail's dependency on backstage/js/api-client.js: the call
// plumbing now lives inside Codex. The default backend is the codex-api Worker
// (Codex's own), so a Trail page no longer loads a Backstage file just to talk
// to its own backend.
//
// Auth: the legacy bs_pw_hash param (admin fallback path) is sent as auth_token,
// and a Google Bearer token is added ONLY when a provider (window.BS_GOOGLE) is
// present. The public Trail loads neither a hash nor BS_GOOGLE, so its requests
// go out auth-free, exactly as the public path needs. The Bearer branch is kept
// verbatim from api-client.js so the same transport can serve the admin once its
// auth is ported; on the Trail it is simply dormant.
//
// Seam: the codex-api.js facade and the reused leaf components call
// `window.callWorker` (a single transport seam, also where tests stub). This
// module provides that global. The pure request/response helpers below are the
// unit-tested core (see codex/tests/worker-call.test.mjs).

// Globals (optional; this module itself installs window.callWorker):
//   window.WORKER_URL (boot-set base-URL override, else DEFAULT_WORKER_URL),
//   window.BS_GOOGLE (Google Bearer token, admin only), window.bsLog/window.dbg
//   (debug pill), window.cdxNet (reconnect hook installed by js/reconnect.js)
import * as notifBus from './notif-bus.js';

export const DEFAULT_WORKER_URL = 'https://codex-api.pensoia.workers.dev';

// ── Staging previews are pinned to the staging Worker ────────────────────────
// Every *.epbfpro-site-staging.pages.dev host is a per-branch preview of THIS site, and its
// backend is the staging Worker. This is derived from the HOST, not from the page's boot
// script, because the boot script is committed production config: each page hardcodes
// `window.WORKER_URL = 'https://api.pensoia.com'` (track-36, first-party API), so a preview
// deployed from the repo silently talked to PRODUCTION.
//
// That is not a hypothetical. It burned a whole round of testing on 2026-07-15: the admin was
// pointed at staging by hand while the Trail was not, so a teacher toggle written to staging
// was read back from prod and looked like it "didn't persist" — and a live prod item title
// showed up in a staging screenshot. Hand-editing the five boot scripts before each deploy
// "fixes" it until the edit is forgotten, reverted, or missed on the sixth file; the host
// already knows the answer, so the host decides.
//
// It also makes the DEV_COOKIE mirror (js/codex-login.js) honest: that cookie is shared across
// the whole preview family on the stated assumption that every preview talks to the SAME
// Worker. Until now it didn't.
//
// Production (pensoia.com) and staging.pensoia.com are untouched: neither matches this suffix.
export const STAGING_HOST = 'epbfpro-site-staging.pages.dev';
export const STAGING_WORKER_URL = 'https://codex-api-staging.pensoia.workers.dev';

// PURE. Is this page one of the branch previews?
export function isStagingHost(hostname) {
  const h = String(hostname || '');
  return h === STAGING_HOST || h.endsWith('.' + STAGING_HOST);
}

// ── Per-branch Worker override, previews only ────────────────────────────────
// The host pin above fixed one problem and left another standing. `codex-api-staging` is ONE
// deployment: two sessions working at the same time each run `wrangler deploy --env staging`
// and the last one wins, silently, within seconds. A branch cannot fix that (Élder 2026-08-05:
// "por isso trabalhamos em galhos diferentes" — galho não resolve este caso), and it cost a
// full round of work on this very track.
//
// The fix has two halves. On the Worker side, `wrangler versions upload` publishes a build to
// its OWN URL without taking traffic on the shared one. On this side, a preview has to be able
// to point at that URL — which the pin above made impossible, including through the
// `window.WORKER_URL` the deploy recipe tells you to use.
//
// So: an override, but a narrow one. Accepted ONLY on a preview host, and ONLY when it names a
// staging-family Worker. Production can never be redirected (that IS the 2026-07-15 incident),
// and a preview can never be aimed at the production Worker, which would let a test click write
// to the real D1.
export const WORKER_OVERRIDE_KEY = 'cdx_worker_url';

// PURE. May a preview be redirected to this URL? `wrangler versions upload` hands back
// `https://<version-prefix>-codex-api-staging.pensoia.workers.dev`, so the rule is the host
// label carrying `codex-api-staging` under our own workers.dev zone. Nothing else passes.
export function isAllowedWorkerOverride(url) {
  return /^https:\/\/[a-z0-9-]*codex-api-staging[a-z0-9-]*\.pensoia\.workers\.dev\/?$/
    .test(String(url || ''));
}

// PURE given its inputs. `?worker=<url>` pins this preview to one Worker version and REMEMBERS
// it; `?worker=` or `?worker=reset` forgets it. Remembered rather than read from the URL every
// time because the admin navigates internally and nobody re-appends a query string on each hop.
// A rejected value leaves whatever was already pinned alone: a typo must not silently move you
// back onto the shared slot, which is the failure this whole block exists to end.
export function readWorkerOverride(search, storage) {
  let stored = null;
  try { stored = (storage && storage.getItem(WORKER_OVERRIDE_KEY)) || null; } catch (_) { /* private mode */ }
  const m = /[?&]worker=([^&]*)/.exec(String(search || ''));
  if (!m) return stored;
  const asked = decodeURIComponent(m[1] || '').replace(/\/$/, '');
  if (!asked || asked === 'reset') {
    try { storage && storage.removeItem(WORKER_OVERRIDE_KEY); } catch (_) { /* private mode */ }
    return null;
  }
  if (!isAllowedWorkerOverride(asked)) return stored;
  try { storage && storage.setItem(WORKER_OVERRIDE_KEY, asked); } catch (_) { /* private mode */ }
  return asked;
}

// PURE. The backend for a page served from `hostname`, given whatever its boot script set and
// whatever this preview was pinned to. A preview host WINS over the boot value — that is the
// whole point — and an accepted override wins over the shared staging slot.
export function resolveWorkerUrl(hostname, bootUrl, override) {
  if (isStagingHost(hostname)) {
    return isAllowedWorkerOverride(override)
      ? String(override).replace(/\/$/, '')
      : STAGING_WORKER_URL;
  }
  return bootUrl || DEFAULT_WORKER_URL;
}

// Max URL length before switching GET -> POST. Cloudflare's hard limit is ~16KB;
// 6KB leaves headroom for intermediaries (matches the legacy budget).
export const URL_BUDGET = 6000;

// PURE. Serialize params and decide GET vs POST. No fetch, no globals.
//   opts.workerUrl   backend base (defaults to codex-api)
//   opts.googleToken when present, adds an `Authorization: Bearer` header
export function buildWorkerRequest(params, opts = {}) {
  const workerUrl = opts.workerUrl || DEFAULT_WORKER_URL;
  const bodyJson = JSON.stringify(params || {});
  const headers = {};
  if (opts.googleToken) headers['Authorization'] = 'Bearer ' + opts.googleToken;

  // A credential must never ride in the URL, where it lands in server/proxy access
  // logs and the Referer header. Force POST whenever one is present so it travels in
  // the body: the admin auth_token (bs_pw_hash) and the Trail's persistent student
  // session_token both qualify. The public Trail's auth-free reads (empty auth_token,
  // no session) may stay GET. Oversized payloads POST regardless.
  const getUrl = workerUrl + '?payload=' + encodeURIComponent(bodyJson);
  const hasSecret = !!(params && (params.auth_token || params.session_token));
  if (hasSecret || getUrl.length > URL_BUDGET) {
    headers['Content-Type'] = 'application/json';
    return { method: 'POST', url: workerUrl, headers, body: bodyJson };
  }
  return { method: 'GET', url: getUrl, headers, body: null };
}

// PURE. Turn a settled response into data, or throw an Error whose `.data`
// carries the structured error. Mirrors the legacy contract exactly so callers
// (and their `e.data.error` checks) keep working unchanged.
export function interpretWorkerResponse(resp, params = {}) {
  if (!resp.ok) {
    const e = new Error('HTTP ' + resp.status);
    e.data = { error: 'http_' + resp.status };
    throw e;
  }
  const txt = resp.text || '';
  if (txt.charAt(0) === '<') {
    const e = new Error('server returned HTML');
    e.data = { error: 'server_returned_html' };
    throw e;
  }
  let data;
  try {
    data = JSON.parse(txt);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    const e = new Error('JSON parse: ' + msg);
    e.data = { error: 'json_parse_error', detail: msg };
    throw e;
  }
  if (data.error) {
    const e = new Error(data.error);
    e.data = data;
    throw e;
  }
  return data;
}

// Route through the shared debug pill when present; never hard-depend on it
// (bsLog/dbg are bare globals from backstage/js/debug.js, the shared infra).
function _log(kind, msg) {
  if (kind === 'error') {
    if (typeof bsLog !== 'undefined') bsLog(msg, 'error');
    if (typeof dbg !== 'undefined') dbg('error', msg);
  } else if (typeof dbg !== 'undefined') {
    dbg(kind, msg);
  }
}

// Optional connection-state hook for the admin's reconnect watchdog
// (js/reconnect.js installs window.cdxNet): 'down' on a transport failure (the
// network dropped), 'up' once a response comes back. The public Trail and the
// tests install no hook, so this is a silent no-op there, and it must never
// throw into a live call.
function _net(state, data) {
  if (typeof window !== 'undefined' && typeof window.cdxNet === 'function') {
    try { window.cdxNet(state, data); } catch (_) { /* watchdog must not break a call */ }
  }
}

// The pin is read from the browser only on a preview host: production never even looks, so a
// stray `cdx_worker_url` in somebody's localStorage cannot move pensoia.com off its backend.
let _overrideAnnounced = false;
function _browserWorkerOverride() {
  if (typeof location === 'undefined') return null;
  if (!isStagingHost(location.hostname || '')) return null;
  const url = readWorkerOverride(
    location.search || '',
    typeof localStorage !== 'undefined' ? localStorage : null,
  );
  // Say it once. A preview quietly talking to a different backend than you think is the exact
  // class of bug this block exists to end, so it has to be visible in the debug pill.
  if (url && !_overrideAnnounced) {
    _overrideAnnounced = true;
    if (typeof window !== 'undefined' && window.bsLog) window.bsLog('worker pinned to ' + url, 'info');
  }
  return url;
}

// Make a Worker call. `env` lets tests inject fetch/workerUrl/auth; in the
// browser those default to window.WORKER_URL, localStorage, and window.BS_GOOGLE.
export async function callWorker(params, env = {}) {
  const p = Object.assign({}, params || {});
  const action = p.action || '?';

  const fetchImpl = env.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    const e = new Error('no fetch available');
    e.data = { error: 'no_fetch' };
    throw e;
  }

  // env.workerUrl still wins (tests inject it). Otherwise the HOST decides: a staging preview
  // is pinned to the staging Worker, everything else keeps the boot script's value.
  const workerUrl = env.workerUrl
    || resolveWorkerUrl(
      (typeof location !== 'undefined' && location.hostname) || '',
      (typeof window !== 'undefined' && window.WORKER_URL) || null,
      env.workerOverride !== undefined ? env.workerOverride : _browserWorkerOverride(),
    );

  // auth_token (hash) is always sent (empty string on the public Trail).
  if (!p.auth_token) {
    p.auth_token = env.authToken != null
      ? env.authToken
      : (typeof localStorage !== 'undefined' ? (localStorage.getItem('bs_pw_hash') || '') : '');
  }

  // Google Bearer only when a provider is authed (admin); absent on the Trail.
  const googleToken = env.googleToken != null
    ? env.googleToken
    : (typeof window !== 'undefined' && window.BS_GOOGLE
        && window.BS_GOOGLE.isAuthed && window.BS_GOOGLE.isAuthed()
        ? window.BS_GOOGLE.getAccessToken()
        : null);

  // Notification piggyback (Élder 2026-07-14): ask THIS call — one that was already leaving —
  // to bring the bell's feed back with it, instead of the bell spending a request of its own.
  // Only on a call that already carries an identity the feed can be computed for, never on the
  // dedicated notification actions (they ARE the feed), and at most once per bus window, so a
  // page-load fan-out attaches it exactly once. Costs zero extra requests.
  const _identified = !!(p.session_token || p.auth_token);
  const _wantsNotif = _identified
    && String(action).indexOf('_notif') === -1
    && action !== 'ct_forum_notifications' && action !== 'ct_forum_admin_notifications'
    && notifBus.shouldAsk();
  if (_wantsNotif) { p._notif = 1; notifBus.markAsked(); }

  const req = buildWorkerRequest(p, { workerUrl, googleToken });
  _log('info', '→ ' + action + (req.method === 'POST' ? ' [POST ' + req.body.length + 'B]' : ''));

  let resp;
  try {
    // credentials:'include' so a first-party same-site session cookie (Domain=.pensoia.com,
    // set by the worker at api.pensoia.com on login) is sent + stored (track-36 b). Harmless
    // for the workers.dev base (no matching cookie); the CORS layer sets Allow-Credentials.
    resp = req.method === 'POST'
      ? await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body, redirect: 'follow', credentials: 'include' })
      : await fetchImpl(req.url, { headers: req.headers, redirect: 'follow', credentials: 'include' });
  } catch (netErr) {
    const netMsg = (netErr && netErr.message) ? netErr.message : String(netErr);
    _log('error', 'callWorker network error | action: ' + action + ' | ' + netMsg);
    const e = new Error('Network: ' + netMsg);
    e.data = { error: 'network_error', detail: netMsg };
    _net('down', e.data);
    throw e;
  }

  let text;
  try {
    text = await resp.text();
  } catch (readErr) {
    const readMsg = (readErr && readErr.message) ? readErr.message : String(readErr);
    _log('error', 'callWorker body read error | action: ' + action + ' | ' + readMsg);
    const e = new Error('Body read: ' + readMsg);
    e.data = { error: 'body_read_error', detail: readMsg };
    _net('down', e.data);
    throw e;
  }

  // A response body came back -> the connection is alive (even a worker-level
  // error or a 4xx/5xx proves reachability), so clear any reconnect banner.
  _net('up');

  try {
    const data = interpretWorkerResponse({ ok: resp.ok, status: resp.status, text }, p);
    _log('ok', '← ' + action + ': ok');
    // The envelope rode back on this response: hand it to the bus, which fans it out to
    // whichever bell is mounted. Never touches `data` — the caller's payload is untouched.
    if (data && data.notif) notifBus.publish(data.notif);
    return data;
  } catch (e) {
    if (!p._silent) _log('error', '← ' + action + ': ' + ((e.data && e.data.error) || e.message));
    throw e;
  }
}

// Provide the window-global transport seam for the page. The codex-api facade
// and the reused classic-script leaf components both call window.callWorker.
if (typeof window !== 'undefined') {
  window.callWorker = (p) => callWorker(p);
}
