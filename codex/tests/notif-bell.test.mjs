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
