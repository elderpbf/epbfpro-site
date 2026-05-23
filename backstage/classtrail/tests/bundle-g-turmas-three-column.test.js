// Bundle G acceptance tests — Turmas three-column + Liberações fold.
//
// These tests assert the static structure required by Bundle G of the
// codex-merger. They are intentionally structural (regex over source files)
// rather than behavioural-with-jsdom, because the ClassTrail admin code is
// imperative and loads at runtime; the contract we care about is:
//
//   1. The Turmas panel (panel-clients) has THREE columns: Clientes,
//      Turmas, Liberações.
//   2. The old standalone Liberações panel (panel-releases) is gone.
//   3. A settings drawer trigger (gear button) exists in the third column.
//   4. ct-admin.js wires turma selection to release loading and renders
//      releases into the third column id (#releases-list).
//   5. Legacy ?tab=liberacoes / ?tab=releases URLs still land somewhere
//      sensible (the new three-column under Turmas).
//   6. classtrail.css defines a .ct-three-pane grid template.
//
// Run: node Site/backstage/classtrail/tests/bundle-g-turmas-three-column.test.js

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const CT_ROOT    = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(CT_ROOT, rel), 'utf8');
}

let passed = 0;
let failed = 0;
function pass(name) { passed++; console.log('PASS  ' + name); }
function fail(name, err) { failed++; console.log('FAIL  ' + name + ' — ' + err.message); }
function run(name, fn) { try { fn(); pass(name); } catch (err) { fail(name, err); } }

const indexHtml = read('index.html');
const adminJs   = read('js/ct-admin.js');
const css       = read('css/classtrail.css');

// ── Test 1: panel-clients contains a three-pane layout ─────────────────────
run('panel-clients uses .ct-three-pane (not .ct-two-pane)', () => {
  // Pull the panel-clients block. Look for the first opening div with
  // id="panel-clients" through its matching closing div before panel-items.
  const m = indexHtml.match(/<div class="ct-panel" id="panel-clients">([\s\S]*?)<\/main>/);
  assert.ok(m, 'panel-clients block must exist');
  const block = m[1];
  // Use the panel-items boundary (next ct-panel) to scope panel-clients only.
  const scoped = block.split(/<div class="ct-panel" id="panel-items">/)[0];
  assert.ok(/ct-three-pane/.test(scoped),
    'panel-clients must contain a .ct-three-pane container');
  assert.ok(!/ct-two-pane/.test(scoped),
    'panel-clients must no longer reference .ct-two-pane');
});

// ── Test 2: third column for Liberações exists with releases-list id ─────
run('panel-clients includes #releases-list in third column', () => {
  const scoped = indexHtml.split(/<div class="ct-panel" id="panel-items">/)[0];
  assert.ok(/id="releases-list"/.test(scoped),
    'panel-clients must include the releases-list container');
});

// ── Test 3: panel-releases standalone is removed ────────────────────────
run('standalone panel-releases is removed', () => {
  assert.ok(!/id="panel-releases"/.test(indexHtml),
    'panel-releases must no longer exist as a separate panel');
  assert.ok(!/id="rel-turma-picker"/.test(indexHtml),
    'rel-turma-picker (legacy in-panel turma picker) must be removed');
});

// ── Test 4: settings drawer trigger (gear) lives in the third column ───
run('gear button btn-turma-settings exists in third column', () => {
  const scoped = indexHtml.split(/<div class="ct-panel" id="panel-items">/)[0];
  assert.ok(/id="btn-turma-settings"/.test(scoped),
    'btn-turma-settings (gear icon to open per-turma drawer) must exist');
});

// ── Test 5: ct-admin.js wires turma selection to release loading ────
run('ct-admin.js selecting a turma triggers release loading in column 3', () => {
  // The new contract: selecting a turma in column 2 must populate column 3.
  // We accept either: (a) a function name _loadReleases called inside the
  // turma click wiring, or (b) a CT_ADMIN-exposed selectTurmaForReleases().
  assert.ok(/_loadReleases\s*\(/.test(adminJs),
    'ct-admin.js must still call _loadReleases');
  // Look for a wiring path: when a turma card is clicked in the new column 2,
  // _loadReleases must be invoked. We assert the keyword "selectTurmaInColumn"
  // OR an updated _renderTurmas with onclick semantics referencing releases.
  assert.ok(/selectTurmaInColumn|_selectTurmaForReleases|_onTurmaClick/.test(adminJs),
    'ct-admin.js must define a turma-selection handler that loads releases');
});

// ── Test 6: legacy URL aliases still route to clients (three-column) ───
run('?tab=liberacoes and ?tab=releases route to the Turmas panel', () => {
  // The URL_TO_INTERNAL map must redirect these legacy ?tab values to
  // the panel id used by the three-column layout (panel-clients).
  const mapMatch = adminJs.match(/var URL_TO_INTERNAL = \{([\s\S]*?)\};/);
  assert.ok(mapMatch, 'URL_TO_INTERNAL map must exist');
  const map = mapMatch[1];
  assert.ok(/liberacoes:\s*['"]clients['"]/.test(map),
    'liberacoes must map to clients (three-column under Turmas)');
  assert.ok(/releases:\s*['"]clients['"]/.test(map),
    'releases must map to clients (three-column under Turmas)');
});

// ── Test 7: classtrail.css defines .ct-three-pane with grid ───────────
run('classtrail.css defines .ct-three-pane grid', () => {
  assert.ok(/\.ct-three-pane\s*\{[^}]*display:\s*grid/.test(css.replace(/\n/g, ' ')),
    'classtrail.css must define .ct-three-pane with display:grid');
  // Three column tracks expected, with the third one taking the remaining space.
  assert.ok(/\.ct-three-pane\s*\{[^}]*grid-template-columns:[^;]*1fr/.test(css.replace(/\n/g, ' ')),
    'ct-three-pane grid-template-columns must end with 1fr (third pane fills)');
});

// ── Test 8: settings drawer CSS for ct-turma-drawer is defined ────────
run('classtrail.css defines .ct-turma-drawer styles', () => {
  assert.ok(/\.ct-turma-drawer\b/.test(css),
    'classtrail.css must define .ct-turma-drawer (drawer container)');
  assert.ok(/\.ct-turma-drawer-overlay\b/.test(css),
    'classtrail.css must define .ct-turma-drawer-overlay (backdrop)');
});

// ── Test 9: gear button opens drawer (handler exists in ct-admin.js) ─
run('ct-admin.js defines openTurmaSettingsDrawer handler', () => {
  assert.ok(/openTurmaSettingsDrawer|_openTurmaSettings|_openTurmaDrawer/.test(adminJs),
    'ct-admin.js must expose a handler that opens the per-turma settings drawer');
});

// ── Test 10: column-1 (Clients) heading remains; aulas/whatsapp/cp meta still surfaced ─
run('drawer surfaces aulas + WhatsApp + ClassPulse fields', () => {
  // The drawer reuses the existing turma edit modal (with aulas/whatsapp/classpulse).
  // We assert the modal still defines these three field ids.
  assert.ok(/id=['"]tf-whatsapp['"]/.test(adminJs.replace(/\\'/g, "'")),
    'turma form must still have tf-whatsapp field for WhatsApp URL');
  assert.ok(/id=['"]tf-classpulse['"]/.test(adminJs.replace(/\\'/g, "'")),
    'turma form must still have tf-classpulse field for ClassPulse session');
  assert.ok(/id=['"]tf-aulas-section['"]/.test(adminJs.replace(/\\'/g, "'")),
    'turma form must still have tf-aulas-section for the aulas list');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
