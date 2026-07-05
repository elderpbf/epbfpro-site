// Course lifecycle (duplicate + guarded delete) + the two small cohort fixes from the
// same batch (Élder 2026-07-05): the turma-create session-cache refresh (item C) and the
// field-label/hint cleanup. Source-regex + i18n-parity, the house style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

const coursesSrc = read('../cohorts/courses.js');
const cohortsSrc = read('../cohorts/cohorts.js');
const cohortsCss = read('../cohorts/cohorts.css');
const facadeSrc = read('../js/codex-api.js');

test('BUG FIX: dossier-pane transparent rule is scoped to the DIRECT empty-state placeholder', () => {
  assert.match(cohortsCss, /\.cdx-doss-pane:has\(>\s*\.cdx-doss-body\s*>\s*\.cdx-placeholder\)/, 'scoped :has selector');
  assert.ok(!/\.cdx-doss-pane:has\(\.cdx-placeholder\)\s*\{/.test(cohortsCss), 'no broad :has(.cdx-placeholder) that a nested loader placeholder would trip');
});

test('item 8/9: the cursos description is gone and "+ new" moved into the rail header', () => {
  assert.ok(!/cursos_desc/.test(coursesSrc), 'no cursos_desc rendered');
  assert.ok(!/cdx-cursos-sub/.test(coursesSrc), 'no description subtitle');
  assert.match(coursesSrc, /cdx-cursos-rail-h[\s\S]{0,240}cdx-cursos-add/, 'rail header carries the + add button');
  assert.match(coursesSrc, /class="cdx-cursos-add" id="cdx-cursos-new"/, 'the add button is in the rail head');
  assert.match(coursesSrc, />\+<\/button>/, 'the add control renders a bare +');
});

test('item 3: an editable-fields hint is rendered on the course meta', () => {
  assert.match(coursesSrc, /cdx-cursos-edithint/, 'edit hint element');
  assert.match(coursesSrc, /cohorts\.cursos_edit_hint/, 'edit hint string');
});

test('item 4: archived courses load + render as a reversible bottom section', () => {
  assert.match(coursesSrc, /include_archived:\s*true/, 'loads archived courses');
  assert.match(coursesSrc, /cdx-cursos-arch-h/, 'archived section header');
  assert.match(coursesSrc, /is-archived/, 'archived rows are marked');
  assert.match(coursesSrc, /api\.unarchive\(/, 'unarchive wired');
  assert.match(facadeSrc, /unarchive:\s*\(p\)\s*=>\s*call\('ct_unarchive_course'/, 'facade -> ct_unarchive_course');
});

test('IV: the course meta row carries Duplicate + Delete alongside Archive', () => {
  assert.match(coursesSrc, /id="cdx-cur-duplicate"/, 'Duplicate button');
  assert.match(coursesSrc, /id="cdx-cur-delete"/, 'Delete button');
  assert.match(coursesSrc, /id="cdx-cur-archive"/, 'Archive button kept');
});

test('IV: duplicate + delete route through the facade to the new worker actions', () => {
  assert.match(coursesSrc, /api\.duplicate\(/, 'wires duplicate');
  assert.match(coursesSrc, /api\.remove\(/, 'wires delete');
  assert.match(facadeSrc, /duplicate:\s*\(p\)\s*=>\s*call\('ct_duplicate_course'/, 'facade -> ct_duplicate_course');
  assert.match(facadeSrc, /remove:\s*\(p\)\s*=>\s*call\('ct_delete_course'/, 'facade -> ct_delete_course');
});

test('IV: delete handles the in-use guard via the thrown error payload', () => {
  assert.match(coursesSrc, /course_in_use/, 'handles course_in_use');
  assert.match(coursesSrc, /err\.data\s*&&\s*err\.data\.error/, 'reads err.data.error (facade throws on {error})');
});

test('II: creating a turma invalidates the cached session list so the dossier select refreshes', () => {
  assert.match(cohortsSrc, /!isEdit[\s\S]{0,60}_cpSessions\s*=\s*\[\][\s\S]{0,60}_dossierDepsTried\s*=\s*false/, 'resets the cp cache on create');
});

test('III: whatsapp field shows an optional hint and the labels drop the "(optional)" suffix', async () => {
  assert.match(cohortsSrc, /cohorts\.field_whatsapp_hint/, 'whatsapp field renders the hint key');
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  assert.ok(!/opcional/i.test(pt['cohorts.field_whatsapp']), 'pt whatsapp label has no (opcional)');
  assert.ok(!/optional/i.test(en['cohorts.field_whatsapp']), 'en whatsapp label has no (optional)');
  assert.ok(!/opcional/i.test(pt['cohorts.field_display_name']), 'pt display-name label has no (opcional)');
  assert.ok(!/optional/i.test(en['cohorts.field_display_name']), 'en display-name label has no (optional)');
});

test('the new i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'cohorts.course_duplicate', 'cohorts.course_duplicated', 'cohorts.course_delete',
    'cohorts.course_deleted', 'cohorts.course_delete_title', 'cohorts.course_delete_msg',
    'cohorts.course_delete_in_use', 'cohorts.field_whatsapp_hint',
    'cohorts.course_unarchive', 'cohorts.course_unarchived', 'cohorts.course_archived_section',
    'cohorts.cursos_edit_hint',
  ];
  for (const k of keys) { assert.ok(k in pt, `pt ${k}`); assert.ok(k in en, `en ${k}`); }
  // item 8: the deleted description key is gone from both dictionaries.
  assert.ok(!('cohorts.cursos_desc' in pt), 'pt cursos_desc removed');
  assert.ok(!('cohorts.cursos_desc' in en), 'en cursos_desc removed');
});
