// Courses facade: each method maps to the correct Worker action string
// (ct_*_course family, added with the Cursos data model / migration 0017) and
// passes params straight through. Also pins the new course-instance fields on
// cohorts.updateTurma. callWorker is stubbed to echo the final payload.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

globalThis.callWorker = (payload) => payload;

test('codex-api exports a `courses` group with the CRUD methods', () => {
  assert.ok(api.courses, 'codex-api exports a `courses` group');
  for (const m of ['list', 'get', 'create', 'update', 'archive']) {
    assert.equal(typeof api.courses[m], 'function', `courses.${m} is a function`);
  }
});

test('courses methods map to the frozen action strings', () => {
  const c = api.courses;
  const cases = [
    [() => c.list({}),                                          'ct_list_courses'],
    [() => c.get({ id: 1 }),                                    'ct_get_course'],
    [() => c.create({ title: 'IA Jurídica' }),                 'ct_create_course'],
    [() => c.update({ id: 1, title: 'IA Jurídica na Prática' }),'ct_update_course'],
    [() => c.archive({ id: 1 }),                                'ct_archive_course'],
  ];
  for (const [fn, action] of cases) {
    assert.equal(fn().action, action, `maps to ${action}`);
  }
});

test('courses.create passes title/hours/ementa_json through unchanged', () => {
  const ementa = JSON.stringify({ modules: [{ title: 'M1', topics: [{ title: 'T1', subtopics: ['s1'] }] }] });
  const out = api.courses.create({ title: 'IA do Zero', hours: '12 horas', ementa_json: ementa });
  assert.equal(out.action, 'ct_create_course');
  assert.equal(out.title, 'IA do Zero');
  assert.equal(out.hours, '12 horas');
  assert.equal(out.ementa_json, ementa);
});

test('cohorts.updateTurma carries the new course-instance fields through', () => {
  const out = api.cohorts.updateTurma({
    client_slug: 'vnc', slug: 'turma-a',
    course_id: 3, hours: '16 horas',
    ementa_json: '{"modules":[]}',
    date_start: '2026-08-04', date_end: '2026-08-06',
    format: 'presencial', place: 'Aracaju · SE', meetings: '4', modality: 'fechada',
  });
  assert.equal(out.action, 'ct_update_turma');
  assert.equal(out.course_id, 3);
  assert.equal(out.hours, '16 horas');
  assert.equal(out.date_start, '2026-08-04');
  assert.equal(out.date_end, '2026-08-06');
  assert.equal(out.format, 'presencial');
  assert.equal(out.place, 'Aracaju · SE');
  assert.equal(out.meetings, '4');
  assert.equal(out.modality, 'fechada');
});
