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

test('the dossier remembers its active sub-tab across re-renders (deep-link survives the async deps reload)', () => {
  // Regression: the shell used to hardcode `active` on Dados, so the async deps
  // re-render reset the tab — a deep-link (e-sino → Participantes) flashed then fell
  // back to Dados. The active tab is now state (_dossierDtab), rendered as active.
  assert.match(cohortsJs, /let _dossierDtab/, 'the active sub-tab is module state');
  assert.ok(!/class="cdx-subtab active" data-dtab="dados"/.test(cohortsJs), 'no hardcoded active tab in the shell');
  assert.match(cohortsJs, /_tabCls\(/, 'the shell derives the active class from state');
  assert.match(cohortsJs, /_dossierDtab = key/, 'a manual tab click updates the remembered tab');
  assert.match(cohortsJs, /_dossierDtab = \(ctx && ctx\.fdtab\)/, 'a deep-link (fdtab) seeds the active sub-tab');
  // index.html must forward an explicit fdtab so the bell can target Participantes.
  assert.match(read('../index.html'), /ctx\.fdtab = params\.get\('fdtab'\)/, 'index.html honours an explicit fdtab');
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

test('the aula-hub badge row renders a chip for released labs, not just apostila/tarefa/outros/drive', () => {
  // aulaReleaseCounts() now returns a `lab` bucket (releases.js) separate from
  // `outros`; _aulaCountChipsHtml destructures counts by fixed key, so a lab
  // chip must be read explicitly or labs silently drop out of these badges.
  const chipsFn = cohortsJs.slice(cohortsJs.indexOf('function _aulaCountChipsHtml'), cohortsJs.indexOf('function _isAulaSelected'));
  assert.match(chipsFn, /if \(c\.lab\) html \+= _countChip\('flask', c\.lab\);/, 'renders a flask chip for c.lab');
  assert.match(chipsFn, /if \(c\.interativo\) html \+= _countChip\('compass', c\.interativo\);/, 'renders a compass chip for c.interativo');
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

// Tarefas is ALWAYS turma-bound (track-41, 2026-07-16), so there is no more "picker-less mount"
// as one of TWO modes: the other mode never existed. The picker's `else` branch mounted the
// turmaPicker into `_q('cdx-tar-picker')`, and that id was never emitted by any shell
// (`_renderShell` only emitted the t1b pane), meaning it mounted onto `null`. Unreachable in
// practice: content.js mounts `{bankOnly:true}` and cohorts.js always passes clientSlug+turmaSlug
// +aulaNumber. Removed along with the rest of the standalone. `releases.js` (above) still has the
// TWO real modes, which is why its test still exercises the conditional.
test('tarefas mounts turma-bound, always (no picker branch)', () => {
  assert.match(tarefasJs, /export function mount\(viewEl, ctx = \{\}\)/, 'mount accepts a ctx');
  assert.match(tarefasJs, /_loadTarefas\(ctx\.clientSlug, ctx\.turmaSlug\)/, 'loads the bound turma directly');
  assert.ok(!/cdx-tar-picker/.test(tarefasJs), 'no picker: the element was never emitted by any shell');
  assert.ok(!/turma-picker\.js/.test(tarefasJs), 'no turmaPicker import (releases.js is its real consumer)');
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

test('labs3: the dossier shows the 4-digit access code (click-to-copy) and the trail card uses the SHORT /trilha/<code> URL', () => {
  // The trail card + refresh now prefer the canonical short URL (code IS the URL,
  // Élder 2026-07-04), falling back to the legacy ?k= token form only when code-less.
  assert.match(cohortsJs, /function _codeUrl\(code\)\s*\{\s*return _baseUrl\(\) \+ '\/trilha\/' \+ code;/, 'has the short-URL builder');
  assert.match(cohortsJs, /function _trailUrl\(turma\)\s*\{[\s\S]*?if \(turma\.access_code\) return _codeUrl\(turma\.access_code\);/, 'prefers the access_code short URL');
  assert.match(cohortsJs, /const url = _trailUrl\(turma\);/, 'the dossier trail card builds its URL via _trailUrl');
  assert.match(cohortsJs, /_refreshDossierTrail[\s\S]{0,220}const url = _trailUrl\(turma\);/, 'the token-rotation refresh also uses _trailUrl');
  // The bare code is shown as a click-to-copy chip.
  assert.match(cohortsJs, /const code = turma\.access_code \|\| null;/, 'reads the access_code');
  // The code is a BUTTON in the trail card's action row (next to QR), NOT a separate box.
  assert.match(cohortsJs, /class="cdx-btn cdx-btn-sm cdx-doss-code-btn" data-doss="copycode" data-code="/, 'code is a trail-row button');
  // track-36: the Janela button (validation-window open/close) sits between the QR and the code,
  // separate from the QR modal (Élder). Order in the trail-acts row: QR → Janela → code.
  assert.match(cohortsJs, /data-doss="qrshare"[\s\S]{0,600}data-doss="janela"[\s\S]{0,400}codeBtn/, 'the code button sits with the trail actions, after QR + Janela');
  assert.match(cohortsJs, /data-doss="janela"[\s\S]{0,200}cohorts\.window/, 'the Janela button carries the window label');
  assert.ok(!/cdx-doss-fact--code/.test(cohortsJs), 'no separate access-code fact box');
  assert.match(cohortsJs, /else if \(a === 'copycode'\) _copyCode\(b\.dataset\.code\);/, 'wires the copy-code action');
  assert.match(cohortsJs, /function _copyCode\(code\)[\s\S]{0,200}clipboard\.writeText\(code\)/, 'copies the bare digits, not the URL');
  for (const k of ['cohorts.field_access_code', 'cohorts.copy_code_title', 'cohorts.code_copied']) {
    const re = new RegExp("'" + k.replace(/\./g, '\\.') + "'");
    assert.match(ptJs, re, `${k} in pt`);
    assert.match(enJs, re, `${k} in en`);
  }
});

test('labs3 round 3: the roster connection mark is ✓ accessed / ✕ not accessed with recency, not the ambiguous ● / ⚠', () => {
  // Élder 2026-07-09: the old ● read like the legend's • "não logou"; the ⚠ (e-mail não
  // confirmado) was a different axis that misfired as an alarm. Now one axis, two explicit
  // marks, plus how long ago the last access was.
  // The row moved to cohorts/person-list.js (track-28a2: ONE list component for the dossiê AND the
  // Alunos roster), so the marks are asserted at their new home. The DECISION is unchanged.
  const plJs = read('../cohorts/person-list.js');
  assert.match(plJs, /import \{ relTime \} from '\.\.\/js\/rel-time\.js'/, 'imports the relative-time helper');
  const detail = plJs.slice(plJs.indexOf('function accessDetail'), plJs.indexOf('export function accessCell'));
  assert.match(detail, /'✓ ' \+ relTime\(row\.last_access_at\)/, 'accessed renders a ✓ with the recency');
  assert.match(detail, /'✕ ' \+ t\('cohorts\.pop_never'\)/, 'not-accessed renders a ✕');
  assert.ok(!/cdx-prow-online/.test(plJs), 'the old ● online dot is gone from the row');
  assert.ok(!/cdx-prow-warn/.test(plJs), 'the ⚠ e-mail-unverified mark is out of the row');
  // Legend matches the row exactly: ✓ + ✕, no phantom • / ⚠. The legend moved OUT of cohorts.js to
  // cohorts/person-legend.js (Élder 2026-07-15: "put the legend back on both people and participant
  // lists") — it was private here, which is why the roster never had one. The DECISION is unchanged,
  // so the assertions just follow it to its new home.
  const legend = read('../cohorts/person-legend.js');
  assert.match(legend, /cdx-prow-conn ok">✓/, 'legend connected = ✓');
  assert.match(legend, /cdx-prow-conn no">✕/, 'legend not-accessed = ✕');
  assert.ok(!/cdx-prow-conn">•/.test(legend), 'no phantom • waiting row');
  assert.ok(!/cdx-prow-warn">⚠/.test(legend), 'no ⚠ unverified row in the legend');
  assert.ok(!/_openParticipantsHelp/.test(cohortsJs), 'the private copy in cohorts.js is gone, not orphaned');
  for (const k of ['cohorts.conn_accessed', 'cohorts.conn_never', 'cohorts.phelp_never']) {
    const re = new RegExp("'" + k.replace(/\./g, '\\.') + "'");
    assert.match(ptJs, re, `${k} in pt`);
    assert.match(enJs, re, `${k} in en`);
  }
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

// ── the dossier deps must not re-ask once tried (2026-07-15) ─────────────────
// _ensureDossierDeps calls its callback SYNCHRONOUSLY once _dossierDepsTried is set, and that
// callback re-enters _renderDossier. So the call site must gate on _dossierDepsTried too, or an
// EMPTY answer (a client with no courses yet) recursed until RangeError while every level
// re-fired the aulas/participants/certs/forum loaders. Élder hit it on the Aulas sub-tab; it was
// also why that tab took a minute. Empty is a legitimate answer, not a reason to ask forever.
test('the dossier does not re-ask for deps once tried (no render recursion)', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(
    src,
    /if \(!_dossierDepsTried && \(\(!_turmaCourses/,
    'the _ensureDossierDeps call site must gate on !_dossierDepsTried'
  );
});
