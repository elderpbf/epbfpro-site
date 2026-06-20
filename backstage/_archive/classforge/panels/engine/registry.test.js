// engine/registry.test.js
//
// Phase 1B acceptance test for the registry. Verifies:
//   - 3 fake tools register, listByKind returns all 3 with matching ids
//   - re-registering same id emits console.warn and second wins
//   - kinds are isolated and each getter works
//   - getter returns null on miss
//   - bad input is rejected
//
// Run: node Site/backstage/classforge/panels/engine/registry.test.js

import { strict as assert } from 'node:assert';
import {
  registerTool, getTool, listByKind, resetRegistry,
  registerElement, registerLayout, registerTheme,
  getElement, getLayout, getTheme,
} from './registry.js';

// Test 1: three tools registered + listed
{
  resetRegistry();
  registerTool({ id: 'alpha', kind: 'tool', mount() {}, unmount() {} });
  registerTool({ id: 'beta',  kind: 'tool', mount() {}, unmount() {} });
  registerTool({ id: 'gamma', kind: 'tool', mount() {}, unmount() {} });

  const tools = listByKind('tool');
  assert.equal(tools.length, 3, 'three tools registered');
  const ids = tools.map(t => t.id).sort();
  assert.deepEqual(ids, ['alpha', 'beta', 'gamma'], 'ids match');
  console.log('PASS  test 1: three tools registered + listed');
}

// Test 2: re-register replaces with warning
{
  resetRegistry();
  registerTool({ id: 'dup', kind: 'tool', mount() {}, unmount() {}, version: 1 });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    registerTool({ id: 'dup', kind: 'tool', mount() {}, unmount() {}, version: 2 });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1, 'one warning emitted');
  assert.match(warnings[0], /re-registered/, 'warning mentions re-registration');
  assert.match(warnings[0], /dup/, 'warning includes id');

  const found = getTool('dup');
  assert.equal(found.version, 2, 'second registration wins');
  console.log('PASS  test 2: re-register replaces with warning');
}

// Test 3: kinds isolated, each kind queryable
{
  resetRegistry();
  registerTool   ({ id: 'x', kind: 'tool',    mount() {}, unmount() {} });
  registerElement({ id: 'x', kind: 'element', mount() {}, unmount() {} });
  registerLayout ({ id: 'x', kind: 'layout',  mount() {}, unmount() {} });
  registerTheme  ({ id: 'x', kind: 'theme',   tokens: {} });

  assert.equal(getTool('x').kind,    'tool');
  assert.equal(getElement('x').kind, 'element');
  assert.equal(getLayout('x').kind,  'layout');
  assert.equal(getTheme('x').kind,   'theme');
  assert.equal(listByKind('tool').length,    1);
  assert.equal(listByKind('element').length, 1);
  assert.equal(listByKind('layout').length,  1);
  assert.equal(listByKind('theme').length,   1);
  console.log('PASS  test 3: kinds isolated, each kind queryable');
}

// Test 4: getter returns null on miss
{
  resetRegistry();
  assert.equal(getTool('nope'),    null, 'getTool returns null on miss');
  assert.equal(getElement('nope'), null, 'getElement returns null on miss');
  assert.equal(getLayout('nope'),  null, 'getLayout returns null on miss');
  assert.equal(getTheme('nope'),   null, 'getTheme returns null on miss');
  console.log('PASS  test 4: getter returns null on miss');
}

// Test 5: bad input rejected
{
  resetRegistry();
  assert.throws(() => registerTool(null),                /module must be an object/);
  assert.throws(() => registerTool({}),                  /module.id must be a non-empty string/);
  assert.throws(() => registerTool({ id: 'a', kind: 'element', mount(){}, unmount(){} }),
                /module.kind .* does not match/);
  console.log('PASS  test 5: bad input rejected');
}

console.log('\nAll registry tests passed.');
