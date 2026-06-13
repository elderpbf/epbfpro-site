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
