// codex/js/worker-call.js — Codex-owned Worker transport. Replaces the Trail's
// dependency on backstage/js/api-client.js: the call plumbing now lives inside
// Codex, defaults to the codex-api Worker, and carries no auth on the public
// Trail (the Google Bearer branch stays for the admin but is dormant when no
// BS_GOOGLE provider is present). Pure request/response logic is unit-tested
// here; the window.callWorker glue + dbg logging is verified in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKER_URL,
  buildWorkerRequest,
  interpretWorkerResponse,
  callWorker,
  resolveWorkerUrl,
  isStagingHost,
} from '../js/worker-call.js';

// ── default backend ──────────────────────────────────────────────────────────
test('default Worker is codex-api, not backstage-api', () => {
  assert.equal(DEFAULT_WORKER_URL, 'https://codex-api.pensoia.workers.dev');
});

// ── buildWorkerRequest (pure) ────────────────────────────────────────────────
test('buildWorkerRequest: small payload -> GET with encoded payload', () => {
  const r = buildWorkerRequest({ action: 'ping', n: 1 });
  assert.equal(r.method, 'GET');
  assert.equal(r.body, null);
  assert.ok(r.url.startsWith(DEFAULT_WORKER_URL + '?payload='));
  const decoded = JSON.parse(decodeURIComponent(r.url.split('payload=')[1]));
  assert.deepEqual(decoded, { action: 'ping', n: 1 });
});

test('buildWorkerRequest: respects an explicit workerUrl', () => {
  const r = buildWorkerRequest({ action: 'x' }, { workerUrl: 'https://other.example' });
  assert.ok(r.url.startsWith('https://other.example?payload='));
});

test('buildWorkerRequest: oversized payload -> POST with JSON body', () => {
  const big = { action: 'x', blob: 'a'.repeat(7000) };
  const r = buildWorkerRequest(big);
  assert.equal(r.method, 'POST');
  assert.equal(r.url, DEFAULT_WORKER_URL);
  assert.equal(r.headers['Content-Type'], 'application/json');
  assert.equal(r.body, JSON.stringify(big));
});

test('buildWorkerRequest: a non-empty auth_token forces POST (credential never in the URL)', () => {
  const r = buildWorkerRequest({ action: 'x', auth_token: 'deadbeefhash' });
  assert.equal(r.method, 'POST', 'an admin request with a secret must POST');
  assert.equal(r.url, DEFAULT_WORKER_URL, 'no query string carrying the payload');
  assert.ok(!/deadbeefhash/.test(r.url), 'the credential is not in the URL');
  assert.ok(/deadbeefhash/.test(r.body), 'the credential travels in the POST body');
});

test('buildWorkerRequest: empty auth_token (public Trail) may stay GET', () => {
  const r = buildWorkerRequest({ action: 'x', auth_token: '' });
  assert.equal(r.method, 'GET', 'the public Trail has no secret to leak');
});

test('buildWorkerRequest: a session_token forces POST (the persistent student credential never in the URL)', () => {
  const r = buildWorkerRequest({ action: 'student_session_check', session_token: 'sess_abc' });
  assert.equal(r.method, 'POST', 'a persistent session token must POST');
  assert.equal(r.url, DEFAULT_WORKER_URL, 'no query string carrying the token');
  assert.ok(!/sess_abc/.test(r.url), 'the session token is absent from the URL');
  assert.ok(/sess_abc/.test(r.body), 'the session token travels in the POST body');
});

test('callWorker: an injected auth_token POSTs and keeps the token out of the URL', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 200, text: async () => '{}' }; };
  await callWorker({ action: 'x' }, { fetch: fakeFetch, authToken: 'secretX' });
  assert.ok(!/secretX/.test(captured.url), 'token absent from the URL');
  assert.equal(captured.opts.method, 'POST');
  assert.ok(/secretX/.test(captured.opts.body), 'token present in the POST body');
});

test('buildWorkerRequest: no Authorization header without a google token', () => {
  const r = buildWorkerRequest({ action: 'x' });
  assert.ok(!('Authorization' in r.headers), 'public Trail goes out auth-free');
});

test('buildWorkerRequest: Bearer header when a google token is supplied', () => {
  const r = buildWorkerRequest({ action: 'x' }, { googleToken: 'TOK123' });
  assert.equal(r.headers.Authorization, 'Bearer TOK123');
});

// ── interpretWorkerResponse (pure) ───────────────────────────────────────────
test('interpretWorkerResponse: ok + JSON -> data', () => {
  assert.deepEqual(interpretWorkerResponse({ ok: true, status: 200, text: '{"a":1}' }), { a: 1 });
});

test('interpretWorkerResponse: data.error -> throws Error carrying .data', () => {
  assert.throws(
    () => interpretWorkerResponse({ ok: true, status: 200, text: '{"error":"nope","hint":"h"}' }),
    (e) => e.data.error === 'nope' && e.data.hint === 'h',
  );
});

test('interpretWorkerResponse: non-ok -> http_<status>', () => {
  assert.throws(
    () => interpretWorkerResponse({ ok: false, status: 500, text: '' }),
    (e) => e.data.error === 'http_500',
  );
});

test('interpretWorkerResponse: HTML body -> server_returned_html', () => {
  assert.throws(
    () => interpretWorkerResponse({ ok: true, status: 200, text: '<!DOCTYPE html>' }),
    (e) => e.data.error === 'server_returned_html',
  );
});

test('interpretWorkerResponse: malformed JSON -> json_parse_error', () => {
  assert.throws(
    () => interpretWorkerResponse({ ok: true, status: 200, text: '{bad' }),
    (e) => e.data.error === 'json_parse_error',
  );
});

// ── callWorker (fetch injected) ──────────────────────────────────────────────
test('callWorker: hits codex-api by default, returns data, injects auth_token', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, text: async () => '{"ok":1}' };
  };
  const data = await callWorker({ action: 'ping' }, { fetch: fakeFetch });
  assert.deepEqual(data, { ok: 1 });
  assert.ok(captured.url.startsWith(DEFAULT_WORKER_URL));
  const sent = JSON.parse(decodeURIComponent(captured.url.split('payload=')[1]));
  assert.ok('auth_token' in sent, 'auth_token param always present (empty on Trail)');
});

test('callWorker: no Authorization header when no google provider', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  await callWorker({ action: 'x' }, { fetch: fakeFetch });
  assert.ok(!captured.opts.headers || !('Authorization' in captured.opts.headers));
});

test('callWorker: passes Bearer when a google token is provided', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  await callWorker({ action: 'x' }, { fetch: fakeFetch, googleToken: 'T' });
  assert.equal(captured.opts.headers.Authorization, 'Bearer T');
});

test('callWorker: network failure -> network_error', async () => {
  const failFetch = async () => { throw new Error('down'); };
  await assert.rejects(
    callWorker({ action: 'x' }, { fetch: failFetch }),
    (e) => e.data.error === 'network_error' && /down/.test(e.data.detail),
  );
});

test('callWorker: surfaces a worker error payload as a throw', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => '{"error":"bad_thing"}' });
  await assert.rejects(
    callWorker({ action: 'x', _silent: true }, { fetch: fakeFetch }),
    (e) => e.data.error === 'bad_thing',
  );
});

// ── connection watchdog hook (window.cdxNet) ─────────────────────────────────
// callWorker signals 'down' on a transport failure and 'up' once a response comes
// back, so the admin's reconnect banner (js/reconnect.js) can raise/clear itself.
// Tests inject a fake window carrying a cdxNet spy and restore it afterwards.
async function withCdxNet(run) {
  const saved = globalThis.window;
  const calls = [];
  globalThis.window = { cdxNet: (state, data) => calls.push({ state, data }) };
  try { await run(calls); } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
}

test('callWorker: a network failure signals the watchdog down', async () => {
  await withCdxNet(async (calls) => {
    const failFetch = async () => { throw new Error('offline'); };
    await assert.rejects(callWorker({ action: 'x' }, { fetch: failFetch }));
    assert.ok(
      calls.some((c) => c.state === 'down' && c.data && c.data.error === 'network_error'),
      'down signalled with network_error',
    );
    assert.ok(!calls.some((c) => c.state === 'up'), 'never signals up on a hard network failure');
  });
});

test('callWorker: a successful call signals the watchdog up', async () => {
  await withCdxNet(async (calls) => {
    const okFetch = async () => ({ ok: true, status: 200, text: async () => '{"ok":1}' });
    await callWorker({ action: 'x' }, { fetch: okFetch });
    assert.ok(calls.some((c) => c.state === 'up'), 'up signalled when a response comes back');
    assert.ok(!calls.some((c) => c.state === 'down'), 'no down on success');
  });
});

test('callWorker: a deliberate Worker error still signals up (connection is alive)', async () => {
  await withCdxNet(async (calls) => {
    const errFetch = async () => ({ ok: true, status: 200, text: async () => '{"error":"bad_thing"}' });
    await assert.rejects(callWorker({ action: 'x', _silent: true }, { fetch: errFetch }));
    assert.ok(calls.some((c) => c.state === 'up'), 'an app error proves reachability -> up, not down');
    assert.ok(!calls.some((c) => c.state === 'down'), 'app errors never raise the reconnect banner');
  });
});

// ── Staging previews are pinned to the staging Worker (2026-07-15) ───────────
// Each page's boot script is committed PRODUCTION config
// (window.WORKER_URL = 'https://api.pensoia.com'), so a preview published from the repo
// was talking to PRODUCTION. That burned a whole round of testing: a toggle written on
// staging, read back from prod, looking like it "wasn't persisting". Now the HOST decides.
test('resolveWorkerUrl: a branch preview goes to the staging Worker', () => {
  assert.equal(
    resolveWorkerUrl('track26-multi.epbfpro-site-staging.pages.dev', 'https://api.pensoia.com'),
    'https://codex-api-staging.pensoia.workers.dev',
  );
});
test('resolveWorkerUrl: the preview host WINS over the boot script (that is the whole point)', () => {
  // The boot script asks for prod; the host is a preview; the host wins.
  assert.equal(
    resolveWorkerUrl('epbfpro-site-staging.pages.dev', 'https://api.pensoia.com'),
    'https://codex-api-staging.pensoia.workers.dev',
  );
});
test('resolveWorkerUrl: PRODUCTION is not touched', () => {
  assert.equal(resolveWorkerUrl('pensoia.com', 'https://api.pensoia.com'), 'https://api.pensoia.com');
  assert.equal(resolveWorkerUrl('www.pensoia.com', 'https://api.pensoia.com'), 'https://api.pensoia.com');
});
test('resolveWorkerUrl: staging.pensoia.com stays on prod, as it always has', () => {
  // It exists to test cookies/session on a real *.pensoia.com host; it is not part of the
  // preview family and does not switch backend here.
  assert.equal(resolveWorkerUrl('staging.pensoia.com', 'https://api.pensoia.com'), 'https://api.pensoia.com');
});
test('resolveWorkerUrl: with no boot script, falls back to the default', () => {
  assert.equal(resolveWorkerUrl('pensoia.com', null), DEFAULT_WORKER_URL);
  assert.equal(resolveWorkerUrl('', null), DEFAULT_WORKER_URL);
});
test('isStagingHost: does not match a host that only LOOKS LIKE it ends the same way', () => {
  // 'evil-epbfpro-site-staging.pages.dev' is not our subdomain: the dot in the suffix matters.
  assert.equal(isStagingHost('evil-epbfpro-site-staging.pages.dev'), false);
  assert.equal(isStagingHost('a.epbfpro-site-staging.pages.dev'), true);
  assert.equal(isStagingHost('epbfpro-site-staging.pages.dev'), true);
  assert.equal(isStagingHost('pensoia.com'), false);
});
