// Bundle G REDESIGN acceptance tests.
//
// The original Bundle G shipped a per-turma settings drawer triggered by a
// gear icon in column 3, plus column 3 wired to Liberações. Elder rejected
// the drawer (the existing Editar modal already covers per-turma config) and
// asked for column 3 to swap from Liberações to Aulas, with Liberações
// moving to a Conteúdo sub-tab.
//
// These tests assert the redesigned contract. They are structural (regex
// over source files) for the same reason as the original Bundle G tests,
// the admin code is imperative and loads at runtime.
//
//   1. The gear button and its drawer code/CSS are gone.
//   2. Column 3 in panel-clients shows Aulas, not Liberações.
//   3. A standalone panel-liberacoes exists for the Conteúdo sub-tab.
//   4. backstage-topbar.js exposes liberacoes as a Conteúdo sub-tab.
//   5. ?tab=liberacoes routes to panel-liberacoes (not panel-clients).
//   6. The turma card is slimmed, no aulas chip, no slug meta line in the
//      body, no inline action button row beyond Editar + kebab.
//
// Run: node Site/backstage/classtrail/tests/bundle-g-redesign-turmas.test.js

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const CT_ROOT    = join(__dirname, '..');
const BS_JS_ROOT = join(CT_ROOT, '..', 'js');

function read(rel, baseRoot) {
  return readFileSync(join(baseRoot || CT_ROOT, rel), 'utf8');
}

let passed = 0;
let failed = 0;
function pass(name) { passed++; console.log('PASS  ' + name); }
function fail(name, err) { failed++; console.log('FAIL  ' + name + ' , ' + err.message); }
function run(name, fn) { try { fn(); pass(name); } catch (err) { fail(name, err); } }

const indexHtml = read('index.html');
const adminJs   = read('js/ct-admin.js');
const css       = read('css/classtrail.css');
const topbarJs  = read('backstage-topbar.js', BS_JS_ROOT);

// , Test 1: gear button is gone from index.html , , , , , , , , , , , , , ,
run('gear button btn-turma-settings is removed from index.html', () => {
  assert.ok(!/id="btn-turma-settings"/.test(indexHtml),
    'btn-turma-settings must no longer exist in index.html');
  assert.ok(!/ct-turma-settings-btn/.test(indexHtml),
    'ct-turma-settings-btn class must no longer be referenced in index.html');
});

// , Test 2: drawer functions are gone from ct-admin.js , , , , , , , , , , ,
run('drawer functions are gone from ct-admin.js', () => {
  assert.ok(!/_renderTurmaSettingsDrawer/.test(adminJs),
    '_renderTurmaSettingsDrawer must be removed');
  assert.ok(!/_closeTurmaSettingsDrawer/.test(adminJs),
    '_closeTurmaSettingsDrawer must be removed');
  // openTurmaSettingsDrawer is exported via CT_ADMIN; both definition and
  // export should be gone.
  assert.ok(!/openTurmaSettingsDrawer/.test(adminJs),
    'openTurmaSettingsDrawer must be removed (definition and export)');
  assert.ok(!/_openTurmaFromDrawer/.test(adminJs),
    '_openTurmaFromDrawer must be removed');
});

// , Test 3: drawer CSS is gone , , , , , , , , , , , , , , , , , , , , , ,
run('drawer CSS classes are gone from classtrail.css', () => {
  assert.ok(!/\.ct-turma-drawer\b/.test(css),
    '.ct-turma-drawer must be removed from CSS');
  assert.ok(!/\.ct-turma-drawer-overlay\b/.test(css),
    '.ct-turma-drawer-overlay must be removed from CSS');
  assert.ok(!/\.ct-turma-settings-btn\b/.test(css),
    '.ct-turma-settings-btn (gear) must be removed from CSS');
});

// , Test 4: column 3 in panel-clients shows Aulas, not Liberações , , , , , ,
run('panel-clients column 3 is Aulas, not Liberações', () => {
  const scoped = indexHtml.split(/<div class="ct-panel" id="panel-items">/)[0];
  // Title id must be aulas-pane-title (not releases-pane-title).
  assert.ok(/id="aulas-pane-title"/.test(scoped),
    'panel-clients must include aulas-pane-title in the third column');
  assert.ok(!/id="releases-pane-title"/.test(scoped),
    'panel-clients must no longer use releases-pane-title');
  // Body container must be aulas-list, not releases-list.
  assert.ok(/id="aulas-list"/.test(scoped),
    'panel-clients must include aulas-list container in column 3');
  assert.ok(!/id="releases-list"/.test(scoped),
    'panel-clients must no longer use releases-list (moved to panel-liberacoes)');
  // Pane title default text is Aulas.
  assert.ok(/<span class="ct-pane-title" id="aulas-pane-title">Aulas<\/span>/.test(scoped),
    'aulas-pane-title default text must be "Aulas"');
});

// , Test 5: ct-admin renders aulas for the selected turma into aulas-list , ,
run('ct-admin.js wires turma selection to load aulas into #aulas-list', () => {
  assert.ok(/getElementById\(['"]aulas-list['"]\)/.test(adminJs),
    'ct-admin.js must reference #aulas-list to render column 3');
  // The selection handler still exists, but its job is to load aulas now.
  assert.ok(/_selectTurmaForAulas|_loadTurmaAulas/.test(adminJs),
    'ct-admin.js must expose a turma selection handler tied to aulas');
});

// , Test 6: panel-liberacoes exists (with picker + list scaffolding) , , , ,
run('panel-liberacoes exists with picker + list scaffolding', () => {
  assert.ok(/id="panel-liberacoes"/.test(indexHtml),
    'panel-liberacoes must exist as a Conteúdo sub-tab panel');
  assert.ok(/id="rel-turma-picker"/.test(indexHtml),
    'panel-liberacoes must include rel-turma-picker for choosing a turma');
  // The releases-list container moves into panel-liberacoes.
  assert.ok(/id="releases-list"/.test(indexHtml),
    'releases-list must still exist (inside panel-liberacoes)');
});

// , Test 7: backstage-topbar exposes liberacoes as a Conteúdo sub-tab , , ,
run('backstage-topbar.js Conteúdo sub-tabs include liberacoes', () => {
  // The CODEX_SUBTABS.conteudo array must contain an entry with key=liberacoes.
  assert.ok(/conteudo:\s*\[[\s\S]*?key:\s*['"]liberacoes['"][\s\S]*?\]/.test(topbarJs),
    'CODEX_SUBTABS.conteudo must contain an entry with key="liberacoes"');
  // And the entry's href must point at ?tab=liberacoes.
  assert.ok(/key:\s*['"]liberacoes['"][^}]*href:\s*['"][^'"]*\?tab=liberacoes['"]/.test(topbarJs),
    'liberacoes sub-tab href must point at ?tab=liberacoes');
});

// , Test 8: URL routing , , , , , , , , , , , , , , , , , , , , , , , , , ,
run('?tab=liberacoes routes to panel-liberacoes (not panel-clients)', () => {
  const mapMatch = adminJs.match(/var URL_TO_INTERNAL = \{([\s\S]*?)\};/);
  assert.ok(mapMatch, 'URL_TO_INTERNAL map must exist');
  const map = mapMatch[1];
  assert.ok(/liberacoes:\s*['"]liberacoes['"]/.test(map),
    'liberacoes must map to liberacoes panel (Conteúdo sub-tab)');
  // The legacy "releases" alias keeps the same destination as "liberacoes".
  assert.ok(/releases:\s*['"]liberacoes['"]/.test(map),
    'releases must map to liberacoes panel as well');
});

run('index.html boot routing keeps liberacoes under conteudo codex tab', () => {
  // The IIFE that builds the Topbar config must treat liberacoes as a
  // Conteúdo sub-tab, NOT a Turmas one (the old behaviour).
  // Look for the urlTab check.
  assert.ok(!/urlTab === ['"]liberacoes['"][^{]*codexKey\s*=\s*['"]turmas['"]/.test(indexHtml),
    'liberacoes must no longer force codexKey to turmas in the boot block');
  // The subKey list must allow liberacoes.
  assert.ok(/urlTab === ['"]liberacoes['"]/.test(indexHtml),
    'boot block must still recognise urlTab === "liberacoes" (now as a Conteúdo sub)');
});

// , Test 9: turma card slimmed shape , , , , , , , , , , , , , , , , , , ,
run('_renderTurmas builds a slimmed card (no chips, no slug meta line, no aulas chip)', () => {
  // The aulas chip and the chip wrapper must be gone.
  assert.ok(!/ct-turma-chips/.test(adminJs),
    'ct-turma-chips wrapper must be removed from _renderTurmas');
  assert.ok(!/ct-turma-chip(?!s)/.test(adminJs),
    'individual ct-turma-chip buttons must be removed from _renderTurmas');
  // The CSS class drops too.
  assert.ok(!/\.ct-turma-chip\b/.test(css),
    '.ct-turma-chip CSS must be removed');
  // Slug meta line must not be rendered inside the card body (it can be in title="…" only).
  // Look for the old pattern: '<div class="ct-card-meta">' + _esc(t.client_slug) + ' / ' + _esc(t.slug)
  assert.ok(!/ct-card-meta['"]\s*\+\s*_esc\(t\.client_slug\)/.test(adminJs),
    'ct-card-meta line with slug must no longer be rendered in the turma card body');
  // The new card surfaces a status-icons row.
  assert.ok(/ct-turma-status-icons/.test(adminJs),
    '_renderTurmas must render a ct-turma-status-icons row (WhatsApp + ClassPulse)');
  // And a kebab menu trigger.
  assert.ok(/ct-turma-kebab/.test(adminJs),
    '_renderTurmas must render a ct-turma-kebab trigger for rare actions');
});

run('classtrail.css defines status icons + kebab menu styles', () => {
  assert.ok(/\.ct-turma-status-icons\b/.test(css),
    'classtrail.css must define .ct-turma-status-icons');
  assert.ok(/\.ct-turma-status-icon\b/.test(css),
    'classtrail.css must define .ct-turma-status-icon');
  assert.ok(/\.ct-turma-kebab\b/.test(css),
    'classtrail.css must define .ct-turma-kebab');
  assert.ok(/\.ct-turma-kebab-menu\b/.test(css),
    'classtrail.css must define .ct-turma-kebab-menu');
});

run('selected turma card uses a stronger accent indicator', () => {
  // Existing .ct-card.selected stays, but the redesign asks for a stronger
  // visual indicator (accent border + arrow on the right edge).
  assert.ok(/\.ct-card\.selected/.test(css),
    'classtrail.css must define .ct-card.selected (kept from before)');
  // The new visual indicator: an arrow / chevron pseudo-element or class.
  assert.ok(/ct-turma-selected-arrow|ct-card\.selected::after|ct-card\.selected::before/.test(css),
    'selected turma card must render an arrow / chevron indicator (CSS pseudo-element or dedicated class)');
});

// Helper: extract the _renderTurmas function body by brace balance. CRLF-safe.
function extractRenderTurmasBody(src) {
  const start = src.indexOf('function _renderTurmas()');
  if (start === -1) return '';
  // Find first opening brace.
  const open = src.indexOf('{', start);
  if (open === -1) return '';
  let depth = 1;
  let i = open + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(start, i);
}

// , Test 10: kebab actions cover regenerar token + arquivar + copiar URL , ,
run('kebab menu surfaces regenerar token, arquivar, copiar URL', () => {
  const body = extractRenderTurmasBody(adminJs);
  assert.ok(body.length > 0, '_renderTurmas body must be parseable');
  assert.ok(/regenerateToken/.test(body),
    'kebab area must include a regenerateToken handler');
  assert.ok(/archiveTurma/.test(body),
    'kebab area must include an archiveTurma handler');
  assert.ok(/copyTurmaUrl/.test(body),
    'kebab area must include a copyTurmaUrl handler');
});

// , Test 11: Editar modal entry point still works (sanity) , , , , , , , , ,
run('turma Editar primary action still calls CT_ADMIN.editTurma', () => {
  const body = extractRenderTurmasBody(adminJs);
  assert.ok(/CT_ADMIN\.editTurma\(/.test(body),
    'slimmed turma card must keep an Editar button that calls CT_ADMIN.editTurma');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
