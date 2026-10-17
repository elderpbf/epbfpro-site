// The release prompt (js/release-notice.js) and the reminder's time field (js/sp-time.js),
// 2026-10-16. Élder's rule: the e-mail about new material is asked at the moment material becomes
// visible, never sent by a sweep he cannot see. What this pins:
//   - the diff that decides whether to ask, and the prefilled notice;
//   - the notice is filed under the student's own `material_novo` choice, e-mail + push, no bell;
//   - EVERY path that can reveal material snapshots before and asks after (a path that forgets is
//     the silent kind of bug: nothing breaks, the class just never hears);
//   - the São Paulo clock the reminder field speaks, independent of the browser's timezone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.callWorker = (payload) => payload;
const { newlyVisible, noticeDraft } = await import('../js/release-notice.js');
const { spInputValue, spInputToSec } = await import('../js/sp-time.js');
const api = await import('../js/codex-api.js');

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('only what was not visible before counts as revealed', () => {
  assert.deepEqual(newlyVisible([1, 2], [2, 1, 3, 4]), [3, 4]);
  assert.deepEqual(newlyVisible([1, 2], [1]), [], 'hiding something is not news');
  assert.deepEqual(newlyVisible(['7'], [7]), [], 'ids compare as numbers');
});

test('the prefilled notice names the lesson when there is one', () => {
  const withLesson = noticeDraft({ turmaName: 'CONGER 2026', label: 'Aula 2' });
  assert.ok(withLesson.title.includes('Aula 2'));
  assert.ok(withLesson.body.includes('CONGER 2026'));
  const generic = noticeDraft({ turmaName: 'CONGER 2026', label: null });
  assert.ok(!generic.title.includes('{aula}'));
});

test('the facade reads visibility from the Worker, not from a local copy of the rule', () => {
  assert.equal(api.cohorts.turmaVisibleIds({ client_slug: 'c', turma_slug: 't' }).action, 'ct_turma_visible_ids');
  const src = read('../js/release-notice.js');
  assert.ok(!/reveal_on_completion|outros_revealed|happened_on/.test(src.replace(/^\/\/.*$/gm, '')),
    'no reveal predicate re-implemented in the front');
});

test('the notice goes out as material_novo, e-mail and push, no bell', () => {
  const src = read('../js/release-notice.js');
  assert.match(src, /category: 'material_novo'/);
  assert.match(src, /channels: \{ bell: false, email: true, push: true \}/);
});

test('every path that can reveal material asks after it', () => {
  const rel = read('../content/releases.js');
  // _saveAula, _saveOutros, the copy-from modal, and "marcar como ocorrida" from the list.
  assert.equal((rel.match(/watchVisibility\(/g) || []).length, 4, 'releases.js: four snapshots');
  assert.equal((rel.match(/watch\.done\(/g) || []).length, 4, 'releases.js: four prompts');
  const coh = read('../cohorts/cohorts.js');
  // Outros revealed, "marcar como ocorrida" in the aula detail, and "Ocorreu em" in the editor.
  assert.equal((coh.match(/watchVisibility\(/g) || []).length, 3, 'cohorts.js: three snapshots');
  assert.equal((coh.match(/watch\.done\(/g) || []).length, 3, 'cohorts.js: three prompts');
});

test('the reminder field speaks São Paulo time, whatever the browser says', () => {
  const nineSp = Date.UTC(2026, 9, 22, 12, 0) / 1000;           // 09:00 in São Paulo = 12:00 UTC
  assert.equal(spInputValue(nineSp), '2026-10-22T09:00');
  assert.equal(spInputToSec('2026-10-22T09:00'), nineSp);
  assert.equal(spInputValue(null), '');
  assert.equal(spInputToSec('amanhã'), null);
});

test('the lesson editor shows the reminder and sends it only when Élder changed it', () => {
  const coh = read('../cohorts/cohorts.js');
  assert.match(coh, /class="cdx-aula-reminder"/);
  assert.match(coh, /remInput\.value !== remShown/, 'an untouched field leaves the rule in charge');
});
