// Source-contract for Batch B: the turma-scoped management surfaces (Liberações +
// Tarefas) live in the cohort dossier, not the Content tab. They reuse the SAME
// modules (content/releases.js, content/tarefas.js), mounted turma-bound so they
// skip their picker. Plus the per-turma delete fix: removing a tarefa from a turma
// unreleases it (per-turma) instead of deleting the global library item (which used
// to wipe it from every turma at once). These pin the relocation + the fix so a
// refactor can't silently re-bridge them to Content or restore the global delete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

const cohortsJs = read('../cohorts/cohorts.js');
const contentJs = read('../content/content.js');
const releasesJs = read('../content/releases.js');
const tarefasJs = read('../content/tarefas.js');
const ptJs = read('../i18n/pt.js');
const enJs = read('../i18n/en.js');

test('the dossier has Liberações + Tarefas sub-tabs and panels', () => {
  assert.match(cohortsJs, /data-dtab="liberacoes"/, 'liberacoes sub-tab button');
  assert.match(cohortsJs, /data-dtab="tarefas"/, 'tarefas sub-tab button');
  assert.match(cohortsJs, /data-dpanel="liberacoes"/, 'liberacoes panel');
  assert.match(cohortsJs, /data-dpanel="tarefas"/, 'tarefas panel');
  assert.match(cohortsJs, /id="cdx-doss-liberacoes"/, 'liberacoes mount point');
  assert.match(cohortsJs, /id="cdx-doss-tarefas"/, 'tarefas mount point');
});

test('cohorts reuses the existing modules, mounted turma-bound (no duplicated composer)', () => {
  assert.match(cohortsJs, /import \* as releasesAdmin from '\.\.\/content\/releases\.js'/, 'imports releases module');
  assert.match(cohortsJs, /import \* as tarefasAdmin from '\.\.\/content\/tarefas\.js'/, 'imports tarefas module');
  // The modules take the port-foundation turma-bound mount: { clientSlug, turmaSlug }.
  assert.match(cohortsJs, /_embed\s*=\s*\{ clientSlug: turma\.client_slug, turmaSlug: turma\.slug \}/, 'builds the embed ctx');
  assert.match(cohortsJs, /releasesAdmin\.mount\(e, _embed\)/, 'mounts releases turma-bound');
  assert.match(cohortsJs, /tarefasAdmin\.mount\(e, _embed\)/, 'mounts tarefas turma-bound');
});

test('the heavy management panels mount lazily on first open', () => {
  assert.match(cohortsJs, /_lazyMount\s*=/, 'lazy mount registry');
  assert.match(cohortsJs, /_mounted\[key\]\s*=\s*true/, 'each lazy panel mounts once');
});

test('Tarefas + Liberações are no longer Content sub-tabs', () => {
  assert.ok(!/key:\s*'tarefas'/.test(contentJs), 'Tarefas not in Content SUBTABS');
  assert.ok(!/key:\s*'releases'/.test(contentJs), 'Liberações not in Content SUBTABS');
  assert.ok(!/import \* as tarefas from/.test(contentJs), 'Content does not import tarefas');
  assert.ok(!/import \* as releases from/.test(contentJs), 'Content does not import releases');
});

test('releases supports a turma-bound (picker-less) mount', () => {
  assert.match(releasesJs, /export function mount\(viewEl, ctx = \{\}\)/, 'mount accepts a ctx');
  assert.match(releasesJs, /if \(ctx\.clientSlug && ctx\.turmaSlug\)/, 'embedded when clientSlug+turmaSlug given');
  assert.match(releasesJs, /_q\('cdx-rel-picker'\); if \(pk\) pk\.style\.display = 'none'/, 'picker hidden when embedded');
  assert.match(releasesJs, /_loadReleases\(ctx\.clientSlug, ctx\.turmaSlug\)/, 'loads the bound turma directly');
});

test('tarefas supports a turma-bound (picker-less) mount', () => {
  assert.match(tarefasJs, /export function mount\(viewEl, ctx = \{\}\)/, 'mount accepts a ctx');
  assert.match(tarefasJs, /if \(ctx\.clientSlug && ctx\.turmaSlug\)/, 'embedded when clientSlug+turmaSlug given');
  assert.match(tarefasJs, /_q\('cdx-tar-picker'\); if \(pk\) pk\.style\.display = 'none'/, 'picker hidden when embedded');
  assert.match(tarefasJs, /_loadTarefas\(ctx\.clientSlug, ctx\.turmaSlug\)/, 'loads the bound turma directly');
});

test('per-turma delete fix: removing a tarefa unreleases it, never deletes the global item', () => {
  // The remove flow must call the per-turma unrelease, scoped to this client+turma.
  assert.match(tarefasJs, /relApi\.unrelease\(\{ item_id: item\.id, client_slug: _client, turma_slug: _turma \}\)/, 'removes via per-turma unrelease');
  // And it must NOT call the global ct_delete_item from the per-turma remove flow.
  assert.ok(!/api\.deleteItem\(/.test(tarefasJs), 'no global deleteItem call remains in tarefas');
  assert.match(tarefasJs, /t\('tarefas\.remove_btn'\)/, 'uses the per-turma remove label');
});

test('Batch B i18n keys exist in both pt and en', () => {
  for (const k of [
    'cohorts.doss_liberacoes', 'cohorts.doss_tarefas',
    'tarefas.remove_title', 'tarefas.remove_warning', 'tarefas.remove_btn', 'tarefas.removed',
  ]) {
    const re = new RegExp("'" + k.replace(/\./g, '\\.') + "'");
    assert.match(ptJs, re, `${k} in pt`);
    assert.match(enJs, re, `${k} in en`);
  }
});
