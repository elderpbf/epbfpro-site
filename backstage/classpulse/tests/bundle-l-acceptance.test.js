// Bundle L acceptance tests — ClassVault + ClassPulse improvements.
// Covers:
//   Item 1: topbar pin when no aula selected (ClassVault focus mode).
//   Item 2: REVERTED. Bundle L's iframe/Live-tab approach was rolled back per
//           Elder's feedback. Sessões click navigates to host.html (old flow).
//           Bundle M will redesign Sessões as sidebar+content later.
//   Item 3: auth return-URL capture + proactive refresh + sair-no-popup fix.
//   Item 4: Configurações moved into SettingsDrawer (CPSettings module).
//   Item 5: dark-mode progress bar neutral grey track (in host.html).
//   Item 6: Sessões rename (Ao vivo -> Sessões).
//
// Run: node "C:/Users/Elder/Google Drive Streaming/My Drive/Archive/Tech/Dev/PensoIA/Site/backstage/classpulse/tests/bundle-l-acceptance.test.js"

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

// ── Item 2: REVERTED ────────────────────────────────────────────────────────
// Bundle L's iframe/Live-tab approach was reverted per Elder's feedback. The
// host page stays a separate full-page surface; Sessões panel uses the old
// click-to-navigate flow. Bundle M will redesign Sessões as sidebar+content
// with no separate host URL.

test('cp-host.js does NOT exist (iframe wrapper reverted)', () => {
  const exists = fs.existsSync(path.join(ROOT, 'backstage/classpulse/js/cp-host.js'));
  assert.ok(!exists, 'backstage/classpulse/js/cp-host.js should be deleted');
});

test('classpulse index.html does NOT contain a panel-live div', () => {
  const src = read('backstage/classpulse/index.html');
  assert.ok(!/id=["']panel-live["']/.test(src), 'panel-live div should be removed from classpulse/index.html');
});

test('classpulse index.html does NOT reference cp-host.js or CPHost.mount', () => {
  const src = read('backstage/classpulse/index.html');
  assert.ok(!/cp-host\.js/.test(src), 'cp-host.js script tag should be removed');
  assert.ok(!/CPHost\.mount\(/.test(src), 'CPHost.mount call should be removed');
});

test('backstage-topbar.js CODEX_SUBTABS.perguntas does NOT include a live key entry', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const perguntasBlock = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(perguntasBlock, 'CODEX_SUBTABS.perguntas block not found');
  assert.ok(!/key:\s*['"]live['"]/.test(perguntasBlock[1]),
    'live key should be removed from perguntas sub-tabs');
});

test('backstage-topbar.js does NOT reference cp_active_session_code or _withLiveEntry', () => {
  const src = read('backstage/js/backstage-topbar.js');
  assert.ok(!/cp_active_session_code/.test(src), 'cp_active_session_code reference should be removed');
  assert.ok(!/_withLiveEntry/.test(src), '_withLiveEntry helper should be removed');
});

test('classpulse index.html session-click navigates via location.href (old behavior restored)', () => {
  const src = read('backstage/classpulse/index.html');
  assert.match(src, /location\.href\s*=\s*['"]host\.html\?code=/,
    'session click should navigate via location.href to host.html');
  assert.ok(!/openSessionLive/.test(src), 'openSessionLive helper should be removed');
  assert.ok(!/restoreLiveIfActive/.test(src), 'restoreLiveIfActive helper should be removed');
});

test('Sessões sub-tab label is "Sessões" (renamed from "Ao vivo")', () => {
  const src = read('backstage/js/backstage-topbar.js');
  const perguntasBlock = src.match(/perguntas:\s*\[([\s\S]*?)\]/);
  assert.ok(perguntasBlock, 'CODEX_SUBTABS.perguntas block not found');
  assert.match(perguntasBlock[1], /label:\s*['"]Sess[oõ]es['"]/, 'first perguntas sub-tab should be labeled Sessões');
});

test('host.html marks Sessões (ao-vivo) as the active sub-tab', () => {
  const src = read('backstage/classpulse/host.html');
  // First-arg can contain parens (e.g. document.getElementById(...)); match
  // across them up to the statement terminator.
  assert.match(src, /renderSubTabsInto\([^;]*['"]perguntas['"]\s*,\s*['"]ao-vivo['"]/,
    'host.html should mark ao-vivo (Sessões) as the active sub-tab');
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

// ── Item 5: Progress bar track consolidated in shared-components.css ────────
// Single source of truth for .bar-track / .rb-track / .qr-bar-track so host,
// display, trilha, and any future surface render identically. Neutral-alpha
// track (rgba(0,0,0,0.08) light, rgba(255,255,255,0.08) dark) gives clear
// hue contrast against the teal fill in both themes.

test('shared-components.css consolidates .bar-track, .rb-track, .qr-bar-track in one selector list', () => {
  const src = read('backstage/css/shared-components.css');
  assert.match(src, /\.bar-track\s*,\s*\.rb-track\s*,\s*\.qr-bar-track\s*\{/,
    'shared-components.css should declare all three track classes together');
});

test('shared-components.css light-mode track uses neutral dark-on-light alpha', () => {
  const src = read('backstage/css/shared-components.css');
  // Match the consolidated rule and confirm rgba(0,0,0,0.08) inside.
  const block = src.match(/\.bar-track\s*,\s*\.rb-track\s*,\s*\.qr-bar-track\s*\{([^}]*)\}/);
  assert.ok(block, 'consolidated track rule not found');
  assert.match(block[1], /background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.08\s*\)/,
    'track background should be rgba(0,0,0,0.08) in light mode');
});

test('shared-components.css dark-mode override uses neutral light-on-dark alpha', () => {
  const src = read('backstage/css/shared-components.css');
  assert.match(src, /\[data-theme=["']dark["']\]\s*\.bar-track[^}]*\.qr-bar-track\s*\{[\s\S]*?rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/,
    'dark-mode track override should use rgba(255,255,255,...) and cover all three classes');
});

test('shared-components.css consolidates .bar-fill, .rb-fill, .qr-bar-fill in one selector list', () => {
  const src = read('backstage/css/shared-components.css');
  assert.match(src, /\.bar-fill\s*,\s*\.rb-fill\s*,\s*\.qr-bar-fill\s*\{/,
    'shared-components.css should declare all three fill classes together');
});

test('question-types.css does NOT carry its own .qr-bar-track background', () => {
  const src = read('backstage/css/question-types.css');
  // The standalone "background:" inside .qr-bar-track must be gone (shared handles it).
  assert.ok(
    !/\.qr-bar-track\s*\{[^}]*background\s*:/.test(src),
    '.qr-bar-track in question-types.css should not set its own background (consolidated to shared-components)'
  );
});

test('question-types.css does NOT carry the teal .qr-host .qr-bar-track background override', () => {
  const src = read('backstage/css/question-types.css');
  assert.ok(
    !/\.qr-host\s+\.qr-bar-track\s*\{[^}]*rgba\(\s*20\s*,\s*184\s*,\s*166/.test(src),
    'qr-host .qr-bar-track teal background override should be removed (track styling is shared now)'
  );
});

test('host.html does NOT carry inline .rb-track background (uses shared rule)', () => {
  const src = read('backstage/classpulse/host.html');
  // The inline <style> may still set height/border-radius overrides, but NOT background.
  const block = src.match(/\s\.rb-track\s*\{([^}]*)\}/);
  assert.ok(block, 'host.html should still declare .rb-track for size override');
  assert.ok(!/background\s*:/.test(block[1]),
    'host.html inline .rb-track should NOT set background anymore (shared rule handles it)');
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
