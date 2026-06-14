// Cursos sub-tab contract (source-level): cohorts gains a 'cursos' sub-tab that
// routes to cohorts/courses.js, which talks to the backend ONLY through the
// courses facade and builds its ementa with the pure cohorts/ementa.js model.
// The rendered look is staging-verified (Playwright), per the project philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const cohorts = read('../cohorts/cohorts.js');
const courses = read('../cohorts/courses.js');

test('cohorts exposes a sub-tab registry with turmas + cursos', () => {
  assert.match(cohorts, /export const SUBTABS/, 'SUBTABS exported');
  assert.match(cohorts, /key:\s*'turmas'/, 'turmas sub-tab');
  assert.match(cohorts, /key:\s*'cursos'/, 'cursos sub-tab');
  assert.match(cohorts, /export function subtabs/, 'subtabs() exported');
});

test('cohorts.mount routes the cursos sub to the courses module', () => {
  assert.match(cohorts, /import \* as cursos from '\.\/courses\.js'/, 'imports the courses module');
  assert.match(cohorts, /if \(sub === 'cursos'\)\s*\{\s*cursos\.mount/, 'routes sub === cursos to cursos.mount');
  assert.match(cohorts, /cursos\.unmount\(\)/, 'unmount tears down the cursos module');
});

test('courses module satisfies the sub-module contract', () => {
  assert.match(courses, /export function mount\s*\(/, 'exports mount');
  assert.match(courses, /export function unmount\s*\(/, 'exports unmount');
});

test('courses talks to the backend only through the courses facade', () => {
  assert.match(courses, /import \{ courses as api \} from '\.\.\/js\/codex-api\.js'/, 'imports the courses facade');
  for (const m of ['api.list', 'api.get', 'api.create', 'api.update', 'api.archive']) {
    assert.ok(courses.includes(m + '('), `uses ${m}()`);
  }
  assert.ok(!/callWorker\s*\(/.test(courses), 'never calls callWorker directly');
});

test('courses builds the ementa with the pure ementa model', () => {
  assert.match(courses, /from '\.\.\/js\/ementa\.js'/, 'imports the shared ementa model');
  for (const fn of ['parseEmenta', 'normalizeEmenta', 'ementaStats', 'emptyEmenta']) {
    assert.ok(courses.includes(fn), `uses ${fn}`);
  }
});

test('turma form gains the course picker + instance fields (feed the certificate)', () => {
  assert.match(cohorts, /import \{ cohorts as api, cp as cpApi, courses as coursesApi/, 'imports the courses facade');
  for (const id of ['cdx-tf-course', 'cdx-tf-hours', 'cdx-tf-date-start', 'cdx-tf-date-end', 'cdx-tf-format', 'cdx-tf-modality', 'cdx-tf-place', 'cdx-tf-meetings']) {
    assert.ok(cohorts.includes(id), `turma form has #${id}`);
  }
});

test('turma save sends the course-instance fields to updateTurma', () => {
  for (const f of ['course_id:', 'date_start:', 'date_end:', 'format:', 'place:', 'meetings:', 'modality:']) {
    assert.ok(cohorts.includes(f), `save payload includes ${f}`);
  }
});

test('turma copies the course ementa only when the course is newly linked/changed (decision 1d)', () => {
  // The ementa copy is guarded by a course-changed check, so a turma edit never
  // clobbers its own ementa.
  assert.match(cohorts, /courseId !== prevCourseId/, 'guards ementa copy on course change');
  assert.match(cohorts, /instance\.ementa_json = _pickedCourse\.ementa_json/, 'copies the picked course ementa');
});

test('turma dossier (Concept A) replaces the cramped aulas pane', () => {
  assert.match(cohorts, /function _renderDossier/, 'has the dossier renderer');
  assert.match(cohorts, /id="cdx-turma-dossier"/, 'shell column 3 is the dossier container');
  assert.ok(!cohorts.includes("id=\"' + IDS.aulasTitle"), 'old aulas-pane title is gone');
  // dossier surfaces the rich turma fields
  for (const f of ['turma.course_title', 'turma.hours', 'turma.date_start', 'turma.date_end', 'turma.place', 'turma.format']) {
    assert.ok(cohorts.includes(f), `dossier shows ${f}`);
  }
  // and the participants/aulas/cert sections
  assert.match(cohorts, /_loadDossierParticipants/, 'loads participants summary');
  assert.match(cohorts, /_loadDossierCerts/, 'loads cert summary');
  assert.match(cohorts, /import \{[^}]*certificates as certApi/, 'imports the certificates facade for the cert summary');
});

test('every user-facing string in courses goes through t()', () => {
  // No raw Portuguese sentences in markup: the only quoted PT should be via t('...').
  // Heuristic: there is no '>Algum texto<' literal and i18n keys are present.
  assert.ok(courses.includes("t('cohorts.cursos_title')"), 'uses the cursos i18n keys');
  assert.ok(!/>[A-ZÀ-Ý][a-zà-ý]+ [a-zà-ý]+</.test(courses), 'no hardcoded PT sentence in markup');
});
