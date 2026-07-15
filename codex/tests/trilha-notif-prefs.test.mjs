// tests/trilha-notif-prefs.test.mjs
// Student notification preferences (trilha/js/notif-prefs.js). Unit-tests the pure
// filter that decides which pending forum items raise the bell, plus a contract
// check that the categories list is the single extension point. The popover DOM is
// verified visually on staging.
//
// The fixtures carry `type: 'forum_post'` because the worker stamps it on every item
// (_pendingForTurma) and these prefs are FORUM prefs: they key off the type so a
// non-forum source is never silently swallowed by them (see the pass-through test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filterByPrefs, DEFAULT_PREFS } from '../trilha/js/notif-prefs.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ITEMS = [
  { type: 'forum_post', thread_id: 1, kind: 'reply,', mine: true },     // a reply in my thread
  { type: 'forum_post', thread_id: 1, kind: 'reply', mine: true },      // a reply in my thread
  { type: 'forum_post', thread_id: 2, kind: 'reply', mine: false },     // a reply in someone else's thread
  { type: 'forum_post', thread_id: 3, kind: 'new_thread', mine: false },// a brand-new topic
];

test('filterByPrefs: all -> everything', () => {
  const out = filterByPrefs(ITEMS, { all: true });
  assert.equal(out.length, ITEMS.length);
});
test('filterByPrefs: replies only -> my-thread replies', () => {
  const out = filterByPrefs(ITEMS, { replies: true, topics: false, all: false });
  assert.ok(out.every((i) => i.mine && i.kind === 'reply'));
  assert.equal(out.length, 1); // only the well-formed reply (kind 'reply') in my thread
});
test('filterByPrefs: topics only -> new threads', () => {
  const out = filterByPrefs(ITEMS, { replies: false, topics: true, all: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'new_thread');
});
test('filterByPrefs: nothing selected -> empty', () => {
  assert.equal(filterByPrefs(ITEMS, { replies: false, topics: false, all: false }).length, 0);
});
test('default prefs notify on replies + topics', () => {
  assert.equal(DEFAULT_PREFS.replies, true);
  assert.equal(DEFAULT_PREFS.topics, true);
  assert.equal(DEFAULT_PREFS.all, false);
});

// REGRESSION LOCK: these are FORUM prefs, so they must never swallow another source. A
// tarefa feedback has no kind/mine, so the forum branches reject it — without the
// type-keyed pass-through the bell would go silent for every non-forum notification,
// under the DEFAULT prefs (all:false), which is every student by default.
test('filterByPrefs: a non-forum item passes through under default prefs', () => {
  const feedback = { type: 'tarefa_feedback', notif_key: 'tf:7', created_at: 1700000000 };
  const out = filterByPrefs([...ITEMS, feedback], DEFAULT_PREFS);
  assert.ok(out.includes(feedback), 'tarefa_feedback survives the forum prefs');
});
test('filterByPrefs: a non-forum item survives even with every forum toggle OFF', () => {
  const feedback = { type: 'tarefa_feedback', notif_key: 'tf:7' };
  const out = filterByPrefs([...ITEMS, feedback], { replies: false, topics: false, all: false });
  assert.deepEqual(out, [feedback]);   // forum silenced, the personal item still lands
});

test('the categories list is the single extension point', () => {
  const src = read('../trilha/js/notif-prefs.js');
  assert.match(src, /const CATEGORIES = \[/, 'declares the categories list');
  assert.match(src, /notif\.opt_replies/, 'replies category');
  assert.match(src, /notif\.opt_topics/, 'topics category');
  assert.match(src, /notif\.opt_all/, 'all category');
});
test('prefs i18n keys exist in pt + en', () => {
  const src = read('../trilha/i18n.js');
  for (const k of ['notif.settings_title', 'notif.opt_replies', 'notif.opt_topics', 'notif.opt_all']) {
    assert.ok(src.includes("'" + k + "'"), 'missing ' + k);
  }
});
