// #27 data foundation (source contract): each aula carries a numeric `hours`, and
// the turma dossier shows Carga horária / Encontros / período DERIVED from the aulas
// (worker ct_list_turmas: carga_horaria, aula_count, computed_date_*), not from the
// manually typed turma fields. Rendered behavior is staging-verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../cohorts/cohorts.js', import.meta.url), 'utf8');
const certs = readFileSync(new URL('../certificates/certificates.js', import.meta.url), 'utf8');

test('the aula editor has a numeric hours input and persists it', () => {
  assert.match(src, /class="cdx-aula-hours"/, 'aula editor renders the hours input');
  assert.match(src, /type="number"[^>]*class="cdx-aula-hours"/, 'hours input is numeric');
  assert.match(src, /hours:\s*hoursVal/, 'save payload carries hours');
  assert.match(src, /aula\.hours\s*=\s*payload\.hours/, 'local aula state updates hours');
});

test('the dossier shows DERIVED carga horária + encontros, refreshed live on aula edit', () => {
  assert.match(src, /turma\.carga_horaria/, 'reads the derived carga horária');
  assert.match(src, /turma\.aula_count/, 'reads the derived encontros count');
  assert.match(src, /turma\.computed_date_start/, 'reads the derived period start');
  assert.match(src, /cdx-doss-carga/, 'carga horária fact has a live-update id');
  assert.match(src, /function _refreshDerivedFacts/, 'recomputes the facts after an edit');
  assert.match(src, /_refreshDerivedFacts\(\)/, 'calls the refresh on save/delete');
});

test('cert issuance auto-fill prefers the derived turma totals over manual fields', () => {
  assert.match(certs, /turma\.carga_horaria.*\?\s*turma\.carga_horaria\s*:\s*turma\.hours/s, 'hours prefer carga_horaria, fall back to manual');
  assert.match(certs, /turma\.aula_count.*:\s*turma\.meetings/s, 'encontros prefer aula_count, fall back to manual');
});

// #27 UI: the dossier is the single editable surface — the Editar modal/button is
// gone and each field auto-saves inline.
test('the dossier has NO Editar button (the modal is killed)', () => {
  assert.ok(!/data-doss="edit"/.test(src), 'no edit button in the dossier');
  // _openTurmaForm survives ONLY for new-turma creation
  assert.match(src, /_openTurmaForm\(null\)/, 'new-turma still opens the create form');
});

test('the dossier fields are inline-editable and auto-save on blur/change', () => {
  assert.match(src, /function _wireDossierInlineEdit/, 'has the inline-edit wiring');
  assert.match(src, /data-edit-field="name"/, 'name (title) is editable');
  assert.match(src, /editSelect\('course_id'/, 'course is an editable select');
  assert.match(src, /editText\('display_name'/, 'display_name is editable (was modal-only)');
  assert.match(src, /editText\('whatsapp_url'/, 'whatsapp is editable (was modal-only)');
  assert.match(src, /data-edit-field="classpulse_session_id"/, 'classpulse is an editable auto-saving select');
  assert.match(src, /cdx-doss-session-go/, 'the session cell shares its space with a shortcut to the connected session');
  assert.match(src, /editSelect\('format'/, 'format is an editable select');
  assert.match(src, /editText\('place'/, 'place is editable');
  assert.match(src, /isSelect \? 'change' : 'blur'/, 'selects save on change, inputs on blur');
});

test('auto-save routes meta fields to ct_update_turma_meta, the rest to ct_update_turma', () => {
  assert.match(src, /field === 'whatsapp_url' \|\| field === 'classpulse_session_id'/, 'routes the two meta fields');
  assert.match(src, /api\.updateTurmaMeta/, 'meta fields go through update_turma_meta');
  assert.match(src, /api\.updateTurma\(payload\)/, 'other fields go through update_turma');
});

test('modality is NOT an inline-editable field (it is being retired)', () => {
  assert.ok(!/data-edit-field="modality"/.test(src), 'no inline modality editor');
});
