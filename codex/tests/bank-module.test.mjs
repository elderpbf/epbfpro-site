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

// Faithful re-port of the legacy cp-banks-layout: a Conjuntos sidebar, a
// question area whose conjunto header carries [Editar banco | Editar nome |
// Excluir conjunto], a Questoes header with [+ Gerar em Lote | + Nova questao],
// question cards that PREVIEW the options (A/B/C/D, correct highlighted), and a
// native modal editor that reuses the shared composer plus AI generate/improve.
test('bank is a faithful re-port of the legacy cp-banks-layout', () => {
  const src = read('../questions/bank.js');
  assert.match(src, /data-act="edit-bank"/, 'renders the Editar banco action');
  assert.match(src, /data-act="bulk"/, 'renders the Gerar em Lote action');
  assert.match(src, /data-act="addq"/, 'renders the Nova questao action');
  assert.match(src, /cdx-q-opt/, 'question cards preview the options');
  assert.match(src, /cdx-modal/, 'editor uses a native modal');
  assert.match(src, /ai\.question/, 'wires AI generate/improve through the facade');
  assert.match(src, /mountComposer/, 'reuses the shared composer inside the modal');
  // Deploy 2: reorder/move mode + bulk-generate modal.
  assert.match(src, /draggable="true"/, 'edit-bank mode makes cards draggable');
  assert.match(src, /cdx-bank-movebar/, 'renders the move-between-sets bar');
  assert.match(src, /cdx-bank-bulk/, 'renders the bulk-generate modal');
  assert.match(src, /addQuestionsBulk/, 'bulk save goes through the facade');
  // Import / Export sharing one canonical format.
  assert.match(src, /data-act="export"/, 'has an export action');
  assert.match(src, /data-act="import"/, 'has an import action');
  assert.match(src, /codex_questions/, 'export uses the canonical JSON envelope');
  assert.match(src, /ai\.chat/, 'text import organizes the paste via ai.chat');
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
    // faithful re-port additions
    'questions.bank_sets_header', 'questions.bank_new_set_btn', 'questions.bank_edit_bank',
    'questions.bank_edit_name', 'questions.bank_questions_label', 'questions.bank_bulk_generate',
    'questions.bank_new_question', 'questions.bank_generate', 'questions.bank_improve',
    'questions.bank_ai_prompt', 'questions.bank_modal_new', 'questions.bank_modal_edit',
    'questions.bank_goto_set',
    // Deploy 2: reorder/move + bulk
    'questions.bank_move', 'questions.bank_move_to', 'questions.bank_move_selected',
    'questions.bank_bulk_title', 'questions.bank_bulk_count', 'questions.bank_bulk_theme',
    'questions.bank_bulk_generate_btn', 'questions.bank_bulk_review_hint',
    'questions.bank_bulk_save', 'questions.bank_bulk_discard', 'questions.bank_correct_tag',
    // Import / Export
    'questions.bank_export', 'questions.bank_import', 'questions.bank_copy',
    'questions.bank_download', 'questions.bank_import_tab_text', 'questions.bank_import_tab_json',
    'questions.bank_import_organize',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
