// TypeDrill task 1L -- settings + resetProgress functional harness.
// Run from typedrill/: node _task1l_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.window = { addEventListener: () => {} };

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const skill = await import('./js/skill.js');

assert(typeof skill.resetProgress === 'function', 'skill.resetProgress is exported as a function');

// --- Test 1: settings round-trip (simulate a "reload" via JSON inspection) ---
let s = skill.get();
s.targetWpm = 55;
s.settings.wordsPerLesson = 15;
s.settings.repeatWord = 3;
skill.set(s);
skill.flush();
let persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.targetWpm === 55, 'targetWpm persisted through skill.set + flush');
assert(persisted.settings.wordsPerLesson === 15, 'wordsPerLesson persisted');
assert(persisted.settings.repeatWord === 3, 'repeatWord persisted');

// --- Test 2: resetProgress clears charStats + sessions, preserves settings ---
skill.recordAttempt('a', true, 30);
skill.recordAttempt('b', false, 22);
s = skill.get();
s.sessions.push({ ts: Date.now(), source: 'common', duration: 100, chars: 30, errors: 1, cpm: 180 });
skill.set(s);
skill.flush();

let pre = skill.get();
assert(Object.keys(pre.charStats).length === 2, 'seeded two charStats entries');
assert(pre.sessions.length === 1, 'seeded one session');
assert(pre.targetWpm === 55, 'targetWpm still 55 before reset');
assert(pre.settings.wordsPerLesson === 15, 'wordsPerLesson still 15 before reset');

skill.resetProgress();

const after = skill.get();
assert(Object.keys(after.charStats).length === 0, 'resetProgress cleared charStats');
assert(after.sessions.length === 0, 'resetProgress cleared sessions');
assert(after.targetWpm === 55, 'resetProgress preserved targetWpm');
assert(after.settings.wordsPerLesson === 15, 'resetProgress preserved wordsPerLesson');
assert(after.settings.repeatWord === 3, 'resetProgress preserved repeatWord');

// --- Test 3: resetProgress flushes synchronously to storage ---
persisted = JSON.parse(storage.get('td_skill_v1'));
assert(Object.keys(persisted.charStats).length === 0, 'reset flushed charStats to storage');
assert(persisted.sessions.length === 0, 'reset flushed sessions to storage');
assert(persisted.targetWpm === 55, 'reset persisted targetWpm still 55');

// --- Test 4: global settings defaults flow to session.generate via merged opts ---
const session = await import('./js/session.js');
const charset = await import('./js/charset.js');

let notifyCount = 0;
let lastSnap = null;
session.subscribe((snap) => { notifyCount++; lastSnap = snap; });

s = skill.get();
s.settings.wordsPerLesson = 7;
skill.set(s);

session.init();
session.setActiveSource('common');
assert(lastSnap && lastSnap.line.split(' ').length === 7,
       `session uses global wordsPerLesson=7 (line='${lastSnap && lastSnap.line}')`);

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
