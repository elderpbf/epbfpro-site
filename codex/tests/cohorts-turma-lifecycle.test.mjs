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
