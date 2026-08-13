// The task toggles arrive TOGETHER with the list, not piggybacking on the open card.
//
// The bug Élder reported twice ("preciso dar 2 cliques", "volta desmarcado depois de
// recarregar"): _flags was only populated by _loadSubmissions, which only runs on the
// SELECTED card. In the lesson hub every closed card drew the four toggles as off, regardless
// of the truth in the database, and the first click sent a TURN ON for something already on.
// Hence the two clicks: the first was a no-op that only fixed the screen's lie.
//
// A toggle that lies about its state is worse than a toggle that doesn't exist, because the
// teacher trusts it: they don't know they need to open the card before believing what they read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = () => read('../content/tarefas.js');

test('the action goes through the facade, like everything else', () => {
  assert.match(read('../js/codex-api.js'),
    /listTarefaFlags: \(p\) => call\('ct_list_tarefa_flags', p\)/);
});

// The heart of the fix: the flags come in the SAME load as the list, not a second trip per
// card. If it goes back to depending on the open card, this test fails.
test('flags are loaded together with the task list', () => {
  const s = src();
  const load = s.slice(s.indexOf('cohortsApi.listTurmas('), s.indexOf('function _updateSubmissionCount'));
  assert.match(load, /api\.listTarefaFlags\(\{ client_slug: clientSlug, turma_slug: turmaSlug \}\)/,
    'the call enters the list Promise.all');
  assert.match(load, /_flags = \(results\[2\] && results\[2\]\.flags\) \|\| \{\}/,
    'and the result populates _flags BEFORE any render');
});

// Order matters: if _flags were populated after _renderLockedPane, the first draw would still
// come out lying and only a second render would fix it.
test('_flags is populated BEFORE the first render of the cards', () => {
  const s = src();
  const load = s.slice(s.indexOf('}).then((results) => {'));
  const iFlags = load.indexOf('_flags = (results[2]');
  const iRender = load.indexOf('_renderLockedPane()');
  assert.ok(iFlags !== -1 && iRender !== -1, 'both exist');
  assert.ok(iFlags < iRender, 'the flags arrive before the render, not after');
});

// _flags is TURMA (cohort) state. Without resetting it, the toggles of the cohort that left
// would paint the cards of the next one for the whole load window.
test('_flags dies together with _submissions when switching cohort', () => {
  const s = src();
  assert.match(s, /_submissions = \{\};\s*\n\s*_flags = \{\};/,
    'reset on cohort switch and on unmount');
  const zeros = [...s.matchAll(/_flags = \{\};/g)];
  assert.ok(zeros.length >= 2, 'in both places where _submissions resets, not just one');
});

// The default can't be {}: _lockedCardHtml read `_flags[item.id] || {}` and {} doesn't have
// the four keys, so EVERYTHING came out undefined -> unchecked. _noFlags() at least states
// explicitly "four off", which is the honest default for a task without a release.
test('the default is _noFlags(), not an empty object', () => {
  const s = src();
  const card = s.slice(s.indexOf('function _lockedCardHtml'), s.indexOf('function _lockedCardHtml') + 600);
  assert.match(card, /_flags\[item\.id\] \|\| _noFlags\(\)/);
  assert.ok(!/_flags\[item\.id\] \|\| \{\}/.test(s), 'the old `|| {}` did not come back');
});

// _noFlags has to have the FOUR keys: one missing key goes back to undefined -> unchecked,
// which is exactly the shape of the original bug.
test('_noFlags covers the four toggles, including the anonymous one', () => {
  const s = src();
  const nf = s.slice(s.indexOf('const _noFlags'), s.indexOf('const _noFlags') + 200);
  for (const k of ['reply_enabled', 'grade_enabled', 'allow_multi', 'allow_anon']) {
    assert.match(nf, new RegExp(k + ':\\s*false'), k + ' has an explicit default');
  }
});
