// Drive sub-tab: NATIVE cdx- module (was a CVDriveSyncUI global wrapper). Tab
// contract + module source rules + facade wiring + the shared-global boundary.
// The file-preview modal (CVDriveViewer) and the Google Drive read (BS_GOOGLE)
// stay shared globals; every Worker call goes through the codex-api `drive`
// facade. Importing must not touch DOM/globals at the top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const drive = await import('../content/drive.js');

test('drive module satisfies the tab contract', () => {
  assert.equal(typeof drive.mount, 'function', 'exports mount');
  assert.equal(typeof drive.unmount, 'function', 'exports unmount');
});

test('drive is a native cdx- module, not a CVDriveSyncUI wrapper', () => {
  const src = read('../content/drive.js');
  assert.ok(!/window\.CVDriveSyncUI/.test(src), 'no longer mounts the legacy CVDriveSyncUI panel');
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker (facade only)');
  assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'imports the facade');
  assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, 'imports t()');
  assert.match(src, /cdx-items-split/, 'reuses the Items master-detail split shell');
  assert.match(src, /cdx-item-row/, 'renders folders as cdx- rows');
  assert.match(src, /cdx-item-preview/, 'has a preview pane');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.ok(!/class="cv-/.test(src) && !/class="ct-/.test(src), 'authors no cv-/ct- markup');
});

test('drive reaches the backend through the facade drive group', () => {
  const src = read('../content/drive.js');
  for (const m of ['listFolders', 'addFolder', 'updateFolder', 'deleteFolder', 'listItems', 'syncItems']) {
    assert.match(src, new RegExp('api\\.' + m + '\\s*\\('), `uses drive facade .${m}()`);
  }
  // The actual Google Drive read + file modal stay shared globals.
  assert.match(src, /window\.BS_GOOGLE|_bs\(\)/, 'reads Google Drive via BS_GOOGLE');
  assert.match(src, /window\.CVDriveViewer/, 'delegates file preview to CVDriveViewer');
});

test('the codex-api facade exposes the drive group mapped to the frozen cv_* actions', async () => {
  const api = await import('../js/codex-api.js');
  globalThis.callWorker = (payload) => payload;
  assert.ok(api.drive, 'exports a drive group');
  const cases = [
    [() => api.drive.listFolders(), 'cv_list_drive_folders'],
    [() => api.drive.addFolder({ name: 'n', folder_id: 'f' }), 'cv_add_drive_folder'],
    [() => api.drive.updateFolder({ id: 1 }), 'cv_update_drive_folder'],
    [() => api.drive.deleteFolder({ id: 1 }), 'cv_delete_drive_folder'],
    [() => api.drive.listItems(), 'cv_list_drive_items'],
    [() => api.drive.syncItems({ items: [] }), 'cv_sync_drive_items'],
  ];
  for (const [fn, action] of cases) assert.equal(fn().action, action, `maps to ${action}`);
});

test('drive strings route through t() in both dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'drive.title', 'drive.sync_now', 'drive.syncing', 'drive.connected', 'drive.not_connected',
    'drive.never_synced', 'drive.last_sync', 'drive.add_folder', 'drive.no_folders', 'drive.select_folder',
    'drive.file_one', 'drive.file_many', 'drive.edit', 'drive.delete', 'drive.no_files', 'drive.root_group',
    'drive.editor_name', 'drive.editor_folder_id', 'drive.editor_add', 'drive.editor_save', 'drive.editor_cancel',
    'drive.err_name', 'drive.err_folder_id', 'drive.delete_confirm', 'drive.err_save', 'drive.err_sync',
    'drive.err_unavailable', 'drive.unavailable',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
