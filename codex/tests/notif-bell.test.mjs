// tests/notif-bell.test.mjs
// Shared notification bell (js/notif-bell.js). Unit-tests the pure grouping helper +
// source-contract assertions: the component is source-agnostic (no facade import — the
// caller injects fetch/markSeen), and both surfaces mount it with their own source +
// the corner badge. The dropdown DOM is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { groupItems } from '../js/notif-bell.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── groupItems ──────────────────────────────────────────────────────────────
test('groupItems: groups by label, preserving first-seen order', () => {
  const g = groupItems([
    { group: 'Turma A', title: '1' },
    { group: 'Turma B', title: '2' },
    { group: 'Turma A', title: '3' },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].label, 'Turma A');
  assert.equal(g[0].items.length, 2);
  assert.equal(g[1].label, 'Turma B');
});
test('groupItems: ungrouped items fall into a single empty-label bucket', () => {
  const g = groupItems([{ title: '1' }, { title: '2' }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].label, '');
  assert.equal(g[0].items.length, 2);
});

// ── source contract ─────────────────────────────────────────────────────────
test('notif-bell is source-agnostic (no facade hardcoded)', () => {
  const src = read('../js/notif-bell.js');
  assert.ok(!/codex-api\.js|callWorker|ct_forum/.test(src), 'must not import a facade or name actions');
  assert.match(src, /fetchNotifications/, 'takes an injected fetch');
  assert.match(src, /markSeen/, 'takes an injected mark-seen');
  assert.match(src, /from '\.\/rel-time\.js'/, 'reuses the shared rel-time helper');
});
test('the teacher topbar mounts the bell against the admin facade', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /from '\.\/notif-bell\.js'/, 'imports the bell');
  assert.match(src, /forumNotifications\(\)/, 'wires the cross-turma source');
});
test('the bell is role-aware and self-dismisses the open tier when opened', () => {
  const src = read('../js/notif-bell.js');
  assert.match(src, /from '\.\/notif-policy\.js'/, 'imports the dismissal-tier policy');
  assert.match(src, /role = 'student'/, 'takes a role (defaults to student)');
  assert.match(src, /dismissOnOpen\(\)/, 'dismisses the open tier on open');
  assert.match(src, /positionMobile\(\)/, 'pins the tray under the bell on mobile');
});
test('both surfaces pass their role to the bell', () => {
  assert.match(read('../js/codex-topbar.js'), /role: 'admin'/, 'admin bell gets role:admin');
  assert.match(read('../trilha/js/page.js'), /role: 'student'/, 'student bell gets role:student');
});

// ── the two dismissals + a readable history (Élder 2026-07-19) ───────────────
// An ACIONÁVEL leaves exactly two ways: its × or a click on it. The same two for EVERY
// acionável — an earlier pass invented a sub-rule inside 'act' ("clears on read" for some
// but not others) and it was wrong; this test keeps it from coming back.
test('an acionável clears BOTH ways, with no sub-rule inside act', () => {
  const src = read('../js/notif-bell.js');
  assert.match(src, /data-bell-x/, 'renders the per-item dismiss ×');
  assert.match(src, /_isAct\(it\) && dismissItem/, 'a click on an acionável dismisses it too');
  assert.ok(!/clearsOnRead/.test(src), 'no sub-rule gating which acionáveis clear on click');
});

// A dismissed notification is still readable: the history is a list you can open, not a log.
test('history rows are clickable and re-open the item', () => {
  const src = read('../js/notif-bell.js');
  assert.match(src, /data-bell-h/, 'history rows carry a click handle');
  assert.match(src, /\[data-bell-h\]/, 'and are wired to a handler');
});

// The history was session-local and a reload wiped it (Élder 2026-07-19). It is now served by
// the worker from ct_notif_dismissed, so it outlives the page.
test('the history is server-backed, so it survives a reload', () => {
  const src = read('../js/notif-bell.js');
  assert.match(src, /fetchHistory/, 'takes an injected history source');
  assert.match(src, /loadHistory\(\)/, 'loads it when the tray opens');
  assert.match(read('../trilha/js/page.js'), /fetchHistory:/, 'the student bell wires it');
  assert.match(read('../trilha/js/api.js'), /ct_notif_history/, 'the trail facade exposes the action');
});

// With one tier live, a two-tab history names a split the user cannot see.
test('the history drops its two mini-tabs while only one tier is live', () => {
  const src = read('../js/notif-bell.js');
  assert.match(src, /DISPENSAVEIS_ENABLED/, 'reads the tier switch from the policy');
  assert.match(src, /histTabs\.hidden = !split/, 'hides the tabs when the history is not split');
});
test('the student trilha header mounts the bell + prefs only when enabled + logged in', () => {
  const src = read('../trilha/js/page.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/notif-bell\.js'/, 'imports the bell');
  assert.match(src, /state\.sessionToken && data\.access && data\.access\.gated/, 'the settings box (logout + prefs) shows when logged in on a gated turma');
  assert.match(src, /data\.turma\.forum_enabled/, 'the bell + notif prefs follow the forum');
  assert.match(src, /onLogout:/, 'logout lives inside the settings box (no standalone pill when logged in)');
  assert.match(src, /forumNotifications\(\{ session_token/, 'wires the scoped student source');
  // In-app open: no reload, switch tab + open the thread by id.
  assert.match(src, /focusThread\(item\.thread_id\)/, 'opens the thread in place');
  // The fallback deeplink still re-appends the access token, else page.js shows link_invalid.
  assert.match(src, /'k=' \+ encodeURIComponent\(state\.token\)/, 'preserves the ?k= token on fallback navigation');
  // Bell items filtered by the student's chosen categories; settings button mounted.
  assert.match(src, /filterByPrefs\(/, 'filters notifications by prefs');
  assert.match(src, /createNotifSettings\(/, 'mounts the prefs settings button');
  assert.match(src, /otherKnownTurmas\(/, "computes the device's other turmas (trocar de turma)");
  assert.match(src, /onForget:/, 'passes the forget callback for a saved turma');
});

test('the settings box renders the trocar-de-turma list (Idea A) when other turmas exist', () => {
  const src = read('../trilha/js/notif-prefs.js');
  assert.match(src, /cdx-ns-turma\b/, 'renders the turma rows');
  assert.match(src, /notif\.switch_turma/, 'uses the switch-turma label');
  assert.match(src, /onForget/, 'wires the forget action');
});
test('notif i18n keys exist in codex + trilha dictionaries (pt + en)', () => {
  for (const f of ['../i18n/pt.js', '../i18n/en.js', '../trilha/i18n.js']) {
    const src = read(f);
    for (const k of ['notif.title', 'notif.mark_all', 'notif.empty']) {
      assert.ok(src.includes("'" + k + "'"), f + ' missing ' + k);
    }
  }
});

// ── e-sino: a pending student deep-links to the Participantes approval area ────
// Élder: a notification NEVER acts inline — it LEADS the admin to the relevant area,
// and the approval happens there (the dossiê Participantes sub-tab).
test('the admin bell deep-links a pending student to the Participantes sub-tab', () => {
  const src = read('../js/codex-topbar.js');
  assert.match(src, /type === 'student_pending'/, 'handles the pending-student item');
  assert.match(src, /fdtab=participantes/, 'deep-links to the approval sub-tab');
});
test('the bell has NO inline action (notifications lead to the area, not act in place)', () => {
  assert.ok(!/itemAction|data-bell-act/.test(read('../js/notif-bell.js')), 'no inline action button in the shared bell');
  assert.ok(!/itemAction|setParticipantAccess/.test(read('../js/codex-topbar.js')), 'the admin bell wires no inline approve');
});
test('index.html honours an explicit fdtab deep-link param (so the bell can target Participantes)', () => {
  assert.match(read('../index.html'), /ctx\.fdtab = params\.get\('fdtab'\)/, 'reads an explicit fdtab');
});
