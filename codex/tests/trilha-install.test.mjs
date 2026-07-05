// "Salvar como app" (PWA install) — pure detection helpers + i18n parity.
// The DOM card (initInstallPrompt) is verified on staging; here we pin only the
// pure branch logic that decides WHETHER to offer an install, plus key parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isStandalone, isIosSafari } from '../trilha/js/install-prompt.js';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

test('isStandalone: true via display-mode or navigator.standalone, false otherwise', () => {
  assert.equal(isStandalone({ navigator: {}, matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isStandalone({ navigator: { standalone: true } }), true);
  assert.equal(isStandalone({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isStandalone(undefined), false);
});

test('isIosSafari: only real iOS Safari (and iPadOS), never other iOS browsers or in-app webviews', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  assert.equal(isIosSafari({ userAgent: iphone }), true);
  assert.equal(isIosSafari({ userAgent: ipad, maxTouchPoints: 5 }), true, 'iPadOS masquerades as Mac');
  assert.equal(isIosSafari({ userAgent: ipad, maxTouchPoints: 0 }), false, 'real Mac desktop is not iOS');
  // Chrome / Firefox / in-app webviews on iOS cannot Add to Home Screen.
  assert.equal(isIosSafari({ userAgent: iphone.replace('Safari/604.1', 'CriOS/126 Safari/604.1') }), false);
  assert.equal(isIosSafari({ userAgent: iphone + ' Instagram 300' }), false);
  // Android Chrome uses the native prompt, not this hint.
  assert.equal(isIosSafari({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' }), false);
});

test('install.* i18n keys exist in BOTH pt and en (module contract parity)', () => {
  const src = read('../trilha/i18n.js');
  const keys = ['install.pill', 'install.cta_title', 'install.cta_desc', 'install.btn', 'install.ios_hint', 'install.dismiss'];
  for (const k of keys) {
    const hits = src.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || [];
    assert.ok(hits.length >= 2, `key ${k} must appear in both pt and en (found ${hits.length})`);
  }
});
