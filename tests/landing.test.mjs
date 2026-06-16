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

test('demos: both phones embed the real Codex app in place (srcdoc iframes, no rebuild)', () => {
  const h = read('index.html');
  for (const c of ['plp-app-scale', 'id="pulseFrame"', 'id="trailFrame"', 'class="plp-app-frame"'])
    assert.ok(h.includes(c), 'index missing ' + c);
  for (const bad of ['id="pulseApp"', 'id="trailApp"', '/codex/demo/', 'plp-demo-pulse', 'plp-demo-trail', 'plp-pulso', 'id="trPhone"', 'id="thBar"', 'id="trCap"'])
    assert.ok(!h.includes(bad), 'index still has stale demo ' + bad);

  // demos.js builds srcdoc iframes that link the REAL Codex CSS + the landing frame drivers.
  const d = read('js/demos.js');
  assert.ok(d.includes('srcdoc') && d.includes('pulseFrame') && d.includes('trailFrame'), 'demos.js must set srcdoc on both frames');
  for (const link of ['/codex/questions/questions.css', '/codex/trilha/css/nexo.css', '/codex/trilha/css/cards.css', '/codex/trilha/css/tarefa-modal.css'])
    assert.ok(d.includes(link), 'demos.js srcdoc missing real CSS ' + link);

  // The frame drivers mount the REAL modules via the callWorker seam, never rebuild markup.
  const fp = read('js/frame-pulso.js');
  assert.ok(fp.includes('/codex/trilha/js/nexo-answer.js') && fp.includes('window.callWorker'), 'frame-pulso must drive the real nexo-answer via callWorker');
  const ft = read('js/frame-trail.js');
  assert.ok(ft.includes('/codex/trilha/js/page.js') && ft.includes('window.callWorker'), 'frame-trail must boot the real trilha page via callWorker');
  for (const re of [/buildAulaRow/, /renderBarChart/, /cdx-qr-bar-fill/, /cdx-qr-option-letter/])
    assert.ok(!re.test(fp + ft + d), 'frame drivers / demos must not rebuild app markup');
});

test('demos: caption tab on top of each phone, driven by the step() postMessage seam', () => {
  const h = read('index.html');
  for (const c of ['id="pulseTab"', 'id="trailTab"', 'plp-captab', 'plp-captab-segs', 'plp-captab-txt'])
    assert.ok(h.includes(c), 'index missing caption tab piece ' + c);

  // The shared module posts the beat to the landing; the in-iframe pill is gone.
  const sh = read('js/frame-demo-shared.js');
  assert.ok(/export function step/.test(sh) && sh.includes('plpStep') && sh.includes('parent.postMessage'),
    'frame-demo-shared must post {plpStep} to the parent');
  assert.ok(!/export function caption/.test(sh), 'the in-iframe caption pill must be gone');

  // Both drivers emit beats via step(i, total, label).
  for (const f of ['js/frame-pulso.js', 'js/frame-trail.js'])
    assert.ok(/step\(\d+,\s*\d+,/.test(read(f)), f + ' must call step(i, total, label)');

  // The landing routes plpStep to the right phone and draws the segmented bar.
  const ui = read('js/ui.js');
  assert.ok(ui.includes('plpStep') && ui.includes('contentWindow') && ui.includes('plp-captab-segs'),
    'ui.js must route plpStep to the matching tab');

  // The Trilha camera never CALLS scrollIntoView/scrollTo (those hijack the landing);
  // it pans via transform. Match calls (with a paren) so the cautionary comment is fine.
  const ft = read('js/frame-trail.js');
  assert.ok(!/\.scrollIntoView\(|\.scrollTo\(/.test(ft), 'frame-trail must not scroll the page');
});

test('index.html: structure only (module boot + JSON-LD, no inline logic)', () => {
  const h = read('index.html');
  assert.ok(h.includes('<script type="module" src="js/main.js'), 'module boot missing');
  assert.ok(!h.includes('<script src="js/consent.js'), 'consent banner should not be loaded (no tracking cookies)');
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
