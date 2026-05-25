'use strict';

// Acceptance tests for cv-drive-folders-api.js (CVDriveFoldersAPI window global).
// Bundle O. Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-drive-folders-api.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'cv-drive-folders-api.js');

function loadModule(mockFn) {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const ctx = {
    window: {},
    console,
    callWorker: mockFn || (async () => ({})),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cv-drive-folders-api.js' });
  return ctx;
}

function makeWorker(response) {
  const calls = [];
  const fn = async (params) => { calls.push(params); return response; };
  fn.calls = calls;
  return fn;
}

function assertDeepEqualJSON(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert.equal(a, e, (msg || 'deepEqual') + '\n  actual:   ' + a + '\n  expected: ' + e);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVDriveFoldersAPI is exposed on window', () => {
  const ctx = loadModule(makeWorker({ ok: true, folders: [] }));
  assert.ok(ctx.CVDriveFoldersAPI, 'window.CVDriveFoldersAPI must be defined');
  assert.equal(typeof ctx.CVDriveFoldersAPI.list,   'function', 'list must be a function');
  assert.equal(typeof ctx.CVDriveFoldersAPI.create, 'function', 'create must be a function');
  assert.equal(typeof ctx.CVDriveFoldersAPI.update, 'function', 'update must be a function');
  assert.equal(typeof ctx.CVDriveFoldersAPI.remove, 'function', 'remove must be a function');
});

// --- list() ---

test('list() calls callWorker with action cv_list_drive_folders', async () => {
  const worker = makeWorker({ ok: true, folders: [{ id: 1, name: 'A', folder_id: 'X' }] });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.list();
  assert.equal(worker.calls.length, 1, 'callWorker must be called once');
  assert.equal(worker.calls[0].action, 'cv_list_drive_folders');
  assertDeepEqualJSON(result, [{ id: 1, name: 'A', folder_id: 'X' }]);
});

test('list() resolves to [] when folders key is missing', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.list();
  assert.ok(Array.isArray(result), 'result must be an array');
  assert.equal(result.length, 0);
});

test('list() passes _silent:true when opts._silent is true', async () => {
  const worker = makeWorker({ ok: true, folders: [] });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.list({ _silent: true });
  assert.equal(worker.calls[0]._silent, true);
});

test('list() does NOT pass _silent when opts._silent is not set', async () => {
  const worker = makeWorker({ ok: true, folders: [] });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.list();
  assert.ok(!('_silent' in worker.calls[0]) || worker.calls[0]._silent !== true);
});

// --- create() ---

test('create() calls callWorker with action cv_add_drive_folder, name, folder_id', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 10, name: 'Main', folder_id: 'abc' } });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.create({ name: 'Main', folder_id: 'abc' });
  assert.equal(worker.calls[0].action, 'cv_add_drive_folder');
  assert.equal(worker.calls[0].name, 'Main');
  assert.equal(worker.calls[0].folder_id, 'abc');
  assertDeepEqualJSON(result, { id: 10, name: 'Main', folder_id: 'abc' });
});

test('create() resolves to null when folder key is missing', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.create({ name: 'X', folder_id: 'y' });
  assert.equal(result, null);
});

// --- update() ---

test('update() calls callWorker with action cv_update_drive_folder and id', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5, name: 'B', folder_id: 'z' } });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.update(5, { name: 'B', folder_id: 'z' });
  assert.equal(worker.calls[0].action, 'cv_update_drive_folder');
  assert.equal(worker.calls[0].id, 5);
});

test('update() includes name only when patch.name is a string', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.update(5, { name: 'B' });
  assert.ok('name' in worker.calls[0], 'name must be included when string');
  assert.equal(worker.calls[0].name, 'B');
});

test('update() omits name when patch.name is not a string', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.update(5, { folder_id: 'z' });
  assert.ok(!('name' in worker.calls[0]), 'name must be omitted when not a string');
});

test('update() includes folder_id only when patch.folder_id is a string', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.update(5, { folder_id: 'z' });
  assert.equal(worker.calls[0].folder_id, 'z');
});

test('update() omits folder_id when patch.folder_id is not a string', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.update(5, { name: 'B' });
  assert.ok(!('folder_id' in worker.calls[0]), 'folder_id must be omitted when not a string');
});

test('update() resolves to data.folder or null when missing', async () => {
  const worker = makeWorker({ ok: true, folder: { id: 5, name: 'G' } });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.update(5, { name: 'G' });
  assertDeepEqualJSON(result, { id: 5, name: 'G' });

  const worker2 = makeWorker({ ok: true });
  const ctx2 = loadModule(worker2);
  const result2 = await ctx2.CVDriveFoldersAPI.update(5, { name: 'G' });
  assert.equal(result2, null);
});

// --- remove() ---

test('remove() calls callWorker with action cv_delete_drive_folder and id', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  await ctx.CVDriveFoldersAPI.remove(7);
  assert.equal(worker.calls[0].action, 'cv_delete_drive_folder');
  assert.equal(worker.calls[0].id, 7);
});

test('remove() resolves to { ok: true }', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.remove(7);
  assert.ok(result && result.ok === true);
});

test('remove() reflects ok:false from worker', async () => {
  const worker = makeWorker({ ok: false });
  const ctx = loadModule(worker);
  const result = await ctx.CVDriveFoldersAPI.remove(7);
  assert.ok(result && result.ok === false);
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
