// Source-contract test for the ported landing (node --test, zero-dep).
// Asserts the /port deviations held: plp- prefix everywhere, mock classes gone,
// no inline logic in HTML, i18n key parity across pt/en/es, copied values present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

test('demos: offer-section phones are static stills, theme-swapped like the logo', () => {
  const h = read('index.html');
  for (const c of ['id="pulseStill"', 'id="trailStill"', 'class="plp-app-frame plp-app-still"'])
    assert.ok(h.includes(c), 'index missing ' + c);
  for (const bad of ['id="pulseFrame"', 'id="trailFrame"', 'plp-app-scale', 'plp-captab', 'id="pulseTab"', 'id="trailTab"'])
    assert.ok(!h.includes(bad), 'index still has stale live-demo piece ' + bad);

  // ui.js swaps the still <img> src per theme, same pattern as the logo.
  const ui = read('js/ui.js');
  assert.ok(ui.includes('applyDemoStills') && ui.includes('DEMO_STILLS'), 'ui.js must theme-swap the demo stills');
  assert.ok(!ui.includes('plpStep') && !ui.includes('initCaptionTabs'), 'the retired step-caption wiring must be gone');

  // main.js no longer boots the live iframe demo.
  const m = read('js/main.js');
  assert.ok(!m.includes('./demos.js') && !m.includes('initDemos'), 'main.js must not wire the live demo anymore');

  for (const img of ['images/demo-pulso-light.png', 'images/demo-pulso-dark.png', 'images/demo-trilha-light.png', 'images/demo-trilha-dark.png'])
    assert.ok(existsSync(join(root, img)), 'missing still ' + img);
});

// demos.js / frame-pulso.js / frame-trail.js / frame-demo-shared.js are UNWIRED from
// index.html but stay in the repo (used to capture the stills above, and as the base for
// reviving a live demo later). Assert the piece that keeps THAT reuse honest: the real
// Codex modules, driven via the callWorker seam, never rebuilt app markup.
test('demos (dormant): frame drivers still mount the REAL app, never rebuild markup', () => {
  const d = read('js/demos.js');
  assert.ok(d.includes('srcdoc') && d.includes('pulseFrame') && d.includes('trailFrame'), 'demos.js must set srcdoc on both frames');
  const fp = read('js/frame-pulso.js');
  assert.ok(fp.includes('/codex/trilha/js/nexo-answer.js') && fp.includes('window.callWorker'), 'frame-pulso must drive the real nexo-answer via callWorker');
  const ft = read('js/frame-trail.js');
  assert.ok(ft.includes('/codex/trilha/js/page.js') && ft.includes('window.callWorker'), 'frame-trail must boot the real trilha page via callWorker');
  for (const re of [/buildAulaRow/, /renderBarChart/, /cdx-qr-bar-fill/, /cdx-qr-option-letter/])
    assert.ok(!re.test(fp + ft + d), 'frame drivers / demos must not rebuild app markup');
  assert.ok(!/\.scrollIntoView\(|\.scrollTo\(/.test(ft), 'frame-trail must not scroll the page');
});

test('css: the landing carries NO copy of the app stylesheets', () => {
  // Until 2026-08-26 landing.css held ~100 rules hand-copied from codex/**.css to dress a live
  // demo iframe. A srcdoc iframe never inherits the parent's CSS, the frames link the real files
  // themselves (js/demos.js), and the demos are unwired anyway, so those rules matched nothing in
  // any document that loads this stylesheet. A copy that styles nothing still drifts from the
  // original and still gets maintained by hand, which is the whole reason this guard exists.
  const c = read('css/landing.css');
  for (const prefix of ['.cdx-', '.cp-qa-', '.ph-', '.tr-modal', '.tr-btn', '.tr-tarefa', '.ct-']) {
    assert.ok(!c.includes(prefix), 'app CSS copied back into landing.css: ' + prefix);
  }
  // The phones are stills; the wrapper and the scoped tokens are the landing's own.
  assert.ok(c.includes('.plp-app-still'), 'the still-image phone rule must stay');
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

test('orb: idle motion is a constant-speed glide, and the pointer only drives inside the hero', () => {
  const orb = read('js/orb.js');
  // Constant-speed glide replaced the old ease-to-a-random-point wander (erratic + fast).
  assert.ok(/GLIDE_SPEED/.test(orb), 'constant-speed glide (GLIDE_SPEED) missing');
  assert.ok(/function tickGlide\(/.test(orb), 'tickGlide missing');
  assert.ok(!/stepWanderTarget|tickWander/.test(orb), 'the old erratic wander is still present');
  // The pointer only DRIVES the orb while over the box (overHero); in stay/leap the orb freezes +
  // hides when the pointer leaves (out the bottom / any edge) instead of shooting to the top.
  assert.ok(/overHero/.test(orb), 'pointer-over-box gating (overHero) missing');
  assert.ok(/!overHero[\s\S]{0,90}return \{ x: sx, y: sy \}/.test(orb), 'stay/leap freeze-on-leave missing');
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
  for (const mod of ['./orb.js', './ui.js', './i18n.js', './theme.js', './orb-settings.js'])
    assert.ok(m.includes(mod), 'main missing import ' + mod);
});
