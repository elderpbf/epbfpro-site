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

// The hero-extension design (contract-by-source; the live DOM is verified on staging).
test('install-prompt renders the joined hero bar + the questions pill', () => {
  const src = read('../trilha/js/install-prompt.js');
  assert.match(src, /cdx-install-bar/, 'the invite mounts as the hero-extension bar');
  assert.match(src, /cdx-install-joined/, 'it joins the hero into one box');
  assert.match(src, /cdx-install-qpill/, 'it mounts the questions-state pill');
});

// The live-question swap is pure CSS keyed off a single body class, so there is no ordering
// race with nexo: nexo owns the class; trilha.css owns the bar<->pill swap. Pin both ends.
test('nexo toggles body.cdx-tr-live and trilha.css swaps bar<->pill off it', () => {
  const nexo = read('../trilha/js/nexo.js');
  assert.match(nexo, /classList\.add\('cdx-tr-live'\)/, 'nexo adds the live class on mount');
  assert.match(nexo, /classList\.remove\('cdx-tr-live'\)/, 'nexo removes it on unmount');
  const css = read('../trilha/css/trilha.css');
  assert.match(css, /body\.cdx-tr-live\s+\.cdx-install-bar\s*\{\s*display:\s*none/, 'live hides the bar');
  assert.match(css, /body\.cdx-tr-live\s+\.cdx-install-qpill\s*\{\s*display:\s*inline-flex/, 'live shows the pill');
});
