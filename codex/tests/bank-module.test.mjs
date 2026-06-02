// Questions tab, increment 3: the Bank sub-tab (questions/bank.js) + the
// reusable question composer (questions/question-composer.js, which the Q2 live
// launch form will also use). RED-first. Covers the tab contract, the pure
// helpers (buildPayload per type, moveInArray reorder), the shell promoting Bank
// to native (leaving ZERO legacy bridges), the source rules, and the i18n keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const exists = (rel) => fs.existsSync(path(rel));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

test('bank module satisfies the tab contract', async () => {
  const b = await import('../questions/bank.js');
  assert.equal(typeof b.mount, 'function', 'exports mount');
  assert.equal(typeof b.unmount, 'function', 'exports unmount');
});

test('bank moveInArray() reorders immutably and clamps at the ends', async () => {
  const b = await import('../questions/bank.js');
  assert.deepEqual(b.moveInArray(['a', 'b', 'c'], 1, 'up'), ['b', 'a', 'c']);
  assert.deepEqual(b.moveInArray(['a', 'b', 'c'], 1, 'down'), ['a', 'c', 'b']);
  assert.deepEqual(b.moveInArray(['a', 'b', 'c'], 0, 'up'), ['a', 'b', 'c']);
  assert.deepEqual(b.moveInArray(['a', 'b', 'c'], 2, 'down'), ['a', 'b', 'c']);
  const orig = ['a', 'b', 'c'];
  b.moveInArray(orig, 1, 'up');
  assert.deepEqual(orig, ['a', 'b', 'c'], 'does not mutate the input');
});

test('composer buildPayload() normalizes each type to the frozen Worker shape', async () => {
  const c = await import('../questions/question-composer.js');

  const mc = c.buildPayload({ type: 'mc', question: 'Q', options: ['A', 'B', 'C'], correct: [1], maxSelect: 1 });
  assert.equal(mc.type, 'mc');
  assert.deepEqual(mc.options, ['A', 'B', 'C']);
  assert.equal(mc.correct_answer, 1, 'single-select mc correct is a scalar index');
  assert.equal(mc.max_select, 1);

  const multi = c.buildPayload({ type: 'mc', question: 'Q', options: ['A', 'B', 'C'], correct: [0, 2], maxSelect: 2 });
  assert.deepEqual(multi.correct_answer, [0, 2], 'multi-select mc correct is an array');

  const poll = c.buildPayload({ type: 'poll', question: 'P', options: ['x', 'y'], maxSelect: 2 });
  assert.equal(poll.correct_answer, '', 'poll has no correct answer');

  const open = c.buildPayload({ type: 'open', question: 'O' });
  assert.deepEqual(open.options, [], 'open has no options');

  const rating = c.buildPayload({ type: 'rating', question: 'R', min: 1, max: 5 });
  assert.deepEqual(rating.options, { min: 1, max: 5 }, 'rating carries the scale');
});

test('questions shell now registers Bank as native; ZERO legacy bridges remain', async () => {
  const shell = await import('../questions/questions.js');
  const bank = shell.SUBTABS.find((s) => s.key === 'bank');
  assert.ok(bank.module && typeof bank.module.mount === 'function', 'bank is a native module');
  const bridges = shell.SUBTABS.filter((s) => s.href && !s.module);
  assert.equal(bridges.length, 0, 'all three sub-tabs are native; no legacy bridges left');
  const subs = shell.subtabs('bank');
  const entry = subs.find((s) => /\/codex\/\?tab=questions&sub=bank/.test(s.href));
  assert.ok(entry && entry.active, 'Bank routes to /codex and is active when selected');
});

test('bank + composer obey the module source rules', () => {
  for (const rel of ['../questions/bank.js', '../questions/question-composer.js']) {
    assert.ok(exists(rel), `${rel} exists`);
    const src = read(rel);
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${rel} makes no direct callWorker() call`);
    assert.ok(!/onclick\s*=/.test(src), `${rel} authors no inline onclick`);
    assert.ok(/cdx-/.test(src), `${rel} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), `${rel} no ct-/cv- classes`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${rel} imports t()`);
    assert.ok(!/—/.test(src), `${rel} has no em dashes`);
  }
  const bankSrc = read('../questions/bank.js');
  assert.match(bankSrc, /export\s+function\s+mount\s*\(/, 'bank exports mount');
  assert.match(bankSrc, /export\s+function\s+unmount\s*\(/, 'bank exports unmount');
  assert.match(bankSrc, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'bank imports the facade');
});

test('bank + question-type i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.bank_new_set', 'questions.bank_search_placeholder', 'questions.bank_empty_sets',
    'questions.bank_empty_questions', 'questions.bank_pick_set', 'questions.bank_add_question',
    'questions.bank_edit', 'questions.bank_delete', 'questions.bank_rename_set',
    'questions.bank_delete_set', 'questions.bank_save', 'questions.bank_cancel',
    'questions.bank_question_text', 'questions.bank_type', 'questions.bank_correct',
    'questions.bank_option', 'questions.bank_add_option', 'questions.bank_loading',
    'questions.type_mc', 'questions.type_tf', 'questions.type_poll', 'questions.type_open',
    'questions.type_wordcloud', 'questions.type_rating', 'questions.type_numeric',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
