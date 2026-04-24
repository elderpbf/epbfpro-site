// TypeDrill task 1D functional harness.
// Shims localStorage + window, imports skill.js, asserts behavior.
// Run from typedrill/: node _task1d_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};

const listeners = new Map();
globalThis.window = {
  addEventListener: (ev, cb) => {
    if (!listeners.has(ev)) listeners.set(ev, []);
    listeners.get(ev).push(cb);
  }
};

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const skill = await import('./js/skill.js');

// --- Test 1: recordAttempt increments attempts/errors per expected char ---
skill.recordAttempt('a', true, 30);
skill.recordAttempt('a', false, 25);
skill.recordAttempt('b', true, 40);
let s = skill.get();
assert(s.charStats.a?.attempts === 2, 'charStats.a.attempts === 2');
assert(s.charStats.a?.errors === 1, 'charStats.a.errors === 1');
assert(s.charStats.b?.attempts === 1, 'charStats.b.attempts === 1');
assert(s.charStats.b?.errors === 0, 'charStats.b.errors === 0');
assert(s.version === 1, 'state.version === 1');

// --- Test 2: debounce holds write before 500ms ---
assert(!storage.has('td_skill_v1'), 'storage not yet written (debounce pending)');

// --- Test 3: beforeunload flushes synchronously ---
for (const cb of (listeners.get('beforeunload') || [])) cb();
assert(storage.has('td_skill_v1'), 'beforeunload triggered flush');
const persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.charStats.a.attempts === 2, 'persisted charStats.a.attempts === 2');
assert(persisted.charStats.a.errors === 1, 'persisted charStats.a.errors === 1');

// --- Test 4: debounce fires after 500ms ---
storage.delete('td_skill_v1');
skill.recordAttempt('c', true, 35);
assert(!storage.has('td_skill_v1'), 'fresh write still debounced');
await new Promise(r => setTimeout(r, 600));
assert(storage.has('td_skill_v1'), 'storage written after debounce timeout');
const after = JSON.parse(storage.get('td_skill_v1'));
assert(after.charStats.c.attempts === 1, 'debounced write persists charStats.c');

// --- Test 5: reset clears charStats and persists immediately ---
skill.reset();
const resetState = skill.get();
assert(Object.keys(resetState.charStats).length === 0, 'reset clears charStats');
const resetPersisted = JSON.parse(storage.get('td_skill_v1'));
assert(Object.keys(resetPersisted.charStats).length === 0, 'reset flushes immediately');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
