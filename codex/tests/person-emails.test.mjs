// The e-mail BOX on the person edit modal (track-42).
//
// Élder 2026-07-15: "o modal de edição do usuário hoje só tem espaço para um e-mail, aquele ali tem
// que virar uma caixa onde você pode ter múltiplas linhas, cada linha com e-mail diferente [...] o
// que é o principal é o primeiro da linha."
//
// The person already HAS more than one address (a merge gives them one), and ct_list_people already
// returns them. The single field was the one place that denied it. What these pin is the meaning of
// the box: order IS the primary, and what is not in it is not this person's address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { linesOf, fieldMarkup } from '../cohorts/participant-edit.js';
import { emailBoxValue } from '../cohorts/person-editor.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const editJs = read('../cohorts/participant-edit.js');
const studentsJs = read('../cohorts/students.js');
const editorJs = read('../cohorts/person-editor.js');
const facadeJs = read('../js/codex-api.js');

test('linesOf: an admin hitting Enter twice is not an empty address', () => {
  assert.deepEqual(linesOf('a@x.com\n\n  \nb@y.com'), ['a@x.com', 'b@y.com']);
  assert.deepEqual(linesOf('  a@x.com  '), ['a@x.com']);
  assert.deepEqual(linesOf(''), []);
  assert.deepEqual(linesOf(null), []);
  assert.deepEqual(linesOf(undefined), []);
});

test('linesOf preserves ORDER, because order is the whole meaning of the box', () => {
  assert.deepEqual(linesOf('z@x.com\na@x.com'), ['z@x.com', 'a@x.com']);
});

test('emailBoxValue: the primary is line 1, the aliases follow, unsorted', () => {
  assert.equal(
    emailBoxValue({ email: 'primary@x.com', aliases: ['a@y.com', 'b@z.com'] }),
    'primary@x.com\na@y.com\nb@z.com'
  );
});

test('emailBoxValue: one address is just one line — the common person is not a special case', () => {
  assert.equal(emailBoxValue({ email: 'solo@x.com', aliases: [] }), 'solo@x.com');
  assert.equal(emailBoxValue({ email: 'solo@x.com' }), 'solo@x.com');
});

test('emailBoxValue survives a person with no identity e-mail at all', () => {
  // A nameless roster row keeps student_id NULL and has no identity address. It must render an
  // empty box, never the string "undefined" for the admin to save back.
  assert.equal(emailBoxValue({ aliases: ['only@alias.com'] }), 'only@alias.com');
  assert.equal(emailBoxValue({}), '');
  assert.equal(emailBoxValue(null), '');
});

test('the field is a real multi-line box, and it says what the box means', () => {
  assert.match(editorJs, /key: 'email'[\s\S]{0,200}multiline: true/);
  assert.match(editorJs, /hint: t\('alunos\.emails_hint'\)/);
  // The hint is load-bearing: "first line is the primary" is a rule no textarea can show by itself.
  for (const f of [read('../i18n/pt.js'), read('../i18n/en.js')]) {
    assert.match(f, /'alunos\.emails_hint':/);
    assert.match(f, /'alunos\.emails_label':/);
  }
});

test('multiline renders a textarea and never tries to wear the secret eye', () => {
  assert.match(editJs, /f\.multiline\s*\n?\s*\?\s*'<textarea/);
  assert.match(editJs, /f\.secret && !f\.multiline/);   // a masked textarea has no eye to hang on
});

test('the box saves as ONE call carrying every line, not a call per address', () => {
  assert.match(editorJs, /api\.setPersonEmails\(\{ student_id: s\.id, emails \}\)/);
  assert.match(facadeJs, /setPersonEmails:\s*\(p\) => call\('ct_set_person_emails', p\)/);
  assert.doesNotMatch(studentsJs, /setPersonEmail\b(?!s)/);   // the single-address setter is gone
});

test('a taken address names WHICH line was taken, instead of blaming the whole box', () => {
  assert.match(editorJs, /email_belongs_to_another_person[\s\S]{0,120}replace\('\{email\}'/);
  for (const f of [read('../i18n/pt.js'), read('../i18n/en.js')]) {
    assert.match(f, /'alunos\.email_taken':\s*'\{email\}/);
  }
});

test('ONE editor: both the roster and the dossiê open the SHARED person editor (track-42)', () => {
  // Élder caught the duplication: the box landed in Usuários only, so the dossiê diverged. Both
  // now delegate to cohorts/person-editor.js; neither builds its own person-edit fields.
  const cohortsJs = read('../cohorts/cohorts.js');
  assert.match(studentsJs, /openPersonEditor\(s, \{ onSaved/);
  assert.match(cohortsJs, /openPersonEditor\(person, \{ onSaved \}\)/);
  assert.doesNotMatch(studentsJs, /openPersonEditModal\(/);
  assert.doesNotMatch(cohortsJs, /openPersonEditModal\(/);
});

test('a secret field WITH a value masks it and offers the eye (track-42)', () => {
  const h = fieldMarkup({ key: 'cpf', label: 'CPF', value: '111.444.777-35', secret: true });
  assert.match(h, /type="password"/);
  assert.match(h, /cdx-pe-eye/);
});

test('a secret field with NO value is a plain empty field — no dots, no eye (Élder 2026-07-16)', () => {
  // "se não tiver cpf deve estar vazio": an empty CPF must not render as dots the admin has to
  // reveal to see nothing, and an eye on an empty field toggles nothing.
  const h = fieldMarkup({ key: 'cpf', label: 'CPF', value: '', secret: true, placeholder: '000.000.000-00' });
  assert.doesNotMatch(h, /type="password"/);
  assert.doesNotMatch(h, /cdx-pe-eye/);
  assert.match(h, /value=""/);
});
