// codex/js/reconnect.js — Codex admin connection watchdog. Raises a reload banner
// when a Worker call fails as a transport error (the network dropped while the tab
// sat idle) and clears it once a call succeeds again. The pure decision (a
// transport failure vs. a deliberate Worker error) is unit-tested here; the DOM
// banner itself is verified in the browser. i18n parity for the banner strings
// and the install wiring are guarded by source assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isConnectivityError } from '../js/reconnect.js';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/reconnect.js'), 'utf8');

// ── isConnectivityError (pure) ───────────────────────────────────────────────
test('isConnectivityError: a dropped network is a connectivity failure', () => {
  assert.equal(isConnectivityError({ error: 'network_error' }), true);
  assert.equal(isConnectivityError({ error: 'body_read_error' }), true);
});

test('isConnectivityError: a deliberate Worker error is NOT connectivity', () => {
  // The server answered, so the connection is fine — these must never raise the banner.
  assert.equal(isConnectivityError({ error: 'invalid status' }), false);
  assert.equal(isConnectivityError({ error: 'unauthorized' }), false);
  assert.equal(isConnectivityError({ error: 'http_500' }), false);
  assert.equal(isConnectivityError({ error: 'json_parse_error' }), false);
});

test('isConnectivityError: missing/empty data is not a failure', () => {
  assert.equal(isConnectivityError(null), false);
  assert.equal(isConnectivityError(undefined), false);
  assert.equal(isConnectivityError({}), false);
});

// ── i18n parity ──────────────────────────────────────────────────────────────
test('reconnect banner strings exist in both dictionaries', () => {
  for (const key of ['net.lost', 'net.reload', 'net.dismiss']) {
    assert.ok(Object.prototype.hasOwnProperty.call(pt, key), 'pt.js missing ' + key);
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), 'en.js missing ' + key);
  }
});

// ── DOM/install contract (source assertions) ─────────────────────────────────
test('reconnect banner is screen-reader friendly and offers a reload', () => {
  assert.match(SRC, /role['"]?,\s*['"]alert['"]/, 'banner announces itself (role=alert)');
  assert.match(SRC, /location\.reload\(\)/, 'reload button reloads the page');
  assert.match(SRC, /cdx-reconnect/, 'uses the cdx-reconnect style contract');
});

test('install wires the transport hook and the browser connectivity events', () => {
  assert.match(SRC, /window\.cdxNet\s*=/, 'installs the window.cdxNet transport hook');
  assert.match(SRC, /addEventListener\(['"]online['"]/, 'clears on browser online');
  assert.match(SRC, /addEventListener\(['"]offline['"]/, 'raises on browser offline');
});
