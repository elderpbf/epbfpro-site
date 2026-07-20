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
  // The course CRUD facade, plus the shared `ai` facade for the assistant, plus
  // (track-46 fatia 2b) the `roteiro` facade for the base-roteiro editor — all
  // from codex-api.js (never callWorker directly).
  assert.match(courses, /import \{ courses as api, ai(?:, content as contentApi)?(?:, roteiro as roteiroApi)? \} from '\.\.\/js\/codex-api\.js'/, 'imports the courses + ai (+ content) (+ roteiro) facades');
  for (const m of ['api.list', 'api.get', 'api.create', 'api.update', 'api.archive']) {
    assert.ok(courses.includes(m + '('), `uses ${m}()`);
  }
  assert.ok(!/callWorker\s*\(/.test(courses), 'never calls callWorker directly');
});

test('cursos AI assistant wires the shared ai.chat seam + the pure ementa prompt/parse', () => {
  assert.match(courses, /from '\.\.\/js\/ementa\.js'/, 'imports the shared ementa model');
  for (const fn of ['buildEmentaAIPrompt', 'parseEmentaAIResponse']) {
    assert.ok(courses.includes(fn), `uses ${fn}`);
  }
  assert.match(courses, /ai\.chat\(\{/, 'calls the shared ai.chat facade');
  // the two-panel layout + chat surface from the b2 hybrid
  for (const id of ['cdx-cursos-duo', 'cdx-cur-ia', 'cdx-cur-chat', 'cdx-cur-ai-input', 'cdx-cur-ai-send']) {
    assert.ok(courses.includes(id), `assistant panel has #${id}`);
  }
});

test('cursos assistant "De uma apostila" pulls Conteúdo sets through the content facade', () => {
  assert.match(courses, /content as contentApi/, 'imports the content facade');
  assert.match(courses, /contentApi\.listSets\(/, 'lists apostila sets');
  assert.match(courses, /contentApi\.getSet\(/, 'reads a set for its sections');
  for (const fn of ['_loadApostilas', '_genFromApostila']) {
    assert.ok(courses.includes(fn), `has ${fn}`);
  }
  assert.ok(courses.includes('cdx-cur-apostila'), 'has the apostila picker');
  // the generated request flows through the same AI pipeline (_askAI)
  assert.ok(courses.includes("t('cohorts.cursos_ia_apostila_prompt')"), 'builds the apostila generation prompt');
  assert.match(courses, /_askAI\(apiText,/, 'feeds the apostila material to _askAI');
});

test('courses builds the ementa with the pure ementa model', () => {
  assert.match(courses, /from '\.\.\/js\/ementa\.js'/, 'imports the shared ementa model');
  for (const fn of ['parseEmenta', 'normalizeEmenta', 'ementaStats', 'emptyEmenta']) {
    assert.ok(courses.includes(fn), `uses ${fn}`);
  }
});

test('turma form has the course picker + the typed-only instance fields', () => {
  assert.match(cohorts, /import \{ cohorts as api, cp as cpApi, courses as coursesApi/, 'imports the courses facade');
  // The form carries only the fields the admin actually types: the course picker
  // (seeds the certificate) plus date_start/format/place.
  for (const id of ['cdx-tf-course', 'cdx-tf-date-start', 'cdx-tf-format', 'cdx-tf-place']) {
    assert.ok(cohorts.includes(id), `turma form has #${id}`);
  }
  // Computed fields are NOT entered: hours (carga_horaria = Σ aula hours),
  // meetings (aula_count) and date_end (max aula date) are derived from the aulas
  // and shown in the dossier — never typed in the form. Modalidade also removed.
  for (const id of ['cdx-tf-hours', 'cdx-tf-date-end', 'cdx-tf-meetings', 'cdx-tf-modality']) {
    assert.ok(!cohorts.includes(id), `turma form no longer has #${id} (computed/removed)`);
  }
});

test('turma save sends only the typed course-instance fields to updateTurma', () => {
  for (const f of ['course_id:', 'date_start:', 'format:', 'place:']) {
    assert.ok(cohorts.includes(f), `save payload includes ${f}`);
  }
  // The computed fields are never sent from the form (the backend derives them).
  for (const f of ['date_end:', 'meetings:']) {
    assert.ok(!cohorts.includes(f), `save payload omits computed ${f}`);
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

test('cohorts merges Clientes+Turmas into one grouped list (Concept A left merge)', () => {
  // The merged list + the kept mobile-drawer wrapper. .cdx-cohorts-nav must survive the
  // rail migration verbatim: codex-topbar.js's DRAWER_SEL still matches it by name, so
  // dropping it silently costs Clientes its hamburger.
  for (const id of ['cdx-cohorts-list', 'cdx-cohorts-nav']) {
    assert.ok(cohorts.includes(id), `shell has #${id}`);
  }
  for (const fn of ['_loadAll', '_renderList', '_navModel', '_clientHead', '_turmaRowMain', '_turmaPhase']) {
    assert.ok(cohorts.includes(fn), `has ${fn}`);
  }
  // The old two-pane structure is gone.
  for (const dead of ['cdx-clients-list', 'cdx-turmas-list', '_renderClients', '_onTurmasClick']) {
    assert.ok(!cohorts.includes(dead), `removed ${dead}`);
  }
  // The nav IS the shared rail now — no second hand-rolled list, and no hand-rolled
  // auto-hide beside it (that duplication is exactly what track-41 exists to kill).
  assert.match(cohorts, /_navRail = mountRail\(/, 'the CLIENTES nav is the shared rail');
  assert.match(cohorts, /mode: 'autohide'/, '...in autohide mode, from the module');
  for (const gone of ['_openNav', '_closeNav', '_maybeHideNav', '_navPinned', 'NAV_REVEAL_ZONE'])
    assert.ok(!cohorts.includes(gone), `hand-rolled auto-hide gone: ${gone}`);
  // The pair is the row id: turma slugs are unique only within a client.
  assert.match(cohorts, /getId: \(tm\) => tm\.client_slug \+ '\/' \+ tm\.slug/, 'row id is client/turma');
});

test('per-turma actions moved into the dossier (nothing lost in the merge)', () => {
  for (const act of ['data-doss="archive"', 'data-doss="regen"', 'data-doss="copyurl"']) {
    assert.ok(cohorts.includes(act), `dossier wires ${act}`);
  }
  assert.match(cohorts, /cdx-doss-fact--trail/, 'dossier has the trail link card inside Dados da turma');
  // QR-share button beside the trail actions, wired to the reusable modal.
  assert.match(cohorts, /data-doss="qrshare"/, 'trail card has the QR-share button');
  assert.match(cohorts, /qr-share-modal\.js/, 'reuses the shared QR modal (no new QR)');
  assert.match(cohorts, /qrShare\.open\(\{ joinUrl/, 'QR button opens the modal with the trilha url');
  // those actions reuse the existing helpers
  for (const fn of ['_archiveTurma', '_regenToken', '_copyUrl']) {
    assert.ok(cohorts.includes(fn), `keeps ${fn}`);
  }
});

test('every user-facing string in courses goes through t()', () => {
  // No raw Portuguese sentences in markup: the only quoted PT should be via t('...').
  // Heuristic: there is no '>Algum texto<' literal and i18n keys are present.
  assert.ok(courses.includes("t('cohorts.cursos_title')"), 'uses the cursos i18n keys');
  assert.ok(!/>[A-ZÀ-Ý][a-zà-ý]+ [a-zà-ý]+</.test(courses), 'no hardcoded PT sentence in markup');
});
