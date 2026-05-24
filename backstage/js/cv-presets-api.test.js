'use strict';

// Acceptance tests for cv-presets-api.js (CVPresetsAPI window global).
// Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-presets-api.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'cv-presets-api.js');

// Load the module into a fresh context with a mocked callWorker.
// `mockFn` is called with the params object; it must return a Promise.
function loadModule(mockFn) {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const ctx = {
    window: {},
    console,
    callWorker: mockFn || (async () => ({})),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cv-presets-api.js' });
  return ctx;
}

// Convenience: make a callWorker that resolves with `response` and records the call.
function makeWorker(response) {
  const calls = [];
  const fn = async (params) => { calls.push(params); return response; };
  fn.calls = calls;
  return fn;
}

// Convenience: make a callWorker that rejects with a structured error.
function makeRejector(errData) {
  const err = new Error('worker error');
  err.data = errData;
  return async () => { throw err; };
}

// Cross-realm deepEqual: VM objects are different realm, use JSON comparison.
function assertDeepEqualJSON(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert.equal(a, e, (msg || 'deepEqual') + '\n  actual:   ' + a + '\n  expected: ' + e);
}

// ── tests ─────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVPresetsAPI is exposed on window', () => {
  const ctx = loadModule(makeWorker({ ok: true, presets: [] }));
  assert.ok(ctx.CVPresetsAPI, 'window.CVPresetsAPI must be defined');
  assert.equal(typeof ctx.CVPresetsAPI.list,   'function', 'list must be a function');
  assert.equal(typeof ctx.CVPresetsAPI.get,    'function', 'get must be a function');
  assert.equal(typeof ctx.CVPresetsAPI.create, 'function', 'create must be a function');
  assert.equal(typeof ctx.CVPresetsAPI.update, 'function', 'update must be a function');
  assert.equal(typeof ctx.CVPresetsAPI.remove, 'function', 'remove must be a function');
});

// --- CVPresetsAPI.list ---

test('list() calls callWorker with action cv_list_presets', async () => {
  const worker = makeWorker({ ok: true, presets: [{ id: 1, name: 'A' }] });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.list();
  assert.equal(worker.calls.length, 1, 'callWorker must be called once');
  assert.equal(worker.calls[0].action, 'cv_list_presets', 'action must be cv_list_presets');
  assertDeepEqualJSON(result, [{ id: 1, name: 'A' }], 'must resolve to data.presets');
});

test('list() resolves to [] when presets key is missing', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.list();
  assert.ok(Array.isArray(result), 'result must be an array');
  assert.equal(result.length, 0, 'missing presets key must fall back to [] (length 0)');
});

test('list() passes _silent:true when opts._silent is true', async () => {
  const worker = makeWorker({ ok: true, presets: [] });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.list({ _silent: true });
  assert.equal(worker.calls[0]._silent, true, '_silent must be forwarded to callWorker');
});

test('list() does NOT pass _silent when opts._silent is not set', async () => {
  const worker = makeWorker({ ok: true, presets: [] });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.list();
  assert.ok(!('_silent' in worker.calls[0]) || worker.calls[0]._silent !== true,
    '_silent must not be set when not requested');
});

// --- CVPresetsAPI.get ---

test('get() calls callWorker with action cv_get_preset and id', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 42, name: 'B' } });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.get(42);
  assert.equal(worker.calls[0].action, 'cv_get_preset', 'action must be cv_get_preset');
  assert.equal(worker.calls[0].id, 42, 'id must be forwarded');
  assertDeepEqualJSON(result, { id: 42, name: 'B' }, 'must resolve to data.preset');
});

test('get() resolves to null when preset key is missing', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.get(1);
  assert.equal(result, null, 'missing preset key must fall back to null');
});

test('get() passes _silent:true when opts._silent is true', async () => {
  const worker = makeWorker({ ok: true, preset: null });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.get(1, { _silent: true });
  assert.equal(worker.calls[0]._silent, true, '_silent must be forwarded');
});

// --- CVPresetsAPI.create ---

test('create() calls callWorker with action cv_create_preset, name, item_ids', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 10, name: 'C', item_ids: ['x'] } });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.create({ name: 'C', item_ids: ['x'] });
  assert.equal(worker.calls[0].action, 'cv_create_preset', 'action must be cv_create_preset');
  assert.equal(worker.calls[0].name, 'C', 'name must be forwarded');
  assertDeepEqualJSON(worker.calls[0].item_ids, ['x'], 'item_ids must be forwarded');
  assertDeepEqualJSON(result, { id: 10, name: 'C', item_ids: ['x'] }, 'must resolve to data.preset');
});

test('create() sends item_ids as [] when item_ids is undefined', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 11, name: 'D', item_ids: [] } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.create({ name: 'D' });
  assert.ok('item_ids' in worker.calls[0], 'item_ids must be present in the call (not omitted)');
  assert.ok(Array.isArray(worker.calls[0].item_ids), 'item_ids must be an array');
  assert.equal(worker.calls[0].item_ids.length, 0, 'item_ids must be sent as [] (empty array)');
});

test('create() resolves to null when preset key is missing', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.create({ name: 'X', item_ids: [] });
  assert.equal(result, null, 'missing preset key must fall back to null');
});

// --- CVPresetsAPI.update ---

test('update() calls callWorker with action cv_update_preset and id', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5, name: 'E' } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.update(5, { name: 'E' });
  assert.equal(worker.calls[0].action, 'cv_update_preset', 'action must be cv_update_preset');
  assert.equal(worker.calls[0].id, 5, 'id must be forwarded');
});

test('update() includes name only when patch.name is a string', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5, name: 'E' } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.update(5, { name: 'E' });
  assert.ok('name' in worker.calls[0], 'name must be included when it is a string');
  assert.equal(worker.calls[0].name, 'E');
});

test('update() omits name when patch.name is not a string', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.update(5, { item_ids: ['a'] });
  assert.ok(!('name' in worker.calls[0]),
    'name must be omitted when patch.name is not a string');
});

test('update() includes item_ids only when patch.item_ids is an array', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5 } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.update(5, { item_ids: ['a', 'b'] });
  assert.ok(Array.isArray(worker.calls[0].item_ids), 'item_ids must be included when array');
  assertDeepEqualJSON(worker.calls[0].item_ids, ['a', 'b']);
});

test('update() omits item_ids when patch.item_ids is not an array', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5, name: 'F' } });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.update(5, { name: 'F' });
  assert.ok(!('item_ids' in worker.calls[0]),
    'item_ids must be omitted when patch.item_ids is not an array');
});

test('update() resolves to data.preset (or null when missing)', async () => {
  const worker = makeWorker({ ok: true, preset: { id: 5, name: 'G' } });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.update(5, { name: 'G' });
  assertDeepEqualJSON(result, { id: 5, name: 'G' });

  const worker2 = makeWorker({ ok: true });
  const ctx2 = loadModule(worker2);
  const result2 = await ctx2.CVPresetsAPI.update(5, { name: 'G' });
  assert.equal(result2, null, 'missing preset must return null');
});

// --- CVPresetsAPI.remove ---

test('remove() calls callWorker with action cv_delete_preset and id', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  await ctx.CVPresetsAPI.remove(7);
  assert.equal(worker.calls[0].action, 'cv_delete_preset', 'action must be cv_delete_preset');
  assert.equal(worker.calls[0].id, 7, 'id must be forwarded');
});

test('remove() resolves to { ok: true }', async () => {
  const worker = makeWorker({ ok: true });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.remove(7);
  assert.ok(result && result.ok === true, 'must resolve to { ok: true }');
});

test('remove() resolves to { ok: false } when worker returns ok:false', async () => {
  const worker = makeWorker({ ok: false });
  const ctx = loadModule(worker);
  const result = await ctx.CVPresetsAPI.remove(7);
  assert.ok(result && result.ok === false, 'must reflect ok:false from worker');
});

// ── runner ────────────────────────────────────────────────────────────────
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
