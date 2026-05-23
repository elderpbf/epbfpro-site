'use strict';

// Bundle J - Host page checkbox stomp bug.
//
// Repro: the cpq-data event fires every 3s. Its host.html handler calls
// setChk('chk-reveal-answer', T.canReveal) and setChk('chk-show-results',
// T.canShowResults). The original setChk implementation did
// `chk.checked = enabled`, conflating "enable the control" with "set its
// default value". Every poll tick reset the checkboxes back to their type-
// default state, stomping any local toggle the user had made.
//
// The fix moves the sync logic into CPCheckboxSync.sync({chk, supported}),
// which:
//   - sets chk.disabled = !supported
//   - if supported, leaves chk.checked alone (preserves user's local edit)
//   - if NOT supported, forces chk.checked back to the type default and
//     disables the control
//   - on a separate path (initialize / reset / new question), the caller
//     explicitly calls .reset(chk, defaultChecked) to seed the value.
//
// Run: node Site/backstage/js/classpulse-checkbox-sync.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---------------------------------------------------------------------------
// Load the module under test into a sandbox
// ---------------------------------------------------------------------------

const modulePath = path.join(__dirname, 'classpulse-checkbox-sync.js');
const source = fs.readFileSync(modulePath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const CPCheckboxSync = sandbox.window.CPCheckboxSync;

// ---------------------------------------------------------------------------
// Fake checkbox helpers
// ---------------------------------------------------------------------------

function makeChk(initialChecked) {
  return {
    checked: !!initialChecked,
    disabled: false,
    parentElement: { style: {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Test 1: module exists and exports sync + reset
{
  assert.ok(CPCheckboxSync, 'CPCheckboxSync should be exposed on window');
  assert.equal(typeof CPCheckboxSync.sync, 'function', 'sync method exists');
  assert.equal(typeof CPCheckboxSync.reset, 'function', 'reset method exists');
  console.log('PASS  test 1: CPCheckboxSync module exposes sync + reset');
}

// Test 2: sync({supported:true}) enables the checkbox and PRESERVES user state
// This is the headline bug fix. The user unchecked the box; the poll handler
// must not flip it back on.
{
  const chk = makeChk(false);            // user unchecked
  CPCheckboxSync.sync({ chk: chk, supported: true });
  assert.equal(chk.disabled, false, 'enabled when type supports it');
  assert.equal(chk.checked, false,
    'checked state must be preserved across sync when supported (no stomp)');
  console.log('PASS  test 2: sync preserves user-unchecked state');
}

// Test 3: sync({supported:true}) on a user-checked checkbox keeps it checked
{
  const chk = makeChk(true);
  CPCheckboxSync.sync({ chk: chk, supported: true });
  assert.equal(chk.disabled, false);
  assert.equal(chk.checked, true,
    'checked state preserved when user has checked the box');
  console.log('PASS  test 3: sync preserves user-checked state');
}

// Test 4: sync({supported:false}) disables AND clears the checkbox.
// (Disabled types should not accidentally submit a checked value.)
{
  const chk = makeChk(true);
  CPCheckboxSync.sync({ chk: chk, supported: false });
  assert.equal(chk.disabled, true, 'disabled when type does not support');
  assert.equal(chk.checked, false,
    'checked state cleared when control becomes unsupported');
  console.log('PASS  test 4: sync clears + disables when unsupported');
}

// Test 5: repeated sync calls during polling never flip user state once set.
// Simulates the 3-second poll tick over and over.
{
  const chk = makeChk(true);             // host launches; default is checked
  // User unchecks
  chk.checked = false;
  // 20 poll ticks fire in the next 60 seconds
  for (let i = 0; i < 20; i++) {
    CPCheckboxSync.sync({ chk: chk, supported: true });
  }
  assert.equal(chk.checked, false,
    'after 20 simulated poll ticks the user unchecked state must persist');
  console.log('PASS  test 5: 20 sequential syncs do not stomp user state');
}

// Test 6: reset() forces the checked state to the supplied default.
// This is the explicit seed path used on (a) new question launch and
// (b) initial type-selector wiring.
{
  const chk = makeChk(false);
  CPCheckboxSync.reset({ chk: chk, supported: true, defaultChecked: true });
  assert.equal(chk.checked, true, 'reset seeds default checked state');
  assert.equal(chk.disabled, false);

  // reset to false default
  CPCheckboxSync.reset({ chk: chk, supported: true, defaultChecked: false });
  assert.equal(chk.checked, false, 'reset can seed default false');
  console.log('PASS  test 6: reset() seeds default state');
}

// Test 7: reset({supported:false}) disables and clears, ignoring defaultChecked.
{
  const chk = makeChk(true);
  CPCheckboxSync.reset({ chk: chk, supported: false, defaultChecked: true });
  assert.equal(chk.disabled, true);
  assert.equal(chk.checked, false, 'unsupported control is forced off');
  console.log('PASS  test 7: reset({supported:false}) forces off and disabled');
}

// Test 8: sync() updates the parent <label> opacity / cursor when disabled,
// mirroring the original setChk's visual feedback so the UI does not regress.
{
  const chk = makeChk(false);
  CPCheckboxSync.sync({ chk: chk, supported: false });
  assert.equal(chk.parentElement.style.opacity, '0.35');
  assert.equal(chk.parentElement.style.cursor, 'not-allowed');

  // Re-enable: label styles clear back to default
  CPCheckboxSync.sync({ chk: chk, supported: true });
  assert.equal(chk.parentElement.style.opacity, '');
  assert.equal(chk.parentElement.style.cursor, '');
  console.log('PASS  test 8: parent label opacity/cursor reflect supported');
}

// Test 9: sync() is a no-op when chk is missing (defensive guard).
{
  // Should not throw
  CPCheckboxSync.sync({ chk: null, supported: true });
  CPCheckboxSync.sync({ chk: undefined, supported: true });
  console.log('PASS  test 9: sync tolerates missing chk');
}

console.log('\nALL CHECKBOX-SYNC TESTS PASS');
