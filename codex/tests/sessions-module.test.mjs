// Questions tab, increment 2: the Sessions sub-tab (questions/sessions.js).
// RED-first. Covers the tab contract, the hostHref() bridge helper, the shell
// promoting Sessions from a legacy bridge to a NATIVE module, the module source
// rules, and the i18n keys (both dicts). Live hosting stays a bridge to the
// legacy host page until Q2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const exists = (rel) => fs.existsSync(path(rel));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

test('sessions module satisfies the tab contract', async () => {
  const s = await import('../questions/sessions.js');
  assert.equal(typeof s.mount, 'function', 'exports mount');
  assert.equal(typeof s.unmount, 'function', 'exports unmount');
});

test('sessions no longer bridges to the legacy host (native live host now)', async () => {
  const s = await import('../questions/sessions.js');
  assert.equal(typeof s.hostHref, 'undefined', 'the legacy host bridge helper is gone');
  const src = read('../questions/sessions.js');
  assert.ok(!/backstage\/classpulse\/host\.html/.test(src), 'no link to the legacy host page');
  assert.match(src, /from\s+['"]\.\/live-host\.js['"]/, 'mounts the native live host instead');
});

test('questions shell now registers Sessions as a NATIVE module', async () => {
  const shell = await import('../questions/questions.js');
  const sessions = shell.SUBTABS.find((s) => s.key === 'sessions');
  assert.ok(sessions.module && typeof sessions.module.mount === 'function', 'sessions is a native module');
  const subs = shell.subtabs('sessions');
  const entry = subs.find((s) => /\/codex\/\?tab=questions&sub=sessions/.test(s.href));
  assert.ok(entry, 'Sessions routes to /codex/?tab=questions&sub=sessions');
  assert.equal(entry.active, true, 'Sessions is active when selected');
});

test('sessions module obeys the source rules', () => {
  const rel = '../questions/sessions.js';
  assert.ok(exists(rel), `${rel} exists`);
  const src = read(rel);
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker() call');
  assert.ok(!/onclick\s*=/.test(src), 'no inline onclick');
  assert.ok(/cdx-/.test(src), 'authors cdx- classes');
  assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), 'no ct-/cv- classes');
  assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, 'imports t()');
  assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'imports the facade');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.match(src, /export\s+function\s+mount\s*\(/, 'exports mount');
  assert.match(src, /export\s+function\s+unmount\s*\(/, 'exports unmount');
});

test('sessions i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.sessions_new_title', 'questions.sessions_create', 'questions.sessions_loading',
    'questions.sessions_empty', 'questions.sessions_host', 'questions.sessions_close',
    'questions.sessions_reopen', 'questions.sessions_status_open', 'questions.sessions_status_closed',
    'questions.sessions_reopen_blocked', 'questions.sessions_create_error',
    // Batch 3: per-session stats overlay + delete
    'questions.sessions_stats', 'questions.sessions_delete', 'questions.sessions_delete_confirm',
    'questions.sessions_delete_error', 'questions.sessions_untitled',
    'questions.sessions_stats_kpi_q', 'questions.sessions_stats_kpi_s',
    'questions.sessions_stats_most_missed', 'questions.sessions_stats_empty',
    'questions.sessions_stats_close', 'questions.sessions_stats_loading',
    // Faithful re-port: sidebar picker + main host area
    'questions.sessions_sidebar_heading', 'questions.sessions_title_label',
    'questions.sessions_placeholder', 'questions.sessions_start',
    'questions.sessions_live_label',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

// The card shell is the shared rail's row since track-41, so the faithful bits are what goes
// INSIDE it (renderRow) plus the skin in questions.css. Both still have to exist.
test('sessions re-ports the faithful card layout (the guts survive the rail migration)', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /cdx-session-info/, 'the card guts are still the ported layout');
  assert.match(src, /cdx-session-title/);
  assert.match(src, /cdx-session-meta/);
  assert.match(src, /cdx-live/, 'renders the legacy live indicator on open sessions');
  assert.match(src, /renderRow:\s*\(s\)\s*=>\s*\(\{\s*main:\s*_cardMain\(s\),\s*act:\s*_cardAct\(s\)/,
    'the live pill is the row act slot (right side), as in the bespoke card');
  // The bespoke shell must be gone, not left behind as a second way to draw a card.
  assert.ok(!/cdx-session-card/.test(src), 'the hand-made card shell is gone (the rail owns the row)');
  const css = read('../questions/questions.css');
  assert.match(css, /\.cdx-sessions-sidebar \.cdx-rail-row/, 'the card look is re-skinned onto the rail row, scoped to this rail');
});

// The reveal/hide BEHAVIOUR moved into the module and is proven there
// (tests/list-rail-autohide.test.mjs: edge reveal, leave-timer, Escape, pinned, destroy).
// What is still sessions' own, and is what this guards, is that it ASKS for it and no longer
// hand-rolls a second copy beside it.
test('the sidebar picker is the shared rail in autohide mode, not a hand-rolled copy', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /cdx-sessions-sidebar/, 'keeps the sidebar class (it is the drawer hook too)');
  assert.match(src, /_rail = mountRail\(/, 'the picker IS the shared rail');
  assert.match(src, /mode:\s*'autohide'/, 'in autohide mode');
  assert.match(src, /openClass:\s*'cdx-sm--open'/, 'still the cv-sm reveal class, now stamped by the module');
  assert.match(src, /pinned:\s*!pre/, 'a deep-link opens straight into the host, unpinned');
  for (const gone of ['REVEAL_ZONE', 'HIDE_DELAY', '_openSidebar', '_closeSidebar', '_maybeHide', '_overSidebar', '_sidebarPinned'])
    assert.ok(!src.includes(gone), `hand-rolled auto-hide gone: ${gone}`);
  assert.ok(!/clientX/.test(src), 'the left-edge zone is the module\'s, not a second copy here');
  assert.match(src, /cdx-sessions-(main|detail)/, 'has the main host area');
  assert.match(src, /sessions_placeholder/, 'shows the empty-selection placeholder');
});

// Sessões had NO hamburger at all: it was simply never registered in the topbar's list.
// Élder: "all should have them". Both files must name it, because the list is duplicated.
test('Sessões is registered for the mobile drawer (it had no hamburger at all)', () => {
  assert.match(read('../js/codex-topbar.js'), /const DRAWER_SEL = '[^']*\.cdx-sessions-sidebar/,
    'the topbar knows the sidebar is a drawer');
  const css = read('../css/codex.css');
  assert.match(css, /\.cdx-sessions-sidebar\.is-open/, 'and codex.css slides it in (the SAME list, by hand, twice)');
});

test('lifecycle (Iniciar/Encerrar) lives on the host bar, not the sessions detail', () => {
  const sessionsSrc = read('../questions/sessions.js');
  const hostSrc = read('../questions/live-host.js');
  // The Codex-invented detail header is gone; selecting a session mounts the host.
  assert.match(sessionsSrc, /liveHost\.mount\s*\(/, 'sessions mounts the native live host');
  // Iniciar/Encerrar (reopen/close) are the host's, exactly like host.html.
  assert.match(hostSrc, /\.reopenSession\s*\(/, 'host owns Iniciar (reopen)');
  assert.match(hostSrc, /\.closeSession\s*\(/, 'host owns Encerrar (close)');
  assert.match(hostSrc, /data-act=["']start["']/, 'host bar has the Iniciar button');
  assert.match(hostSrc, /data-act=["']stop["']/, 'host bar has the Encerrar button');
});

test('sessions wires the per-session stats overlay through the facade', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /\.sessionStats\s*\(/, 'calls api.sessionStats for the overlay');
  assert.match(src, /cdx-session-stats/, 'renders a per-session stats overlay panel');
  // overlay shows the legacy KPIs + per-question accuracy bars (reuse cdx-stats-bar)
  assert.match(src, /cdx-stats-bar/, 'overlay reuses the accuracy bar primitive');
  // Opened from the host bar's Estatisticas button via the onStats callback.
  assert.match(src, /onStats:\s*\(\)\s*=>\s*_openStats/, 'host bar opens the overlay via onStats');
});

test('per-session delete is wired from the host (onDelete -> deleteSession), not a sidebar-card action', () => {
  const src = read('../questions/sessions.js');
  // Delete is triggered by the host bar (name-click reveals Excluir, confirmed
  // there); sessions just executes it via the onDelete callback.
  assert.match(src, /onDelete:\s*\(\)\s*=>\s*_confirmDelete/, 'sessions passes onDelete -> _confirmDelete to the host');
  assert.match(src, /\.deleteSession\s*\(/, 'delete goes through api.deleteSession');
  assert.ok(!/cdx-session-actions/.test(src), 'no per-card action row: the sidebar cards stay bare');
  assert.ok(!/data-act=["']delete["']/.test(src), 'delete is not a sidebar-card action in sessions.js');
});

test('sessions unmount tears down the document-level reveal listeners', () => {
  const src = read('../questions/sessions.js');
  // Same intent as before the rail migration: mousemove/keydown are bound on DOCUMENT, so they
  // MUST be cleaned up or they leak one set per tab switch. They are the rail's now, and
  // rail.destroy() is the only thing that unhooks them (proven in list-rail-autohide.test.mjs),
  // so unmount has to call it. Forgetting it is silent: nothing breaks, it just leaks forever.
  const un = /export function unmount\(\)[\s\S]*?\n\}/.exec(src);
  assert.ok(un, 'has unmount');
  assert.match(un[0], /_rail\.destroy\(\)/, 'unmount destroys the rail (that is what unhooks document)');
  assert.match(un[0], /_rail = null/, 'and drops the reference');
  // Anything this file still binds on document must go through the tracked _on helper.
  const docBinds = src.match(/addEventListener/g) || [];
  const tracked = src.match(/_on\(/g) || [];
  assert.ok(!/document\.addEventListener/.test(src), 'no untracked document listener here');
  assert.ok(tracked.length >= docBinds.length, 'listeners are registered through the tracked helper');
});
