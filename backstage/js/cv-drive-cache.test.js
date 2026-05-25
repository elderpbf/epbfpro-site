'use strict';

// Acceptance tests for cv-drive-cache.js (CVDriveCache window global).
// Bundle O. Pure-function bucketing helpers, no DOM.
// Run: node backstage/js/cv-drive-cache.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'cv-drive-cache.js');

function loadModule() {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cv-drive-cache.js' });
  return ctx;
}

function assertDeepEqualJSON(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert.equal(a, e, (msg || 'deepEqual') + '\n  actual:   ' + a + '\n  expected: ' + e);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVDriveCache is exposed on window', () => {
  const ctx = loadModule();
  assert.ok(ctx.CVDriveCache, 'window.CVDriveCache must be defined');
  assert.equal(typeof ctx.CVDriveCache.filterDriveFiles, 'function', 'filterDriveFiles must be a function');
  assert.equal(typeof ctx.CVDriveCache.groupByFolder,    'function', 'groupByFolder must be a function');
});

// --- filterDriveFiles() ---

test('filterDriveFiles keeps only items with type drive_file', () => {
  const ctx = loadModule();
  const input = [
    { id: 1, type: 'llm', title: 'a' },
    { id: 2, type: 'drive_file', title: 'b' },
    { id: 3, type: 'popup_url', title: 'c' },
    { id: 4, type: 'drive_file', title: 'd' },
  ];
  const out = ctx.CVDriveCache.filterDriveFiles(input);
  assert.equal(out.length, 2, 'must return 2 drive_file items');
  assert.equal(out[0].id, 2);
  assert.equal(out[1].id, 4);
});

test('filterDriveFiles returns [] for empty or non-array input', () => {
  const ctx = loadModule();
  assertDeepEqualJSON(ctx.CVDriveCache.filterDriveFiles([]), []);
  assertDeepEqualJSON(ctx.CVDriveCache.filterDriveFiles(null), []);
  assertDeepEqualJSON(ctx.CVDriveCache.filterDriveFiles(undefined), []);
});

// --- groupByFolder() ---

test('groupByFolder buckets items by meta_json.folder_name', () => {
  const ctx = loadModule();
  const items = [
    { id: 1, type: 'drive_file', title: 'a', meta_json: { folder_name: 'Aulas' } },
    { id: 2, type: 'drive_file', title: 'b', meta_json: { folder_name: 'Apostilas' } },
    { id: 3, type: 'drive_file', title: 'c', meta_json: { folder_name: 'Aulas' } },
  ];
  const result = ctx.CVDriveCache.groupByFolder(items);
  assert.ok(Array.isArray(result.groups), 'groups must be an array');
  assert.equal(result.totalCount, 3, 'totalCount must equal item count');

  const byName = {};
  for (const g of result.groups) byName[g.name] = g.items;
  assert.equal(byName['Aulas'].length, 2, 'Aulas group has 2 items');
  assert.equal(byName['Apostilas'].length, 1, 'Apostilas group has 1 item');
});

test('groupByFolder puts items with missing/empty folder_name into "(raiz)"', () => {
  const ctx = loadModule();
  const items = [
    { id: 1, type: 'drive_file', title: 'a', meta_json: { folder_name: '' } },
    { id: 2, type: 'drive_file', title: 'b', meta_json: {} },
    { id: 3, type: 'drive_file', title: 'c' },
    { id: 4, type: 'drive_file', title: 'd', meta_json: { folder_name: 'Aulas' } },
  ];
  const result = ctx.CVDriveCache.groupByFolder(items);
  const raiz = result.groups.find(function (g) { return g.name === '(raiz)'; });
  assert.ok(raiz, '(raiz) group must exist');
  assert.equal(raiz.items.length, 3);
});

test('groupByFolder filters out non-drive_file items before grouping', () => {
  const ctx = loadModule();
  const items = [
    { id: 1, type: 'llm',        title: 'a' },
    { id: 2, type: 'drive_file', title: 'b', meta_json: { folder_name: 'X' } },
    { id: 3, type: 'tarefa',     title: 'c' },
  ];
  const result = ctx.CVDriveCache.groupByFolder(items);
  assert.equal(result.totalCount, 1, 'only the drive_file row counts');
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].name, 'X');
});

test('groupByFolder returns empty result for empty input', () => {
  const ctx = loadModule();
  const result = ctx.CVDriveCache.groupByFolder([]);
  assertDeepEqualJSON(result.groups, []);
  assert.equal(result.totalCount, 0);
});

test('groupByFolder sorts groups by name with "(raiz)" pinned first', () => {
  const ctx = loadModule();
  const items = [
    { id: 1, type: 'drive_file', meta_json: { folder_name: 'Banco' } },
    { id: 2, type: 'drive_file', meta_json: { folder_name: 'Aulas' } },
    { id: 3, type: 'drive_file', meta_json: {} },
    { id: 4, type: 'drive_file', meta_json: { folder_name: 'Apostilas' } },
  ];
  const result = ctx.CVDriveCache.groupByFolder(items);
  const names = result.groups.map(function (g) { return g.name; });
  assert.equal(names[0], '(raiz)', '(raiz) must be first');
  // Remaining must be alphabetical
  const rest = names.slice(1);
  const sorted = rest.slice().sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  assertDeepEqualJSON(rest, sorted, 'non-raiz groups must be sorted');
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
