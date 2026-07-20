// tests/courses-roteiro-base.test.mjs
// track-46 fatia 2b, source-level contract for the Cursos base-roteiro editor:
// cohorts/courses.js reuses roteiro-view.js VERBATIM (the exact same file the
// aula Roteiro sub-tab mounts), swapping in a store bound to the curso's numbered
// bases instead of forking/duplicating the two-panel component.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const courses = readSrc('../cohorts/courses.js');
const cohorts = readSrc('../cohorts/cohorts.js');
const roteiroCss = readSrc('../roteiro/roteiro.css');
const pt = (await import('../i18n/pt.js')).default;
const en = (await import('../i18n/en.js')).default;

test('courses.js reuses the SAME roteiro-view.js the aula Roteiro sub-tab mounts (no fork)', () => {
  assert.match(courses, /import\s+\*\s+as\s+roteiroView\s+from\s+['"]\.\.\/roteiro\/roteiro-view\.js['"]/, 'imports the shared two-panel view');
  assert.match(cohorts, /from\s+['"]\.\.\/roteiro\/roteiro-view\.js['"]/, 'the aula pane imports the identical path');
  // only ONE roteiro-view.js exists in the tree (also guarded generically by
  // modules.test.mjs's duplicate-name check; asserted here for this feature too)
  const hits = fs.readdirSync(fileURLToPath(new URL('../roteiro/', import.meta.url))).filter((f) => f === 'roteiro-view.js');
  assert.equal(hits.length, 1);
});

test('the base editor is a DIFFERENT injected store, built on the roteiro-model + facade, never a duplicated view', () => {
  assert.match(courses, /import\s*\{\s*normalizeRoteiro,\s*nextBaseNumber\s*\}\s*from\s*['"]\.\.\/js\/roteiro-model\.js['"]/, 'uses the pure model helpers');
  assert.match(courses, /roteiro\s+as\s+roteiroApi/, 'imports the roteiro facade group');
  assert.match(courses, /function _courseRoteiroStore\s*\(/, 'has its own store factory (course-scoped, single consumer)');
  const start = courses.indexOf('function _courseRoteiroStore');
  const storeFnSrc = courses.slice(start, start + 800); // generous window, the factory body is short
  assert.match(storeFnSrc, /load\s*\(/, 'store exposes load()');
  assert.match(storeFnSrc, /save\s*\(/, 'store exposes save()');
  assert.match(storeFnSrc, /roteiroApi\.saveCourseBase\(/, 'save() persists through ct_save_course_roteiro');
});

test('list / edit / add-new-numbered-base are all wired', () => {
  assert.match(courses, /function _roteiroTabsHtml\s*\(/, 'lists the bases');
  assert.match(courses, /function _selectBase\s*\(/, 'selecting a base mounts it for editing');
  assert.match(courses, /function _onNewBase\s*\(/, 'adds a new numbered base');
  assert.match(courses, /nextBaseNumber\(/, 'the new base number is computed, not hardcoded');
  assert.match(courses, /roteiroApi\.listCourseBases\(/, 'lists the curso bases via the facade');
});

test('the reused view is properly mounted/unmounted on course switch and module unmount (no leak)', () => {
  assert.match(courses, /_unmountRoteiroEditor\(\)/, 'has an unmount helper');
  const mountFn = courses.match(/export function mount[\s\S]*?\n\}/);
  const unmountFn = courses.match(/export function unmount[\s\S]*?\n\}/);
  const selectFn = courses.match(/function _selectCourse[\s\S]*?\n\}/);
  assert.ok(unmountFn && /_unmountRoteiroEditor\(\)/.test(unmountFn[0]), 'module unmount tears down the editor');
  assert.ok(selectFn && /_unmountRoteiroEditor\(\)/.test(selectFn[0]), 'switching course tears down the previous base editor first');
  assert.ok(mountFn, 'mount exists');
});

test('never calls callWorker directly (facade-only, matching the rest of courses.js)', () => {
  assert.ok(!/\bcallWorker\s*\(/.test(courses), 'no direct callWorker() call');
});

test('the reused-view time meter is hidden in the course-base context (no per-base hours target exists)', () => {
  assert.match(roteiroCss, /#cdx-cur-roteiro-view\s*\.cdx-roteiro-meter\s*\{\s*display:\s*none;?\s*\}/);
});

test('every i18n key the base editor references exists in BOTH pt.js and en.js', () => {
  const keys = [
    'cohorts.cursos_roteiros_title', 'cohorts.cursos_roteiro_new',
    'cohorts.cursos_roteiro_empty', 'cohorts.cursos_roteiro_created',
    'roteiro.base_option',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `${k} in pt.js`);
    assert.ok(k in en, `${k} in en.js`);
  }
});
