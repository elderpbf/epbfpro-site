// Bundle G v2 consistency tests.
// Asserts: turma card mirrors client pattern, clickable WhatsApp + URL, inline
// aula editor in col 3, "Items" sub-tab rename, no em dashes, no leftover
// drawer / kebab / chevron artifacts.
//
// Run: node backstage/classtrail/tests/bundle-g-v2-consistency.test.js

const fs = require('fs');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ctAdmin = read('backstage/classtrail/js/ct-admin.js');
const ctCss = read('backstage/classtrail/css/classtrail.css');
const topbarJs = read('backstage/js/backstage-topbar.js');
const ctHtml = read('backstage/classtrail/index.html');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let pass = 0, fail = 0;

test('topbar Conteúdo first sub-tab labeled "Items" (not "Conteúdo")', () => {
  // The label is the new one; the key stays as 'conteudo' for URL backward compat.
  const conteudoBlock = topbarJs.match(/conteudo:\s*\[([\s\S]*?)\]/);
  assert.ok(conteudoBlock, 'CODEX_SUBTABS.conteudo block found');
  const firstEntry = conteudoBlock[1].split('\n')[1] || conteudoBlock[1];
  assert.match(firstEntry, /label:\s*'Items'/, 'first sub-tab label is Items');
});

test('turma card uses .ct-card (mirroring client) with no .ct-turma-card class', () => {
  // The new return string uses .ct-card directly, not .ct-card .ct-turma-card.
  const renderTurmas = ctAdmin.match(/function _renderTurmas\([\s\S]*?\n  \}/);
  assert.ok(renderTurmas, '_renderTurmas function found');
  assert.ok(!/ct-turma-card/.test(renderTurmas[0]), 'no ct-turma-card class in render');
  assert.ok(/return '<div class="ct-card'/.test(renderTurmas[0]), 'card uses .ct-card');
});

test('turma selection highlight reuses the client .ct-card.selected hook', () => {
  // No special .ct-turma-card.selected override in the CSS.
  assert.ok(!/\.ct-turma-card\.selected/.test(ctCss), 'no .ct-turma-card.selected override');
  assert.ok(/\.ct-card\.selected\s*{/.test(ctCss), 'shared .ct-card.selected exists');
});

test('no chevron ::after on selected card (kill the chevron)', () => {
  assert.ok(!/\.ct-turma-card\.selected::after/.test(ctCss), 'no chevron ::after rule');
  // Pseudo-element rule pointing at "›" should not exist for the card.
  assert.ok(!/content:\s*"›"/.test(ctCss), 'no chevron content rule');
});

test('no kebab artifacts (button, menu, item) in JS or CSS', () => {
  assert.ok(!/ct-turma-kebab/.test(ctAdmin), 'no kebab class in JS');
  assert.ok(!/ct-turma-kebab/.test(ctCss), 'no kebab class in CSS');
});

test('WhatsApp icon is wrapped in an <a> when whatsapp_url is set', () => {
  // The wpOk branch builds an <a> tag pointing at t.whatsapp_url.
  assert.ok(/wpIcon\s*=\s*wpOk[\s\S]*?<a class="ct-card-mini-icon is-on" href="' \+ _esc\(t\.whatsapp_url\)/.test(ctAdmin),
    'wpIcon is <a> when wpOk');
});

test('URL row has clickable copy button and separate open <a>', () => {
  assert.ok(/ct-card-url-text/.test(ctAdmin), 'copy URL element class exists in render');
  assert.ok(/ct-card-url-open/.test(ctAdmin), 'open URL element class exists in render');
  assert.ok(/CT_ADMIN\.copyTurmaUrl/.test(ctAdmin), 'copyTurmaUrl call wired on URL text');
});

test('aulas count chip rendered in card info row', () => {
  assert.ok(/aulaCountLabel/.test(ctAdmin), 'aulaCountLabel variable defined');
  assert.ok(/ct-card-info-chip/.test(ctAdmin), 'info chip class in render');
});

test('column 3 aulas: + Nova aula button + click-to-expand inline editor', () => {
  assert.ok(/cv-add-aula-btn/.test(ctAdmin), '+ Nova aula button exists');
  assert.ok(/function _renderAulaColEditor/.test(ctAdmin), 'inline editor function exists');
  assert.ok(/function _expandAulaCol/.test(ctAdmin), 'expand handler exists');
  assert.ok(/function _collapseAulaCol/.test(ctAdmin), 'collapse handler exists');
  assert.ok(/sem data definida/.test(ctAdmin), '"sem data definida" label present');
});

test('aulas section removed from turma edit modal', () => {
  assert.ok(!/_renderAulasSection/.test(ctAdmin), 'no _renderAulasSection function');
  assert.ok(!/_loadAulasIntoForm/.test(ctAdmin), 'no _loadAulasIntoForm function');
  assert.ok(!/tf-aulas-section/.test(ctAdmin), 'no tf-aulas-section element');
});

test('client and turma modals close on outside click (no disableBackdropClose)', () => {
  // The two card-edit modals (_openClientForm, _openTurmaForm) must NOT pass
  // disableBackdropClose. Heavy item-editor modals (content-creator, item
  // editor full, drive/group dialogs) keep it intentionally so typed content
  // is not lost on accidental backdrop click.
  // Match the closing pattern of each function: the _openModal call that
  // belongs to _openClientForm / _openTurmaForm uses the cf-save / tf-save
  // buttons immediately after, so we scope by those markers.
  const clientFormBlock = ctAdmin.match(/cf-save[^;]*<\/button>'[\s\S]{0,200}_openModal\([^)]*\)/);
  assert.ok(clientFormBlock, 'client form _openModal call found');
  assert.ok(!/disableBackdropClose:\s*true/.test(clientFormBlock[0]),
    'client form does not disable backdrop close');
  const turmaFormBlock = ctAdmin.match(/tf-save[^;]*<\/button>'[\s\S]{0,200}_openModal\([^)]*\)/);
  assert.ok(turmaFormBlock, 'turma form _openModal call found');
  assert.ok(!/disableBackdropClose:\s*true/.test(turmaFormBlock[0]),
    'turma form does not disable backdrop close');
});

test('no em dashes in ct-admin.js user-facing strings', () => {
  assert.ok(!/—/.test(ctAdmin), 'no em dashes in ct-admin.js');
});

test('_loadClients auto-selects the first non-archived client', () => {
  assert.ok(/firstActive\s*=\s*_clients\.find/.test(ctAdmin), 'auto-select logic present');
  assert.ok(/_selectClient\(firstActive\.slug\)/.test(ctAdmin), 'auto-select calls _selectClient');
});

test('_loadTurmas auto-selects the first non-archived turma when no saved match', () => {
  assert.ok(/_selectTurmaForAulas\(firstActive\.client_slug, firstActive\.slug\)/.test(ctAdmin),
    'auto-select calls _selectTurmaForAulas');
});

test('cache busts bumped: classtrail.css 3.7, ct-admin.js 7.0, backstage-topbar.js 1.9', () => {
  assert.match(ctHtml, /classtrail\.css\?v=3\.7/, 'classtrail.css at 3.7');
  assert.match(ctHtml, /ct-admin\.js\?v=7\.0/, 'ct-admin.js at 7.0');
  assert.match(ctHtml, /backstage-topbar\.js\?v=1\.9/, 'backstage-topbar.js at 1.9');
});

// Run
for (const t of tests) {
  try {
    t.fn();
    console.log('PASS  ' + t.name);
    pass++;
  } catch (e) {
    console.log('FAIL  ' + t.name);
    console.log('      ' + e.message);
    fail++;
  }
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
