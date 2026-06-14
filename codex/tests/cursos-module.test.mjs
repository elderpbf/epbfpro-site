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
  assert.match(courses, /from '\.\/ementa\.js'/, 'imports the ementa model');
  for (const fn of ['parseEmenta', 'normalizeEmenta', 'ementaStats', 'emptyEmenta']) {
    assert.ok(courses.includes(fn), `uses ${fn}`);
  }
});

test('every user-facing string in courses goes through t()', () => {
  // No raw Portuguese sentences in markup: the only quoted PT should be via t('...').
  // Heuristic: there is no '>Algum texto<' literal and i18n keys are present.
  assert.ok(courses.includes("t('cohorts.cursos_title')"), 'uses the cursos i18n keys');
  assert.ok(!/>[A-ZÀ-Ý][a-zà-ý]+ [a-zà-ý]+</.test(courses), 'no hardcoded PT sentence in markup');
});
