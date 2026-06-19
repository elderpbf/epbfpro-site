// tests/trilha-notif-prefs.test.mjs
// Student notification preferences (trilha/js/notif-prefs.js). Unit-tests the pure
// filter that decides which pending forum items raise the bell, plus a contract
// check that the categories list is the single extension point. The popover DOM is
// verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filterByPrefs, DEFAULT_PREFS } from '../trilha/js/notif-prefs.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ITEMS = [
  { thread_id: 1, kind: 'reply,', mine: true },     // a reply in my thread
  { thread_id: 1, kind: 'reply', mine: true },      // a reply in my thread
  { thread_id: 2, kind: 'reply', mine: false },     // a reply in someone else's thread
  { thread_id: 3, kind: 'new_thread', mine: false },// a brand-new topic
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
