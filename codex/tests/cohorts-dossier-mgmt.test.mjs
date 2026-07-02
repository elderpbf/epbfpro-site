// Source-contract for the turma-scoped management surfaces (Liberações + Tarefas):
// they live in the cohort dossier, not the Content tab, and reuse the SAME modules
// (content/releases.js, content/tarefas.js) rather than a duplicated composer. As of
// the Aula-hub redesign (Layout A) they are mounted AULA-LOCKED inside each aula's
// detail (the old turma-level Liberações/Tarefas sub-tabs were retired into the hub).
// Plus the per-turma delete fix: removing a tarefa from a turma unreleases it (per-
// turma) instead of deleting the global library item. These pin the relocation, the
// single-composer reuse, and the fix so a refactor can't silently re-bridge them to
// Content, fork the composer, or restore the global delete.
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

test('the Aulas tab is the aula hub; Liberações + Tarefas are per-aula, not turma-level sub-tabs', () => {
  // The turma-level Liberações/Tarefas sub-tabs were retired into the per-aula hub.
  assert.ok(!/data-dtab="liberacoes"/.test(cohortsJs), 'no turma-level liberacoes sub-tab');
  assert.ok(!/data-dtab="tarefas"/.test(cohortsJs), 'no turma-level tarefas sub-tab');
  // The Aulas hub renders a list | detail split with per-aula sub-tabs.
  assert.match(cohortsJs, /cdx-aulas-hub/, 'aula hub container');
  assert.match(cohortsJs, /data-aulatab="liberacoes"/, 'per-aula Liberações sub-tab');
  assert.match(cohortsJs, /data-aulatab="tarefas"/, 'per-aula Tarefas sub-tab');
});

test('cohorts reuses the existing modules, mounted aula-locked (no duplicated composer)', () => {
  assert.match(cohortsJs, /import \* as releasesAdmin from '\.\.\/content\/releases\.js'/, 'imports releases module');
  assert.match(cohortsJs, /import \* as tarefasAdmin from '\.\.\/content\/tarefas\.js'/, 'imports tarefas module');
  // The detail pane mounts the SAME modules in aula-locked mode (aula / aulaNumber). The
  // Liberações composer now mounts into a sub-slot so the Aplicativos section can stack below.
  assert.match(cohortsJs, /releasesAdmin\.mount\([^,]+,\s*\{[^}]*aula: aula\.id/, 'mounts releases aula-locked');
  assert.match(cohortsJs, /tarefasAdmin\.mount\(paneEl, \{[^}]*aulaNumber: aula\.aula_number/, 'mounts tarefas aula-locked');
  // And reuses the composer's OWN per-aula tally instead of re-deriving counts.
  assert.match(cohortsJs, /releasesAdmin\.aulaReleaseCounts\(/, 'reuses the exported counts helper');
});

test('the per-aula Liberações pane also mounts the Aplicativos release section (app = content per aula)', () => {
  assert.match(cohortsJs, /import \* as appRelease from '\.\/app-release\.js'/, 'imports the app-release module');
  assert.match(cohortsJs, /appRelease\.mount\(/, 'mounts the app-release section');
  // Bound to THIS aula (turma-wide entitlement, aula placement), mirroring content release.
  assert.match(cohortsJs, /turmaId: turma\.id, aulaNumber: aula\.aula_number/, 'app-release bound to this aula');
  assert.match(cohortsJs, /appRelease\.unmount\(\)/, 'unmounts the app-release embed');
});

test('the per-aula embeds are torn down on switch (singleton modules, no esc-handler leak)', () => {
  assert.match(cohortsJs, /_aulaEmbedMounted/, 'tracks which embed is live');
  assert.match(cohortsJs, /function _unmountAulaEmbeds\(\)/, 'has an embed teardown');
  assert.match(cohortsJs, /releasesAdmin\.unmount\(\)/, 'unmounts the releases embed');
  assert.match(cohortsJs, /tarefasAdmin\.unmount\(\)/, 'unmounts the tarefas embed');
});

test('Content > Tarefas is the bank-only page; Liberações + turma-scoped tarefas stay in the dossiê', () => {
  // Tarefas is back as a Content sub-tab, but BANK ONLY (no turma, no release-to-aula, no answers).
  assert.match(contentJs, /key:\s*'tarefas'[\s\S]*?mountCtx:\s*\{\s*bankOnly:\s*true/, 'Tarefas sub-tab mounts bankOnly');
  assert.match(contentJs, /import \* as tarefas from/, 'Content imports tarefas');
  // Liberações is NOT a Content sub-tab; it stays turma-scoped in the cohort dossiê.
  assert.ok(!/key:\s*'releases'/.test(contentJs), 'Liberações not in Content SUBTABS');
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

test('per-turma remove unreleases (never a global delete); delete-from-bank is separate + guarded', () => {
  // Removing a tarefa from the turma must be a per-turma unrelease, scoped to client+turma.
  assert.match(tarefasJs, /relApi\.unrelease\(\{ item_id: [a-z.]+, client_slug: _client, turma_slug: _turma \}\)/, 'removes via per-turma unrelease');
  // The ONLY global ct_delete_item call is the deliberate delete-from-bank, now double-guarded:
  // a release pre-check (listItemTurmas) blocks deletion while the tarefa is released to any turma,
  // and the deliberate delete still sits behind the retype-the-title confirmation (_openTitleConfirm).
  assert.match(tarefasJs, /_deleteFromBank[\s\S]{0,400}listItemTurmas/, 'delete-from-bank pre-checks releases');
  assert.match(tarefasJs, /_deleteFromBank[\s\S]{0,700}_openTitleConfirm/, 'delete-from-bank is title-confirmed');
  assert.ok(!/_removeFromTurma[\s\S]{0,300}api\.deleteItem\(/.test(tarefasJs), 'per-turma remove never calls global deleteItem');
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
