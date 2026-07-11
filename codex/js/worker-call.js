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
export const DEFAULT_WORKER_URL = 'https://codex-api.pensoia.workers.dev';

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

  const workerUrl = env.workerUrl
    || (typeof window !== 'undefined' && window.WORKER_URL)
    || DEFAULT_WORKER_URL;

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
