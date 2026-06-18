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
