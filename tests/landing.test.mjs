// Source-contract test for the ported landing (node --test, zero-dep).
// Asserts the /port deviations held: plp- prefix everywhere, mock classes gone,
// no inline logic in HTML, i18n key parity across pt/en/es, copied values present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const keysOf = src => [...src.matchAll(/"([a-z][a-z0-9.]*)"\s*:/g)].map(m => m[1]).sort();

test('index.html: ported to plp- classes, mock classes gone', () => {
  const h = read('index.html');
  for (const c of ['plp-hero', 'plp-about', 'plp-cards', 'plp-card', 'plp-xp', 'plp-contact', 'plp-cert-card', 'plp-hl'])
    assert.ok(h.includes(c), 'missing ' + c);
  for (const bad of ['class="hero"', 'class="card reveal"', 'class="contact"', 'id="finBtn"'])
    assert.ok(!h.includes(bad), 'should not contain ' + bad);
});

test('index.html: structure only (module boot + consent + JSON-LD, no inline logic)', () => {
  const h = read('index.html');
  assert.ok(h.includes('<script type="module" src="js/main.js'), 'module boot missing');
  assert.ok(h.includes('js/consent.js'), 'consent missing');
  assert.ok(h.includes('css/landing.css'), 'landing css link missing');
  assert.ok(!h.includes('const I18N'), 'inline i18n leaked into HTML');
  assert.ok(!h.includes('function('), 'inline JS logic leaked into HTML');
});

test('css: plp- prefix, danger token, dev marker', () => {
  const c = read('css/landing.css');
  assert.ok(c.includes('.plp-hero{'), '.plp-hero rule missing');
  assert.ok(!/\n\.hero\{/.test('\n' + c), 'bare .hero rule present');
  assert.ok(c.includes('--danger'), '--danger token missing');
  assert.ok(c.includes('.plp-dev-only'), 'dev marker missing');
});

test('i18n: pt/en/es share the exact same key set', () => {
  const pt = keysOf(read('i18n/pt.js'));
  const en = keysOf(read('i18n/en.js'));
  const es = keysOf(read('i18n/es.js'));
  assert.deepEqual(en, pt, 'EN keys differ from PT');
  assert.deepEqual(es, pt, 'ES keys differ from PT');
});

test('i18n: copied PT values present (agnostic + 1st person)', () => {
  const pt = read('i18n/pt.js');
  assert.ok(pt.includes('"ab.s1n": "700+"'));
  assert.ok(pt.includes('"ab.s3n": "Diversos"'));
  assert.ok(pt.includes('órgãos públicos e escritórios já atendidos'));
  assert.ok(pt.includes('O que eu ofereço'));
});

test('orb engine + settings + boot wired', () => {
  const orb = read('js/orb.js');
  assert.ok(orb.includes('export function initOrb'), 'initOrb missing');
  assert.ok(orb.includes('descendTarget'), 'descendTarget missing');
  assert.ok(orb.includes('getSettings'), 'orb not reading settings');
  assert.ok(orb.includes('plp-hl'), 'orb not targeting plp-hl');
  const s = read('js/orb-settings.js');
  assert.ok(s.includes('export function getSettings'), 'getSettings missing');
  assert.ok(s.includes('DEFAULTS'), 'DEFAULTS missing');
  const m = read('js/main.js');
  for (const mod of ['./orb.js', './demos.js', './ui.js', './i18n.js', './theme.js', './orb-settings.js'])
    assert.ok(m.includes(mod), 'main missing import ' + mod);
});
