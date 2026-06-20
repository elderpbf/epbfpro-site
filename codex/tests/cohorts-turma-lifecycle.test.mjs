// Source-contract for the turma lifecycle controls (Batch A): a turma can be
// unarchived back to active and permanently deleted from its dossier. Delete is
// irreversible, so it must be gated by the typed-name confirm modal. These pin
// the wiring (facade mapping + dossier buttons + handlers) so a refactor can't
// silently drop the confirm step or the facade hop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

const facadeJs = read('../js/codex-api.js');
const cohortsJs = read('../cohorts/cohorts.js');
const ptJs = read('../i18n/pt.js');
const enJs = read('../i18n/en.js');

test('facade maps unarchive/delete turma to the frozen ct_* actions', () => {
  assert.match(facadeJs, /unarchiveTurma:\s*\(p\)\s*=>\s*call\('ct_unarchive_turma',\s*p\)/);
  assert.match(facadeJs, /deleteTurma:\s*\(p\)\s*=>\s*call\('ct_delete_turma',\s*p\)/);
});

test('archived dossier shows Desarquivar + Deletar (and active shows Arquivar)', () => {
  assert.match(cohortsJs, /data-doss="unarchive"/);
  assert.match(cohortsJs, /data-doss="delete"/);
  assert.match(cohortsJs, /data-doss="archive"/);
});

test('dossier click handler routes unarchive/delete to their helpers', () => {
  assert.match(cohortsJs, /a === 'unarchive'\)\s*_unarchiveTurma\(/);
  assert.match(cohortsJs, /a === 'delete'\)\s*_deleteTurma\(/);
});

test('unarchive calls the facade; delete is gated by the typed-name confirm modal', () => {
  assert.match(cohortsJs, /function _unarchiveTurma[\s\S]*?api\.unarchiveTurma\(/);
  // _deleteTurma must go through _openDeleteConfirm (typed-name) before api.deleteTurma
  const del = cohortsJs.match(/function _deleteTurma\([\s\S]*?\n}/);
  assert.ok(del, '_deleteTurma defined');
  assert.match(del[0], /_openDeleteConfirm\(/, 'delete gated by typed-name confirm');
  assert.match(del[0], /confirmName:\s*turma\.name/, 'confirm matches the turma name');
  assert.match(del[0], /api\.deleteTurma\(/, 'delete calls the facade');
});

test('lifecycle i18n keys exist in both dictionaries', () => {
  for (const key of [
    'cohorts.unarchive', 'cohorts.turma_unarchived', 'cohorts.turma_deleted',
    'cohorts.delete_turma_btn', 'cohorts.delete_turma_warning',
  ]) {
    assert.ok(ptJs.includes(`'${key}'`), `pt.js has ${key}`);
    assert.ok(enJs.includes(`'${key}'`), `en.js has ${key}`);
  }
});

test('delete confirm matches the typed name case-insensitively', () => {
  // The name is shown uppercased (label styling), so a PascalCase turma must
  // still confirm when the user types what they see.
  assert.match(cohortsJs, /toLowerCase\(\) === String\(opts\.confirmName\)\.trim\(\)\.toLowerCase\(\)/);
});

test('turma actions update in place, not via a full reload', () => {
  // The success path mutates _turmas + re-renders in place (no _loadAll refetch,
  // which the user saw as a whole-page refresh).
  assert.match(cohortsJs, /turma_archived'\)\);\s*const tm = _findTurma/);
  assert.match(cohortsJs, /turma_unarchived'\)\);\s*const tm = _findTurma/);
  assert.match(cohortsJs, /turma_deleted'\)\);\s*const wasSelected/);
  assert.match(cohortsJs, /_refreshDossierHeader\(/, 'archive/unarchive repaint the header in place');
  // none of the lifecycle success handlers fall back to a full reload
  assert.ok(!/turma_(archived|unarchived|deleted)'\)\);[\s\S]{0,400}?_loadAll\(\)/.test(cohortsJs),
    'lifecycle actions do not call _loadAll');
});

test('client groups are an accordion: collapsed by default, one open', () => {
  // rows wrapped so CSS can collapse them; is-open keyed to the single _expandedClient.
  assert.match(cohortsJs, /class="cdx-cg-rows"/);
  assert.match(cohortsJs, /client\.slug === _expandedClient \? ' is-open'/);
  assert.match(cohortsJs, /function _toggleClient\(/);
  const css = read('../cohorts/cohorts.css');
  assert.match(css, /\.cdx-cg-rows \{ display: none/);
  assert.match(css, /\.cdx-cg\.is-open \.cdx-cg-rows \{ display: block/);
});

test('phase uses aula-derived dates (a turma with future classes reads live)', () => {
  assert.match(cohortsJs, /computed_date_start \|\| tm\.date_start/);
  assert.match(cohortsJs, /computed_date_end \|\| tm\.date_end/);
});

test('the list sections clients into ativos / futuros / inativos', () => {
  assert.match(cohortsJs, /_SECTIONS = \['ativo', 'futuro', 'inativo'\]/);
  assert.match(cohortsJs, /function _clientStatus\(/);
  assert.match(cohortsJs, /function _sortTurmas\(/);
  assert.match(cohortsJs, /class="cdx-cg-section"/);
  for (const key of ['cohorts.section_ativo', 'cohorts.section_futuro', 'cohorts.section_inativo']) {
    assert.ok(ptJs.includes(`'${key}'`) && enJs.includes(`'${key}'`), `${key} in both dicts`);
  }
});

test('turma phase is a left bar (not a dot); client uses its own icon; hover = selected teal', () => {
  assert.match(cohortsJs, /class="cdx-ti ' \+ ph\.cls/);
  assert.ok(!/cdx-ti-dot/.test(cohortsJs), 'phase dot removed');
  // icon goes through _iconSrc (R2 key -> served URL), with an initials fallback
  assert.match(cohortsJs, /src="' \+ _esc\(_iconSrc\(client\.icon_path\)\)/);
  assert.match(cohortsJs, /function _wireAvatars\(/);
  const css = read('../cohorts/cohorts.css');
  assert.match(css, /border-left: 3px solid var\(--ph/);
  assert.match(css, /\.cdx-ti:hover,\s*\.cdx-ti\.is-on \{ background: var\(--cdx-chip-bg\)/);
});
