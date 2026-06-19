// tests/cohorts-forum-admin.test.mjs
// Codex Cohorts · Fórum moderation pane (2-pane, Opção A). The instructor moderates
// entirely from Codex, so this is the full toolkit. Unit-tests the shared relative-
// time helper + source-contract assertions (facade-only, full toolkit present, i18n
// parity, mounted by the dossier). The 2-pane DOM is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relTime } from '../js/rel-time.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── shared rel-time helper ──────────────────────────────────────────────────
const NOW = 1_000_000;
test('relTime: buckets', () => {
  assert.equal(relTime(NOW - 30, NOW), 'agora');
  assert.equal(relTime(NOW - 600, NOW), 'há 10 min');
  assert.equal(relTime(NOW - 7200, NOW), 'há 2 h');
  assert.equal(relTime(NOW - 3 * 86400, NOW), 'há 3 d');
});

// ── source contract ─────────────────────────────────────────────────────────
test('forum-admin uses the facade only and carries the full toolkit', () => {
  const src = read('../cohorts/forum-admin.js');
  assert.match(src, /from '\.\.\/js\/codex-api\.js'/, 'imports the admin facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
  // The instructor's full toolkit (he has no Trilha access).
  for (const m of ['forumCreateThread', 'forumReply', 'forumSetPinned', 'forumDeletePost', 'forumDeleteThread', 'forumEditPost']) {
    assert.ok(src.includes(m), 'toolkit missing ' + m);
  }
  assert.match(src, /from '\.\.\/js\/rel-time\.js'/, 'reuses the shared rel-time helper (no duplicate)');
});

test('the dossier mounts the forum moderation pane', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /from '\.\/forum-admin\.js'/, 'imports the pane module');
  assert.match(src, /mountForumAdmin\(forumEl, turma\)/, 'mounts it into #cdx-doss-forum');
});

test('the admin facade wires every forum moderation action', () => {
  const src = read('../js/codex-api.js');
  for (const a of ['ct_forum_admin_list_threads', 'ct_forum_admin_get_thread', 'ct_forum_admin_create_thread',
                   'ct_forum_admin_reply', 'ct_forum_set_pinned', 'ct_forum_delete_post', 'ct_forum_delete_thread',
                   'ct_forum_admin_edit_post', 'ct_forum_admin_notifications', 'ct_forum_admin_mark_seen']) {
    assert.ok(src.includes(a), 'facade missing ' + a);
  }
});

test('forum moderation i18n keys exist in pt + en', () => {
  const pt = read('../i18n/pt.js');
  const en = read('../i18n/en.js');
  for (const k of ['cohorts.forum_new', 'cohorts.forum_reply', 'cohorts.forum_pin', 'cohorts.forum_delete', 'cohorts.forum_edit', 'cohorts.forum_pick']) {
    assert.ok(pt.includes("'" + k + "'"), 'pt missing ' + k);
    assert.ok(en.includes("'" + k + "'"), 'en missing ' + k);
  }
});
