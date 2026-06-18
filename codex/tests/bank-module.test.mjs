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

test('composer: new MC defaults to 4 option slots', () => {
  const src = read('../questions/question-composer.js');
  // New multiple-choice seeds 4 empty options (poll stays 2). Editing keeps stored count.
  assert.match(src, /\['',\s*'',\s*'',\s*''\]/, 'mc fallback is 4 empty options');
  // The "Tornar mais complexa" AI button was reverted (Élder asked for an
  // existing-question review flow instead, not a composer button).
  assert.ok(!src.includes('data-act="ai-complex"'), 'no ai-complex button');
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

test('importBankSummary groups items by target bank and flags new vs existing', async () => {
  const b = await import('../questions/bank.js');
  const items = [
    { list_name: 'LLM', question: 'a' },
    { list_name: 'LLM', question: 'b' },
    { list_name: 'Risco e responsabilidade', question: 'c' },
    { question: 'd' }, // no list_name -> falls back to textTarget
  ];
  const rows = b.importBankSummary(items, 'Fallback', ['LLM', 'old-LLM']);
  assert.deepEqual(rows.map((r) => r.name), ['Fallback', 'LLM', 'Risco e responsabilidade'], 'sorted by name');
  const llm = rows.find((r) => r.name === 'LLM');
  assert.equal(llm.count, 2);
  assert.equal(llm.isNew, false, 'LLM exists -> not new');
  assert.equal(rows.find((r) => r.name === 'Risco e responsabilidade').isNew, true, 'new bank flagged');
  const fb = rows.find((r) => r.name === 'Fallback');
  assert.equal(fb.count, 1, 'no-list_name item uses textTarget');
  assert.equal(fb.isNew, true);
});

test('importBankSummary drops items with no target at all', async () => {
  const b = await import('../questions/bank.js');
  assert.deepEqual(b.importBankSummary([{ question: 'x' }], '', []), []);
  assert.deepEqual(b.importBankSummary(null, 'T', []), []);
});

// Filter chips: filterByClass keeps one question class (or all), classCounts
// tallies each class for the chip badges. Class semantics come from
// audiences.questionType (audience tag -> unique; {{token}} -> variable; else
// generic; audience wins when both are present).
test('filterByClass keeps only the matching class; all returns everything', async () => {
  const b = await import('../questions/bank.js');
  const qs = [
    { id: 1, question: 'plain text' },
    { id: 2, question: 'assina {{actor_role}}' },
    { id: 3, question: 'tagged', audience: 'advocacia' },
    { id: 4, question: 'tagged with {{x}}', audience: 'judiciario' }, // audience wins -> unique
  ];
  assert.deepEqual(b.filterByClass(qs, 'all').map((q) => q.id), [1, 2, 3, 4]);
  assert.deepEqual(b.filterByClass(qs, 'generic').map((q) => q.id), [1]);
  assert.deepEqual(b.filterByClass(qs, 'variable').map((q) => q.id), [2]);
  assert.deepEqual(b.filterByClass(qs, 'unique').map((q) => q.id), [3, 4]);
  assert.deepEqual(b.filterByClass(null, 'all'), [], 'null-safe');
});

test('classCounts tallies each class with all = total', async () => {
  const b = await import('../questions/bank.js');
  const qs = [{ question: 'a' }, { question: '{{x}} faz' }, { question: 't', audience: 'k' }];
  assert.deepEqual(b.classCounts(qs), { all: 3, generic: 1, variable: 1, unique: 1 });
  assert.deepEqual(b.classCounts([]), { all: 0, generic: 0, variable: 0, unique: 0 });
  assert.deepEqual(b.classCounts(null), { all: 0, generic: 0, variable: 0, unique: 0 });
});

// Cross-bank Variaveis view: collectVariable flattens every variable-class
// question across the loaded banks, tagging each with its source bank, order
// preserved (bank order, then question order), non-variable dropped.
test('collectVariable flattens variable questions across banks, tagging the source', async () => {
  const b = await import('../questions/bank.js');
  const banksData = [
    { list_name: 'LLM', questions: [{ id: 1, question: 'plain' }, { id: 2, question: '{{actor_role}} faz' }] },
    { list_name: 'Risco', questions: [{ id: 3, question: '{{deliverable}}' }, { id: 4, question: 'tag', audience: 'adv' }] },
    { list_name: 'Empty', questions: [] },
  ];
  const out = b.collectVariable(banksData);
  assert.deepEqual(out.map((q) => q.id), [2, 3], 'only variable-class, order preserved');
  assert.equal(out[0]._sourceBank, 'LLM');
  assert.equal(out[1]._sourceBank, 'Risco');
  assert.deepEqual(b.collectVariable(null), [], 'null-safe');
});

test('bank renders the filter chips and the cross-bank Variaveis view', () => {
  const src = read('../questions/bank.js');
  assert.match(src, /export\s+function\s+filterByClass\s*\(/, 'filterByClass exported');
  assert.match(src, /export\s+function\s+classCounts\s*\(/, 'classCounts exported');
  assert.match(src, /export\s+function\s+collectVariable\s*\(/, 'collectVariable exported');
  assert.match(src, /data-act="filter-class"/, 'renders the class filter chips');
  assert.match(src, /cdx-bank-chip/, 'chip class present');
  assert.match(src, /cdx-bank-chip-count/, 'chips carry a count badge');
  assert.match(src, /data-act="variaveis"/, 'sidebar has the cross-bank Variaveis entry');
  assert.match(src, /cdx-q-srcbank/, 'cross-bank cards show a source-bank badge');
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
  // Import / Export hub (collection-level) sharing one canonical envelope.
  assert.match(src, /data-act="hub"/, 'sidebar opens the import/export hub');
  assert.match(src, /data-hub="import"/, 'hub has an import tab');
  assert.match(src, /data-scope="choose"/, 'export scope offers current/all/choose');
  assert.match(src, /codex_questions/, 'export uses the canonical multi-bank envelope');
  assert.match(src, /banks:/, 'export builds a multi-bank envelope');
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
    // Import / Export hub
    'questions.bank_export', 'questions.bank_import', 'questions.bank_copy',
    'questions.bank_download', 'questions.bank_import_tab_text', 'questions.bank_import_tab_json',
    'questions.bank_import_organize', 'questions.bank_hub', 'questions.bank_scope',
    'questions.bank_scope_current', 'questions.bank_scope_all', 'questions.bank_scope_choose',
    'questions.bank_target',
    // Filter chips + cross-bank Variaveis view
    'questions.bank_filter_all', 'questions.bank_filter_generic', 'questions.bank_filter_variable',
    'questions.bank_filter_unique', 'questions.bank_filter_empty', 'questions.bank_variaveis_view',
    'questions.bank_variaveis_hint', 'questions.bank_variaveis_empty', 'questions.bank_srcbank',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

test('e2: parseOrderIds validates the AI order is a permutation of the current ids', async () => {
  const b = await import('../questions/bank.js');
  assert.deepEqual(b.parseOrderIds('[3,1,2]', [1, 2, 3]), [3, 1, 2]);
  assert.deepEqual(b.parseOrderIds('```json\n[2,1]\n```', [1, 2]), [2, 1]); // strips code fences
  assert.equal(b.parseOrderIds('[1,2]', [1, 2, 3]), null, 'wrong length rejected');
  assert.equal(b.parseOrderIds('[1,1,2]', [1, 2, 3]), null, 'duplicate rejected');
  assert.equal(b.parseOrderIds('[1,2,9]', [1, 2, 3]), null, 'unknown id rejected');
  assert.equal(b.parseOrderIds('not json', [1]), null, 'invalid JSON rejected');
});

test('#26 + e2: bank exposes the complexity-review + propose-order flows (frontend, reuse ai.chat)', () => {
  const src = read('../questions/bank.js');
  // Buttons
  assert.match(src, /data-act="complexify"/, 'Mais complexas button');
  assert.match(src, /data-act="propose-order"/, 'Propor ordem button');
  // #26: ai.chat (no new worker action) → review → accepted save as NEW questions
  assert.match(src, /function _openComplexify/, 'complexify opener');
  assert.match(src, /ai\.chat\(\{ system: _CPX_SYS/, '#26 calls ai.chat with the harder-variant prompt');
  assert.match(src, /api\.addQuestion\(/, 'accepted variants save as new questions (originals untouched)');
  // e2: ai.chat → review → apply via reorder
  assert.match(src, /function _proposeOrder/, 'order proposer');
  assert.match(src, /ai\.chat\(\{ system: _ORDER_SYS/, 'e2 calls ai.chat with the ordering prompt');
  assert.match(src, /api\.reorder\(\{ list_name: _currentSet, ordered_ids: _orderProposed/, 'applies the proposed order via reorder');
  for (const lang of ['../i18n/pt.js', '../i18n/en.js']) {
    const dict = read(lang);
    for (const k of ['questions.bank_complexify', 'questions.bank_propose_order', 'questions.bank_order_applied']) {
      assert.ok(dict.includes("'" + k + "'"), lang + ' has ' + k);
    }
  }
});
