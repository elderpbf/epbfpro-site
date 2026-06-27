// tests/trilha-forum.test.mjs
// Codex Trail · Fórum tab. Unit-tests the DOM-free logic (relative time, avatar
// initials, the thread meta line) + source-contract assertions (self-registers a
// renderer, reaches the backend only through the facade, carries its i18n keys,
// routes the new tab). The board DOM wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relTime, initials, threadMeta } from '../trilha/js/forum.js';
import { resolveTab } from '../trilha/js/page.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── relTime (deterministic via explicit now) ────────────────────────────────
const NOW = 1_000_000;
test('relTime: under a minute -> agora', () => assert.equal(relTime(NOW - 30, NOW), 'agora'));
test('relTime: minutes', () => assert.equal(relTime(NOW - 5 * 60, NOW), 'há 5 min'));
test('relTime: hours', () => assert.equal(relTime(NOW - 3 * 3600, NOW), 'há 3 h'));
test('relTime: days', () => assert.equal(relTime(NOW - 2 * 86400, NOW), 'há 2 d'));
test('relTime: future/zero clamps to agora', () => assert.equal(relTime(NOW + 100, NOW), 'agora'));

// ── initials ────────────────────────────────────────────────────────────────
test('initials: two words -> two letters', () => assert.equal(initials('Ana Beatriz'), 'AB'));
test('initials: single word -> first two letters', () => assert.equal(initials('Carlos'), 'CA'));
test('initials: empty -> empty', () => assert.equal(initials(''), ''));

// ── threadMeta ──────────────────────────────────────────────────────────────
test('threadMeta: admin author shows the professor label', () => {
  const m = threadMeta({ author_is_admin: 1, post_count: 1, last_activity_at: NOW - 3600 }, NOW);
  assert.equal(m.author, 'Professor');
  assert.equal(m.replies, 0);
});
test('threadMeta: replies = post_count - 1, singular/plural word', () => {
  assert.equal(threadMeta({ post_count: 2, author_name: 'Ana' }, NOW).repWord, 'resposta');
  assert.equal(threadMeta({ post_count: 4, author_name: 'Ana' }, NOW).replies, 3);
  assert.equal(threadMeta({ post_count: 4, author_name: 'Ana' }, NOW).repWord, 'respostas');
});

// ── resolveTab knows the forum tab ──────────────────────────────────────────
test('resolveTab: #forum -> forum', () => assert.equal(resolveTab('#forum'), 'forum'));

// ── source contract ─────────────────────────────────────────────────────────
test('forum.js self-registers a renderer and uses the facade only', () => {
  const src = read('../trilha/js/forum.js');
  assert.match(src, /registerRenderer\('forum'/, 'registers the forum renderer');
  assert.match(src, /from '\.\/api\.js'/, 'imports the Trail facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
  assert.match(src, /thread=/, 'honors the ?thread= deeplink');
});
test('forum i18n keys exist in pt + en', () => {
  const src = read('../trilha/i18n.js');
  for (const k of ['page.tab_forum', 'forum.intro', 'forum.publish', 'forum.reply', 'forum.empty', 'forum.login_cta']) {
    assert.ok(src.includes("'" + k + "'"), 'missing key ' + k);
  }
});
test('the trilha page wires the forum panel + tab', () => {
  const src = read('../trilha/index.html');
  assert.match(src, /data-panel="forum"/, 'has the forum panel');
  assert.match(src, /id="cdx-tr-forum-root"/, 'has the forum mount');
  assert.match(src, /data-tab="forum"/, 'has the forum tab button');
  assert.match(src, /trilha\/js\/forum\.js/, 'boots the forum module');
});
