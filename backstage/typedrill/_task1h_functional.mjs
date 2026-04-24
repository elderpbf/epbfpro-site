// TypeDrill task 1H -- source registry + session functional harness.
// Shims localStorage + window + minimal DOM, imports registry/session/charset,
// drives source switches, options persistence, charset-driven regenerate.
// Run from typedrill/: node _task1h_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.window = { addEventListener: () => {} };

function stubElement() {
  return {
    addEventListener: () => {},
    appendChild: () => {},
    setAttribute: () => {},
    textContent: '',
    className: '',
    innerHTML: '',
    children: []
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => stubElement()
};

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const registry = await import('./js/source-registry.js');
const session = await import('./js/session.js');
const charset = await import('./js/charset.js');
const skill = await import('./js/skill.js');

// --- Test 1: registry has 3 MVP entries ---
assert(registry.list().length === 3, `registry.list() has 3 entries (got ${registry.list().length})`);
assert(registry.get('symbols') != null, 'registry has symbols');
assert(registry.get('common') != null, 'registry has common');
assert(registry.get('custom') != null, 'registry has custom');

// --- Test 2: each entry has generate + label ---
for (const id of ['symbols', 'common', 'custom']) {
  const e = registry.get(id);
  assert(typeof e.generate === 'function', `${id}.generate is a function`);
  assert(typeof e.label === 'string' && e.label.length > 0, `${id}.label non-empty`);
}

// --- Test 3: session.init picks common by default + non-empty initial line ---
let notifyCount = 0;
let lastSnap = null;
session.subscribe((snap) => { notifyCount++; lastSnap = snap; });
session.init();
assert(session.getActiveSource() === 'common', 'default active source is common');
assert(notifyCount >= 1, `subscribe fired at least once on init (got ${notifyCount})`);
assert(lastSnap != null && typeof lastSnap.line === 'string' && lastSnap.line.length > 0,
       'initial line non-empty under default charset');

// --- Test 4: setActiveSource switches and regenerates ---
const beforeSwitch = notifyCount;
session.setActiveSource('custom');
assert(session.getActiveSource() === 'custom', 'activeSource set to custom');
assert(notifyCount > beforeSwitch, 'subscribe fired on source switch');
assert(lastSnap.activeId === 'custom', 'snap.activeId updated');

session.setActiveSource('common');

// --- Test 5: setOptions persists + regenerates for ACTIVE source ---
const baseline = notifyCount;
session.setOptions('common', { wordsPerLesson: 5 });
assert(notifyCount > baseline, 'setOptions on active source triggers regenerate');
skill.flush();
let persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.settings.sources && persisted.settings.sources.common.wordsPerLesson === 5,
       'wordsPerLesson persisted under settings.sources.common');

// --- Test 6: setOptions for INACTIVE source does NOT regenerate ---
const baseline2 = notifyCount;
session.setOptions('symbols', { level: 3 });
assert(notifyCount === baseline2, 'setOptions on inactive source does not regenerate');
skill.flush();
persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.settings.sources.symbols.level === 3, 'inactive source options still persisted');

// --- Test 7: charset burst coalesces to exactly one session.regenerate ---
const baseline3 = notifyCount;
charset.addFocus('a');
charset.addFocus('b');
charset.addFocus('c');
await new Promise(r => queueMicrotask(r));
await new Promise(r => queueMicrotask(r));
const delta = notifyCount - baseline3;
assert(delta === 1, `charset burst triggers exactly one regenerate (got ${delta})`);
charset.removeFocus('a');
charset.removeFocus('b');
charset.removeFocus('c');
await new Promise(r => queueMicrotask(r));

// --- Test 8: nextLine fires subscriber (advance or regenerate) ---
const preNext = notifyCount;
session.nextLine();
assert(notifyCount > preNext, 'nextLine triggers subscriber');

// --- Test 9: active source persists across re-init ---
session.setActiveSource('symbols');
skill.flush();
persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.settings.activeSource === 'symbols', 'activeSource persisted to skill state');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
