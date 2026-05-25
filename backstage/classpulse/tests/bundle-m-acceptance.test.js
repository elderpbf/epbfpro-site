// Bundle M acceptance tests — Sessões-Teste (parallel host port).
//
// What this asserts:
//   1. New files exist (cp-host-module.css, cp-host-module.js).
//   2. cp-host-module.js exposes CPHostModule.mount with the expected shape.
//   3. cp-host-module.js does NOT have page-level concerns (BS_AUTH.guard, Topbar.init,
//      URLSearchParams 'code' read, location.href redirect).
//   4. backstage-topbar.js adds a Sessões-Teste sub-tab without touching the
//      existing entries.
//   5. classpulse/index.html adds the new panel, loads the new module, bumps
//      cache, and wires the sidebar.
//   6. host.html is unchanged (sha256 + byte-size pin).
//   7. bundle-l-acceptance.test.js still passes (smoke: file untouched).
//
// Run: node "C:/Users/Elder/Google Drive Streaming/My Drive/Archive/Tech/Dev/PensoIA/Site/backstage/classpulse/tests/bundle-m-acceptance.test.js"

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tryRead = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const stat   = (p) => fs.statSync(path.join(ROOT, p));

const tests = [];
const test  = (name, fn) => tests.push({ name, fn });

// ── 1. New files exist ──────────────────────────────────────────────────────

test('cp-host-module.css exists at backstage/classpulse/css/cp-host-module.css', () => {
  assert.ok(exists('backstage/classpulse/css/cp-host-module.css'),
    'expected backstage/classpulse/css/cp-host-module.css to exist');
});

test('cp-host-module.js exists at backstage/classpulse/js/cp-host-module.js', () => {
  assert.ok(exists('backstage/classpulse/js/cp-host-module.js'),
    'expected backstage/classpulse/js/cp-host-module.js to exist');
});

test('cp-host-module.css contains the host-container rule (verbatim copy from host.html style block)', () => {
  const src = read('backstage/classpulse/css/cp-host-module.css');
  assert.match(src, /\.host-container\s*\{/, '.host-container rule missing — did you copy host.html <style> contents?');
  assert.match(src, /\.host-session-bar\s*\{/, '.host-session-bar rule missing');
  assert.match(src, /\.hd-col-left\s*\{/, '.hd-col-left rule missing');
});

test('cp-host-module.css does NOT include literal <style> tags', () => {
  const src = read('backstage/classpulse/css/cp-host-module.css');
  assert.ok(!/<style/i.test(src), 'cp-host-module.css must not wrap rules in <style> tags');
  assert.ok(!/<\/style/i.test(src), 'cp-host-module.css must not contain </style>');
});

test('cp-host-module.css adds the Sessões-Teste panel layout rules', () => {
  const src = read('backstage/classpulse/css/cp-host-module.css');
  assert.match(src, /\.cp-st-layout\s*\{/, '.cp-st-layout rule missing');
  assert.match(src, /\.cp-st-sidebar\s*\{/, '.cp-st-sidebar rule missing');
  assert.match(src, /\.cp-st-sidebar\.is-collapsed/, '.cp-st-sidebar.is-collapsed rule missing');
  assert.match(src, /\.cp-st-session-row/, '.cp-st-session-row rule missing');
});

// ── 2. CPHostModule API shape ─────────────────────────────────────────────────────

test('cp-host-module.js defines window.CPHostModule', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  assert.match(src, /window\.CPHostModule\s*=/, 'window.CPHostModule assignment not found');
});

test('cp-host-module.js declares a mount function on CPHostModule', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  const hasMount =
    /CPHostModule\s*=\s*\{[\s\S]*mount\s*:/.test(src) ||
    /CPHostModule\.mount\s*=/.test(src) ||
    /mount\s*:\s*function\s*\(/.test(src) ||
    /function\s+mount\s*\(/.test(src);
  assert.ok(hasMount, 'no mount function/property found in cp-host-module.js');
});

test('cp-host-module.js mount references rootEl and opts', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  // Accept either positional names or destructuring; sessionCode + authToken must appear
  assert.match(src, /sessionCode/, 'sessionCode reference missing in cp-host-module.js');
  assert.match(src, /authToken/, 'authToken reference missing in cp-host-module.js');
});

test('cp-host-module.js returns a handle with unmount', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  const hasUnmount =
    /unmount\s*:\s*function/.test(src) ||
    /unmount\s*\(\s*\)/.test(src) ||
    /return\s*\{[\s\S]*unmount/.test(src);
  assert.ok(hasUnmount, 'no unmount in cp-host-module.js — mount must return { unmount }');
});

// ── 3. cp-host-module.js has NO page-level concerns ────────────────────────────────

test('cp-host-module.js does NOT call BS_AUTH.guard()', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  assert.ok(!/BS_AUTH\.guard\s*\(/.test(src),
    'cp-host-module.js must not call BS_AUTH.guard() — that is a page-level concern');
});

test('cp-host-module.js does NOT call Topbar.init()', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  assert.ok(!/Topbar\.init\s*\(/.test(src),
    'cp-host-module.js must not call Topbar.init() — page-level');
});

test('cp-host-module.js does NOT call Topbar.renderSubTabsInto()', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  assert.ok(!/Topbar\.renderSubTabsInto\s*\(/.test(src),
    'cp-host-module.js must not paint sub-tabs — the Codex topbar is owned by the host page');
});

test('cp-host-module.js does NOT read URLSearchParams for "code"', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  // Reject any URLSearchParams + 'code' combination
  assert.ok(!/URLSearchParams[\s\S]{0,80}['"]code['"]/.test(src),
    'cp-host-module.js must not read sessionCode from URL — caller passes it via opts');
});

test('cp-host-module.js does NOT redirect via location.href to classpulse', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  assert.ok(!/location\.href\s*=\s*['"][^'"]*\/backstage\/classpulse\//.test(src),
    'cp-host-module.js must not perform a page redirect — that was host.html-level');
});

test('cp-host-module.js scopes DOM access to a root element (rootEl or similar)', () => {
  const src = read('backstage/classpulse/js/cp-host-module.js');
  // Heuristic: at least one querySelector on a parameter named rootEl / root / container / el
  const hasScopedQuery = /(rootEl|root|container|host(El)?)\.querySelector(All)?\s*\(/.test(src);
  assert.ok(hasScopedQuery,
    'cp-host-module.js must scope DOM queries to rootEl.querySelector(...) — bare document.getElementById will collide on multi-mount');
});

// ── 4. Topbar additive insert ───────────────────────────────────────────────

test('backstage-topbar.js CODEX_SUBTABS.perguntas includes ao-vivo-teste entry', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const block = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'CODEX_SUBTABS.perguntas block not found');
  assert.match(block[1], /key:\s*['"]ao-vivo-teste['"]/, 'ao-vivo-teste key missing in perguntas sub-tabs');
  assert.match(block[1], /label:\s*['"]Sess[oõ]es-Teste['"]/, 'Sessões-Teste label missing');
  assert.match(block[1], /\?tab=sessoes-teste/, 'href ?tab=sessoes-teste missing');
});

test('backstage-topbar.js preserves the existing ao-vivo / banco / estatisticas entries', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const block = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(block);
  // Match the original ao-vivo entry: key followed by Sessões label, allowing
  // the comma + whitespace between them. Bounded to a single object literal so
  // we don't accidentally bridge across entries.
  assert.match(block[1], /key:\s*['"]ao-vivo['"][^}]*label:\s*['"]Sess[oõ]es['"][^}]*['"]\/backstage\/classpulse\/['"]/, 'existing ao-vivo entry was modified or removed');
  assert.match(block[1], /key:\s*['"]banco['"]/, 'banco entry missing');
  assert.match(block[1], /key:\s*['"]estatisticas['"]/, 'estatisticas entry missing');
});

test('backstage-topbar.js sub-tab order is Sessões / Sessões-Teste / Banco / Estatísticas', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const block = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(block);
  const inner = block[1];
  const idxAoVivo  = inner.search(/key:\s*['"]ao-vivo['"]/);
  const idxTeste   = inner.search(/key:\s*['"]ao-vivo-teste['"]/);
  const idxBanco   = inner.search(/key:\s*['"]banco['"]/);
  const idxEstat   = inner.search(/key:\s*['"]estatisticas['"]/);
  assert.ok(idxAoVivo >= 0 && idxTeste > idxAoVivo, 'ao-vivo-teste must come after ao-vivo');
  assert.ok(idxBanco > idxTeste, 'banco must come after ao-vivo-teste');
  assert.ok(idxEstat > idxBanco, 'estatisticas must come after banco');
});

// ── 5. classpulse/index.html additive wiring ────────────────────────────────

test('index.html links cp-host-module.css with a cache-busting version', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /cp-host-module\.css\?v=\d+\.\d+/, 'cp-host-module.css link missing or missing ?v= version');
});

test('index.html loads cp-host-module.js with v=1.0', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /cp-host-module\.js\?v=1\.0/, 'cp-host-module.js script missing or wrong version');
});

test('index.html bumps backstage-topbar.js to v=2.5', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /backstage-topbar\.js\?v=2\.5/, 'backstage-topbar.js cache buster not bumped to 2.5');
});

test('index.html contains panel-sessoes-teste div', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /<div\s+class=["']cp-panel["']\s+id=["']panel-sessoes-teste["']/, 'panel-sessoes-teste div missing');
});

test('index.html contains the sidebar markup (cp-st-sidebar + cp-st-session-list + host mount target)', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /id=["']cp-st-sidebar["']/, 'cp-st-sidebar element missing');
  assert.match(src, /id=["']cp-st-session-list["']/, 'cp-st-session-list element missing');
  assert.match(src, /id=["']cp-st-host["']/, 'cp-st-host mount target missing');
  assert.match(src, /id=["']cp-st-collapse-btn["']/, 'cp-st-collapse-btn missing');
  assert.match(src, /id=["']cp-st-expand-btn["']/, 'cp-st-expand-btn missing');
});

test('index.html tab-switch logic recognizes "sessoes-teste"', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /sessoes-teste/, 'index.html script must reference sessoes-teste somewhere (panel id or switch case)');
});

test('index.html references localStorage key cp_sessoes_teste_sidebar', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /cp_sessoes_teste_sidebar/, 'localStorage key for sidebar collapse missing');
});

test('index.html calls CPHostModule.mount with sessionCode + authToken', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /CPHostModule\.mount\s*\(/, 'index.html must call CPHostModule.mount somewhere');
  assert.match(src, /sessionCode\s*:/, 'CPHostModule.mount call must pass sessionCode');
  assert.match(src, /authToken\s*:/, 'CPHostModule.mount call must pass authToken');
});

test('index.html calls handle.unmount() (or similar) before re-mounting', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /\.unmount\s*\(\s*\)/, 'index.html must call unmount() on the previous handle before swapping sessions');
});

test('index.html does NOT touch the existing panel-sessions, panel-banks, panel-global-stats element IDs', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /id=["']panel-sessions["']/, 'panel-sessions must still exist');
  assert.match(src, /id=["']panel-banks["']/, 'panel-banks must still exist');
  assert.match(src, /id=["']panel-global-stats["']/, 'panel-global-stats must still exist');
});

// ── 6. host.html unchanged ──────────────────────────────────────────────────

const HOST_SHA256 = 'f01166cb58b6e3027777d18fcc1af1726fc3f011215124ba9a5c871915934199';
const HOST_BYTES  = 87818;

test('host.html sha256 matches baseline (file is untouched)', () => {
  const buf = fs.readFileSync(path.join(ROOT, 'backstage/classpulse/host.html'));
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  assert.equal(hash, HOST_SHA256, 'host.html sha256 changed — Bundle M MUST NOT modify host.html');
});

test('host.html byte size matches baseline (file is untouched)', () => {
  const size = stat('backstage/classpulse/host.html').size;
  assert.equal(size, HOST_BYTES, 'host.html size changed — Bundle M MUST NOT modify host.html');
});

// ── 7. Smoke: bundle-l-acceptance.test.js untouched ─────────────────────────

test('bundle-l-acceptance.test.js still exists and has not been modified by Bundle M', () => {
  const src = tryRead('backstage/classpulse/tests/bundle-l-acceptance.test.js');
  assert.ok(src.length > 1000, 'bundle-l-acceptance.test.js missing or shrunk — do not delete or rewrite it');
  // Sanity: still asserts the iframe-revert facts from Bundle L.1
  assert.match(src, /cp-host\.js should be deleted/, 'bundle-l test was modified — Bundle M must not edit other test files');
});

// ── Runner ──────────────────────────────────────────────────────────────────

(async function run() {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log('  ✓ ' + t.name);
    } catch (e) {
      fail++;
      console.log('  ✗ ' + t.name);
      console.log('      ' + (e.message || e));
    }
  }
  console.log('\n' + pass + ' pass, ' + fail + ' fail (' + tests.length + ' total)');
  process.exit(fail > 0 ? 1 : 0);
})();
