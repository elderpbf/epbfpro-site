'use strict';

// Acceptance tests for cv-drive-folders-ui.js (CVDriveFoldersUI window global).
// Bundle O. Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-drive-folders-ui.test.js

const assert = require('node:assert/strict');
const path = require('node:path');
const dom = require('./__test-dom.cjs');

const MODULE_PATH = path.join(__dirname, 'cv-drive-folders-ui.js');

function loadModule() {
  return dom.loadInVM(MODULE_PATH);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVDriveFoldersUI is exposed with mountFoldersList + mountFolderEditor', () => {
  const { ctx } = loadModule();
  assert.ok(ctx.CVDriveFoldersUI, 'window.CVDriveFoldersUI must be defined');
  assert.equal(typeof ctx.CVDriveFoldersUI.mountFoldersList,  'function');
  assert.equal(typeof ctx.CVDriveFoldersUI.mountFolderEditor, 'function');
});

// --- mountFoldersList ---

test('mountFoldersList renders empty-state when no folders', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  ctx.CVDriveFoldersUI.mountFoldersList(host, { folders: [] });
  const empty = host.querySelector('.cv-drive-folder-empty');
  assert.ok(empty, 'must render an empty-state element');
});

test('mountFoldersList renders one row per folder with name + folder_id visible', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  ctx.CVDriveFoldersUI.mountFoldersList(host, {
    folders: [
      { id: 1, name: 'Aulas', folder_id: 'ID_AULAS' },
      { id: 2, name: 'Apostilas', folder_id: 'ID_APOST' },
    ],
  });
  const rows = host.querySelectorAll('.cv-drive-folder-row');
  assert.equal(rows.length, 2, 'must render 2 folder rows');
  const html = host.innerHTML;
  assert.ok(html.indexOf('Aulas') !== -1, 'folder name "Aulas" must be visible');
  assert.ok(html.indexOf('ID_AULAS') !== -1, 'folder_id "ID_AULAS" must be visible');
  assert.ok(html.indexOf('Apostilas') !== -1, 'folder name "Apostilas" must be visible');
});

test('mountFoldersList click Editar fires onEdit with the folder', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const editCalls = [];
  ctx.CVDriveFoldersUI.mountFoldersList(host, {
    folders: [{ id: 9, name: 'X', folder_id: 'Y' }],
    onEdit: function (f) { editCalls.push(f); },
  });
  const editBtn = host.querySelector('[data-action="edit"]');
  assert.ok(editBtn, 'edit button must be present');
  dom.click(editBtn);
  assert.equal(editCalls.length, 1, 'onEdit must be called once');
  assert.equal(editCalls[0].id, 9, 'onEdit must receive the folder');
});

test('mountFoldersList click Excluir fires onDelete with the folder', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const delCalls = [];
  ctx.CVDriveFoldersUI.mountFoldersList(host, {
    folders: [{ id: 9, name: 'X', folder_id: 'Y' }],
    onDelete: function (f) { delCalls.push(f); },
  });
  const delBtn = host.querySelector('[data-action="delete"]');
  assert.ok(delBtn, 'delete button must be present');
  dom.click(delBtn);
  assert.equal(delCalls.length, 1);
  assert.equal(delCalls[0].id, 9);
});

test('mountFoldersList returns instance with setFolders + destroy', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const inst = ctx.CVDriveFoldersUI.mountFoldersList(host, { folders: [] });
  assert.equal(typeof inst.setFolders, 'function');
  assert.equal(typeof inst.destroy,    'function');
  inst.setFolders([{ id: 1, name: 'Z', folder_id: 'q' }]);
  assert.equal(host.querySelectorAll('.cv-drive-folder-row').length, 1);
  inst.destroy();
  assert.equal(host.innerHTML, '');
});

// --- mountFolderEditor ---

test('mountFolderEditor renders inputs prepopulated when folder passed', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {
    folder: { id: 3, name: 'Banco', folder_id: 'B' },
  });
  const nameEl   = host.querySelector('.cv-drive-folder-editor-name');
  const folderEl = host.querySelector('.cv-drive-folder-editor-folder-id');
  assert.ok(nameEl, 'name input must exist');
  assert.ok(folderEl, 'folder_id input must exist');
  assert.equal(nameEl.value, 'Banco');
  assert.equal(folderEl.value, 'B');
});

test('mountFolderEditor renders empty inputs when no folder passed (create mode)', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {});
  const nameEl   = host.querySelector('.cv-drive-folder-editor-name');
  const folderEl = host.querySelector('.cv-drive-folder-editor-folder-id');
  assert.equal(nameEl.value, '');
  assert.equal(folderEl.value, '');
});

test('mountFolderEditor submit fires onSave with id (when edit) + name + folder_id', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const saves = [];
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {
    folder: { id: 3, name: 'Banco', folder_id: 'B' },
    onSave: function (p) { saves.push(p); },
  });
  const nameEl   = host.querySelector('.cv-drive-folder-editor-name');
  const folderEl = host.querySelector('.cv-drive-folder-editor-folder-id');
  nameEl.value = 'Banco renomeado';
  folderEl.value = 'B2';
  const form = host.querySelector('form');
  dom.submit(form);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 3);
  assert.equal(saves[0].name, 'Banco renomeado');
  assert.equal(saves[0].folder_id, 'B2');
});

test('mountFolderEditor submit with empty name shows error and does NOT fire onSave', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const saves = [];
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {
    onSave: function (p) { saves.push(p); },
  });
  const folderEl = host.querySelector('.cv-drive-folder-editor-folder-id');
  folderEl.value = 'X';
  const form = host.querySelector('form');
  dom.submit(form);
  assert.equal(saves.length, 0, 'onSave must not be called with empty name');
  const err = host.querySelector('.cv-drive-folder-editor-error, [data-cv-folder-error]');
  assert.ok(err && err.textContent && err.textContent.trim().length > 0, 'error message must be visible');
});

test('mountFolderEditor submit with empty folder_id shows error and does NOT fire onSave', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const saves = [];
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {
    onSave: function (p) { saves.push(p); },
  });
  const nameEl = host.querySelector('.cv-drive-folder-editor-name');
  nameEl.value = 'Some name';
  const form = host.querySelector('form');
  dom.submit(form);
  assert.equal(saves.length, 0);
});

test('mountFolderEditor cancel button fires onCancel', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const cancels = [];
  ctx.CVDriveFoldersUI.mountFolderEditor(host, {
    onCancel: function () { cancels.push(true); },
  });
  const cancelBtn = host.querySelector('.cv-drive-folder-editor-cancel');
  assert.ok(cancelBtn);
  dom.click(cancelBtn);
  assert.equal(cancels.length, 1);
});

test('mountFolderEditor destroy clears host', () => {
  const { ctx, doc } = loadModule();
  const host = doc.createElement('div');
  const inst = ctx.CVDriveFoldersUI.mountFolderEditor(host, {});
  assert.ok(host.innerHTML.length > 0, 'editor renders');
  inst.destroy();
  assert.equal(host.innerHTML, '');
});

// runner
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.name);
      passed++;
    } catch (e) {
      console.error('FAIL ' + t.name + '\n  ' + (e && e.message ? e.message : String(e)));
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
