// codex/tests/trilha-push-subscribe.test.mjs
// track-44 Etapa B — push subscription lifecycle. Only the PURE parts are unit-testable here
// (urlBase64ToUint8Array, bufferToBase64Url, isPushSupported, pushAvailability); the
// imperative Notification/PushManager/ServiceWorkerRegistration glue (subscribePush /
// unsubscribePush) is browser-only and verified on staging, same precedent as
// install-prompt.js's registerSW/render (see trilha-install.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  urlBase64ToUint8Array, bufferToBase64Url, isPushSupported, pushAvailability,
} from '../trilha/js/push-subscribe.js';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

test('urlBase64ToUint8Array: a VAPID public key decodes to the 65-byte uncompressed EC point', () => {
  // A real VAPID public key (generated for this test, not tied to any live account): base64url
  // of an uncompressed P-256 point, which always starts with 0x04 and is exactly 65 bytes.
  const key = 'BNJSXwjttv1_ydUJ_cBDyIETXFeDVkJ-CXVNKcWoyOgZBWxLI6o5u2VGmD5QxjZLBP_7qJpOseFtTF0nmkQ73ds';
  const bytes = urlBase64ToUint8Array(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
});

test('urlBase64ToUint8Array handles unpadded base64url (no trailing =)', () => {
  // 'auth' secrets are 16 raw bytes -> 22 base64 chars with no padding needed by base64url,
  // but shorter/odd-length inputs DO need padding restored before atob() will accept them.
  const bytes = urlBase64ToUint8Array('LF9g7q1k6pRrLf4mPwtY2w');
  assert.equal(bytes.length, 16);
});

test('bufferToBase64Url round-trips through urlBase64ToUint8Array', () => {
  const original = new Uint8Array([4, 1, 2, 3, 255, 0, 128, 17, 99]);
  const encoded = bufferToBase64Url(original.buffer);
  assert.doesNotMatch(encoded, /[+/=]/, 'must be URL-safe: no +, /, or padding =');
  const decoded = urlBase64ToUint8Array(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test('isPushSupported: true only when serviceWorker + PushManager + Notification all exist', () => {
  assert.equal(isPushSupported({ PushManager: {}, Notification: {} }, { serviceWorker: {} }), true);
  assert.equal(isPushSupported({ PushManager: {} }, { serviceWorker: {} }), false, 'missing Notification');
  assert.equal(isPushSupported({ PushManager: {}, Notification: {} }, {}), false, 'missing serviceWorker');
  assert.equal(isPushSupported(undefined, undefined), false);
});

// UA strings mirrored from trilha-install.test.mjs so both modules agree on what counts as
// "real iOS Safari" (they share install-prompt.js's isIosSafari).
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';

function fakeWin({ ua, standalone = false, hasApis = true } = {}) {
  return {
    navigator: { userAgent: ua, standalone, serviceWorker: hasApis ? {} : undefined },
    matchMedia: () => ({ matches: false }),
    PushManager: hasApis ? {} : undefined,
    Notification: hasApis ? {} : undefined,
  };
}

test('pushAvailability: Android/desktop Chrome is capable regardless of install state', () => {
  const win = fakeWin({ ua: ANDROID_CHROME_UA });
  assert.deepEqual(pushAvailability(win, win.navigator), { capable: true, needsInstall: false });
});

test('pushAvailability: iOS Safari NOT installed -> needsInstall (Apple only delivers push to an installed PWA)', () => {
  const win = fakeWin({ ua: IPHONE_UA, standalone: false });
  assert.deepEqual(pushAvailability(win, win.navigator), { capable: false, needsInstall: true });
});

test('pushAvailability: iOS Safari installed (standalone) -> capable', () => {
  const win = fakeWin({ ua: IPHONE_UA, standalone: true });
  assert.deepEqual(pushAvailability(win, win.navigator), { capable: true, needsInstall: false });
});

test('pushAvailability: a browser without the push APIs is neither capable nor needsInstall', () => {
  const win = fakeWin({ ua: ANDROID_CHROME_UA, hasApis: false });
  assert.deepEqual(pushAvailability(win, win.navigator), { capable: false, needsInstall: false });
});

test('push-subscribe.js reuses install-prompt.js\'s isStandalone/isIosSafari (no reimplementation)', () => {
  const src = read('../trilha/js/push-subscribe.js');
  assert.match(src, /from '\.\/install-prompt\.js'/, 'must import, not redefine, the iOS/standalone detection');
});

test('nchan.push_* i18n keys exist in BOTH pt and en (module contract parity)', () => {
  const src = read('../trilha/i18n.js');
  const keys = ['nchan.push_ios_hint', 'nchan.push_denied', 'nchan.push_subscribe_failed'];
  for (const k of keys) {
    const hits = src.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || [];
    assert.ok(hits.length >= 2, `key ${k} must appear in both pt and en (found ${hits.length})`);
  }
});

// trilha/sw.js lives at the SITE ROOT (not under codex/) — see its own header comment. The
// handshake with codex-api/src/channels/push.js is a shared payload shape neither side's test
// suite can check across repos, so this pins the CONTRACT literally by source: sw.js must
// read title/body/data.json() the same way push.js writes them.
test('trilha/sw.js: push + notificationclick handlers, payload contract intact', () => {
  const src = read('../../trilha/sw.js');
  assert.match(src, /addEventListener\('push'/);
  assert.match(src, /showNotification\(/);
  assert.match(src, /event\.data\.json\(\)/);
  assert.match(src, /addEventListener\('notificationclick'/);
  assert.match(src, /event\.notification\.data/, 'must read the deeplink from notification.data.url');
  // The non-caching contract (its own header promise) must survive the push addition.
  assert.match(src, /network-first/i);
  assert.match(src, /OFFLINE_HTML/);
});
