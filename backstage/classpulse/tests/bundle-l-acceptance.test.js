// Bundle L acceptance tests — ClassVault + ClassPulse improvements.
// Covers: topbar pin when no aula selected (Item 1), Perguntas Live sub-tab
// and CPHost extraction (Item 2), auth return-URL + proactive refresh (Item 3),
// Configurações moved into SettingsDrawer (Item 4), and dark-mode progress bar
// contrast in cp-host.js (Item 5).
//
// Run: node "C:/Users/Elder/Google Drive Streaming/My Drive/Archive/Tech/Dev/PensoIA/Site/backstage/classpulse/tests/bundle-l-acceptance.test.js"
// All tests must FAIL before the implementation lands (red phase).

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Lazy read: returns source or empty string if file does not exist yet.
function tryRead(p) {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; }
}

const tests = [];
const test  = (name, fn) => tests.push({ name, fn });

// ── Item 1: Aula topbar pin when empty ──────────────────────────────────────

test('classvault.js defines _updateTopbarPin function', () => {
  const src = read('backstage/classvault/js/classvault.js');
  assert.match(src, /function\s+_updateTopbarPin\s*\(/, '_updateTopbarPin function declaration not found');
});

test('classvault.js toggles cv-topbar-pin class on document.body', () => {
  const src = read('backstage/classvault/js/classvault.js');
  // Accept toggle with optional second arg, or add/remove calls.
  assert.match(src, /classList\.(add|toggle|remove)\(['"]cv-topbar-pin['"]/, 'cv-topbar-pin classList toggle not found');
});

test('classvault.css has a rule forcing .bs-topbar visible when both .cv-focus and .cv-topbar-pin are on body', () => {
  const src = read('backstage/classvault/css/classvault.css');
  assert.match(src, /body\.cv-focus\.cv-topbar-pin\s+\.bs-topbar/, 'body.cv-focus.cv-topbar-pin .bs-topbar rule not found');
});

test('_updateTopbarPin is invoked at least twice in classvault.js (definition + 2+ calls)', () => {
  const src = read('backstage/classvault/js/classvault.js');
  const matches = (src.match(/_updateTopbarPin\(/g) || []);
  assert.ok(matches.length >= 3, '_updateTopbarPin( found ' + matches.length + ' times; expected >= 3 (1 def + 2 calls)');
});

// ── Item 2: Perguntas Live sub-tab + host module extraction ─────────────────

test('cp-host.js file exists', () => {
  const exists = fs.existsSync(path.join(ROOT, 'backstage/classpulse/js/cp-host.js'));
  assert.ok(exists, 'backstage/classpulse/js/cp-host.js does not exist');
});

test('cp-host.js declares window.CPHost with mount and unmount', () => {
  const src = tryRead('backstage/classpulse/js/cp-host.js');
  assert.match(src, /window\.CPHost\s*=/, 'window.CPHost not declared in cp-host.js');
  assert.match(src, /mount\s*:/, 'mount property not found in CPHost');
  assert.match(src, /unmount\s*:/, 'unmount property not found in CPHost');
});

test('host.html calls CPHost.mount(', () => {
  const src = read('backstage/classpulse/host.html');
  assert.match(src, /CPHost\.mount\(/, 'CPHost.mount( call not found in host.html');
});

test('classpulse index.html contains a panel-live div', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /id=["']panel-live["']/, 'id="panel-live" not found in classpulse/index.html');
});

test('classpulse index.html references CPHost.mount( in sub-tab routing', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /CPHost\.mount\(/, 'CPHost.mount( not referenced in classpulse/index.html');
});

test('backstage-topbar.js CODEX_SUBTABS.perguntas includes a live key entry', () => {
  const src = read('backstage/js/backstage-topbar.js');
  // Locate the perguntas subtabs block then check for live key inside it.
  const perguntasBlock = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(perguntasBlock, 'CODEX_SUBTABS.perguntas block not found');
  assert.match(perguntasBlock[1], /key:\s*['"]live['"]/, 'live key not found in perguntas sub-tabs');
});

test('classpulse.css or index.html hides the Live sub-tab unless cp-session-open is on body', () => {
  const cssSrc = tryRead('backstage/css/classpulse.css');
  const idxSrc = read('backstage/classpulse/index.html');
  const combined = cssSrc + idxSrc;
  assert.ok(
    /cp-session-open/.test(combined),
    'cp-session-open not referenced in classpulse.css or index.html (Live sub-tab visibility guard missing)'
  );
});

// ── Item 3: Auth return-URL capture + proactive silent refresh ───────────────

test('auth.js writes bs_auth_return to sessionStorage', () => {
  const src = read('backstage/js/auth.js');
  assert.match(src, /sessionStorage\.setItem\(['"]bs_auth_return['"]/, 'sessionStorage.setItem(bs_auth_return) not found in auth.js');
});

test('auth.js captures location.pathname (and location.search or href) near the bs_auth_return write', () => {
  const src = read('backstage/js/auth.js');
  // Accept either pathname+search combo or href
  const hasPathname = /location\.pathname/.test(src);
  const hasSearch   = /location\.search/.test(src);
  const hasHref     = /location\.href/.test(src);
  assert.ok(hasHref || (hasPathname && hasSearch),
    'auth.js does not capture location.pathname+search or location.href for return-URL');
});

test('backstage/index.html reads and removes sessionStorage bs_auth_return after login', () => {
  const src = read('backstage/index.html');
  assert.match(src, /sessionStorage\.getItem\(['"]bs_auth_return['"]\)/,
    'sessionStorage.getItem(bs_auth_return) not found in backstage/index.html');
  assert.match(src, /sessionStorage\.removeItem\(['"]bs_auth_return['"]\)/,
    'sessionStorage.removeItem(bs_auth_return) not found in backstage/index.html');
});

test('bs-google.js contains a setInterval for proactive token refresh', () => {
  const src = read('backstage/js/bs-google.js');
  assert.match(src, /setInterval\(/, 'setInterval not found in bs-google.js');
  // Confirm the setInterval is tied to token refresh logic (not just any interval)
  const hasScheduleRefresh = /function\s+\w*[Rr]efresh\w*\s*\(/.test(src) || /[Pp]roactive/.test(src) || /_scheduleRefresh/.test(src);
  assert.ok(hasScheduleRefresh, 'no proactive/refresh-related function or label near setInterval in bs-google.js');
});

test('bs-google.js defines a proactive refresh function by name or label', () => {
  const src = read('backstage/js/bs-google.js');
  const hasNamedRefresh = /function\s+\w*[Rr]efresh\w*\s*\(/.test(src);
  const hasProactive    = /[Pp]roactive\w*\s*[:=]/.test(src) || /_scheduleRefresh/.test(src) || /_proactiveRefresh/.test(src);
  assert.ok(hasNamedRefresh || hasProactive,
    'no named refresh function or proactive refresh label found in bs-google.js');
});

// ── Item 4: Configurações moved into SettingsDrawer ─────────────────────────

test('classpulse index.html does NOT contain id="tab-settings"', () => {
  const src = read('backstage/classpulse/index.html');
  assert.ok(!/id=["']tab-settings["']/.test(src),
    'id="tab-settings" still present in classpulse/index.html (should be removed)');
});

test('classpulse index.html does NOT contain id="panel-settings"', () => {
  const src = read('backstage/classpulse/index.html');
  assert.ok(!/id=["']panel-settings["']/.test(src),
    'id="panel-settings" still present in classpulse/index.html (should be removed)');
});

test('cp-settings-section.js file exists', () => {
  const exists = fs.existsSync(path.join(ROOT, 'backstage/classpulse/js/cp-settings-section.js'));
  assert.ok(exists, 'backstage/classpulse/js/cp-settings-section.js does not exist');
});

test('cp-settings-section.js declares window.CPSettings with html and init', () => {
  const src = tryRead('backstage/classpulse/js/cp-settings-section.js');
  assert.match(src, /window\.CPSettings\s*=/, 'window.CPSettings not declared');
  assert.match(src, /html\s*:/, 'html property not found in CPSettings');
  assert.match(src, /init\s*:/, 'init property not found in CPSettings');
});

test('classpulse index.html references CPSettings.html() and CPSettings.init in SettingsDrawer setup', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /CPSettings\.html\(\)/, 'CPSettings.html() not found in classpulse/index.html');
  assert.match(src, /CPSettings\.init/, 'CPSettings.init not found in classpulse/index.html');
});

test('backstage-topbar.js CODEX_SUBTABS.perguntas no longer has a configuracoes key entry', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const perguntasBlock = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(perguntasBlock, 'CODEX_SUBTABS.perguntas block not found');
  assert.ok(!/key:\s*['"]configuracoes['"]/.test(perguntasBlock[1]),
    'configuracoes key still present in CODEX_SUBTABS.perguntas (should be removed)');
});

// ── Item 5: Dark mode progress bar contrast (in cp-host.js) ─────────────────
// host.html's inline styles will move into the extracted cp-host.js module.
// Tests assert the styles land in cp-host.js; that file does not exist yet.

test('cp-host.js rb-track rule does not use teal rgba(20,184,166', () => {
  const src = tryRead('backstage/classpulse/js/cp-host.js');
  // Extract the rb-track block (between .rb-track { and the next })
  const block = src.match(/\.rb-track\s*\{([^}]*)\}/);
  assert.ok(block, '.rb-track rule not found in cp-host.js');
  assert.ok(!/rgba\(\s*20\s*,\s*184\s*,\s*166/.test(block[1]),
    '.rb-track in cp-host.js still uses teal rgba(20,184,166) — must use neutral');
});

test('cp-host.js light-mode rb-track uses neutral dark-on-light background', () => {
  const src = tryRead('backstage/classpulse/js/cp-host.js');
  const block = src.match(/\.rb-track\s*\{([^}]*)\}/);
  assert.ok(block, '.rb-track rule not found in cp-host.js');
  assert.match(block[1], /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/,
    '.rb-track light-mode background does not use rgba(0,0,0,...) neutral');
});

test('cp-host.js dark-mode rb-track override uses neutral light-on-dark background', () => {
  const src = tryRead('backstage/classpulse/js/cp-host.js');
  assert.match(src, /\[data-theme=["']dark["']\]\s*\.rb-track\s*\{[^}]*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/,
    'dark-mode .rb-track in cp-host.js does not use rgba(255,255,255,...) neutral');
});

test('cp-host.js rb-fill still uses var(--primary)', () => {
  const src = tryRead('backstage/classpulse/js/cp-host.js');
  assert.match(src, /\.rb-fill\s*\{[^}]*background:\s*var\(--primary\)/,
    '.rb-fill in cp-host.js does not use background: var(--primary)');
});

// ── Runner ───────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('PASS  ' + t.name);
    pass++;
  } catch (e) {
    console.log('FAIL  ' + t.name);
    console.log('      ' + e.message);
    fail++;
  }
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
