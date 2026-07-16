// cohorts/erase-modal.js — "Remover usuário" with the two modes (track-42).
//
// Élder 2026-07-15: "na opção de remover o usuário o sistema tem que me dar 2 opções. Uma remoção
// completa que é para todos os dados, não sobra nada. E outra remoção que é de anonimizar, mantém os
// dados porém anonimiza nos locais corretos."
//
// What these pin is that the modal tells the TRUTH before he commits: what dies, what survives, and
// what it cannot reach at all. The old remove said "tem certeza?" and then left the person's name
// written into the content while deleting the person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { consequenceLines } from '../cohorts/erase-modal.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const eraseJs = read('../cohorts/erase-modal.js');
const studentsJs = read('../cohorts/students.js');
const facadeJs = read('../js/codex-api.js');

const pv = (o = {}) => Object.assign({ participants: 1, submissions: 0, posts: 0, left_behind: { certificates: 0, questions_by_name: 0 } }, o);
const kinds = (l) => l.map((x) => x.kind);

test('purge DELETES the content; anonimizar KEEPS it, renamed to the anon label', () => {
  const p = pv({ submissions: 3, posts: 2 });
  assert.deepEqual(kinds(consequenceLines(p, 'purge')), ['del', 'del']);
  // anonymize leads with the "becomes anon" line, then the kept content — nobody left without a name
  assert.deepEqual(kinds(consequenceLines({ ...p, anon_label: 'anon9' }, 'anonymize')), ['keep', 'keep', 'keep']);
});

test('anonimizar shows the ACTUAL future label, not a vague "anônimo" (Élder 2026-07-16)', () => {
  const l = consequenceLines({ ...pv({ submissions: 1 }), anon_label: 'anon42' }, 'anonymize');
  assert.ok(l.some((x) => x.text.includes('anon42')));
});

test('anonimizar always says WHAT the record becomes, even with nothing attached', () => {
  const l = consequenceLines({ ...pv(), anon_label: 'anon9' }, 'anonymize');
  assert.deepEqual(kinds(l), ['keep']);   // just the "becomes anon9" line
  assert.ok(l[0].text.includes('anon9'));
});

test('the certificate is named in BOTH modes, keeping the real name either way', () => {
  const p = pv({ left_behind: { certificates: 1, questions_by_name: 0 } });
  assert.deepEqual(kinds(consequenceLines(p, 'purge')), ['warn']);   // purge: just the cert warning
  const a = consequenceLines({ ...p, anon_label: 'anon9' }, 'anonymize');
  assert.equal(a[a.length - 1].kind, 'warn');   // anonymize: the "becomes" line + the cert warning
});

test('anonimizar RENAMES the Perguntas rows (they are no longer "left behind")', () => {
  const l = consequenceLines({ ...pv({ left_behind: { certificates: 0, questions_by_name: 4 } }), anon_label: 'anon9' }, 'anonymize');
  assert.ok(l.some((x) => x.kind === 'keep' && /4/.test(x.text)));   // a keep line, not a warn
});

test('the Perguntas remnant is a warning, never counted as erased', () => {
  const l = consequenceLines(pv({ left_behind: { certificates: 0, questions_by_name: 4 } }), 'purge');
  assert.deepEqual(kinds(l), ['warn']);
});

test('a person with nothing attached says so, instead of showing an empty box', () => {
  const l = consequenceLines(pv(), 'purge');
  assert.deepEqual(l, []);   // the renderer turns this into the "só o cadastro" line
  assert.match(eraseJs, /erase_nothing_else/);
});

test('ONLY true facts appear: no submissions means no submissions line', () => {
  // A generic "certificates may remain" on every person is how a warning box gets ignored.
  const l = consequenceLines(pv({ posts: 1 }), 'purge');
  assert.equal(l.length, 1);
});

test('anonimizar is the default — the destructive mode is never reached by inertia', () => {
  assert.match(eraseJs, /segmentedHtml\('erase-mode', opts, 'anonymize'\)/);
});

test('the counts are fetched BEFORE the decision, and a failed preview blocks the erase', () => {
  // A warning that only arrives in the result is a warning about something already gone.
  assert.match(eraseJs, /erasePreview\(\{ student_id: p\.id \}\)/);
  assert.match(eraseJs, /erase_preview_failed/);
  assert.match(eraseJs, /id="cdx-er-go"[^>]*disabled/);   // starts dead, only the preview arms it
});

test('purge asks a SECOND time, and says it cannot be undone', () => {
  assert.match(eraseJs, /erase_confirm_purge/);
  for (const f of [read('../i18n/pt.js'), read('../i18n/en.js')]) {
    assert.match(f, /'alunos\.erase_confirm_purge':[^\n]*(desfazer|undone)/);
  }
});

test('the GLOBAL remove opens the modal; the turma panel keeps its own meaning', () => {
  // In the roster, remove already meant "the person is gone". In the dossiê it means "out of THIS
  // turma" — a different act, and it must not inherit the erase modal.
  assert.match(studentsJs, /if \(act === 'remove'\) \{[\s\S]{0,200}openEraseModal\(/);
  assert.doesNotMatch(read('../cohorts/participant-view.js'), /openEraseModal/);
});

test('the facade carries both halves, pointing at the actions the worker registers', () => {
  assert.match(facadeJs, /erasePreview:\s*\(p\) => call\('ct_erase_preview', p\)/);
  assert.match(facadeJs, /erasePerson:\s*\(p\) => call\('ct_erase_person', p\)/);
});

test('the modal reuses the segmented pill instead of growing a second one', () => {
  assert.match(eraseJs, /import \{ segmentedHtml \} from '\.\/cleanup-modal\.js'/);
});
