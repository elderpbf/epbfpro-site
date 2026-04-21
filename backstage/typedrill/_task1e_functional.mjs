// TypeDrill task 1E stats functional harness.
// Mocks Date.now() to advance time deterministically.
// Run from typedrill/: node _task1e_functional.mjs

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

let fakeNow = 0;
const origDateNow = Date.now;
Date.now = () => fakeNow;
const advance = (ms) => { fakeNow += ms; };

const stats = await import('./js/stats.js');

// --- Test 1: fresh session returns zeros ---
stats.startSession();
let snap = stats.tick();
assert(snap.sessionCpm === 0, 'fresh session cpm 0');
assert(snap.lineCpm === 0, 'fresh line cpm 0');
assert(snap.acc === 100, 'fresh accuracy 100');

// --- Test 2: first keystroke starts clock ---
fakeNow = 1000;
stats.recordChar(true);
advance(60000); // 1 minute later
snap = stats.tick();
assert(snap.sessionCpm === 1, '1 char in 1 minute = 1 cpm');
assert(snap.lineCpm === 1, 'line cpm also 1');

// --- Test 3: more chars accumulate ---
fakeNow = 61000;
for (let i = 0; i < 59; i++) stats.recordChar(true); // total 60 chars at 60s
advance(0);
snap = stats.tick();
// 60 correct chars, session elapsed 60000ms = 1 min, so cpm = 60
assert(snap.sessionCpm === 60, `60 chars at 60s elapsed = 60 cpm (got ${snap.sessionCpm})`);

// --- Test 4: startLine resets line clock but NOT session ---
stats.startLine();
// Before any char, line cpm should be 0
snap = stats.tick();
assert(snap.lineCpm === 0, 'lineCpm 0 right after startLine');
assert(snap.sessionCpm === 60, 'sessionCpm unchanged by startLine');
// Type 10 more chars in 30 seconds
for (let i = 0; i < 10; i++) stats.recordChar(true);
advance(30000); // 30 seconds
snap = stats.tick();
// Line: 10 chars in 30s = 20 cpm
assert(snap.lineCpm === 20, `line: 10 chars in 30s = 20 cpm (got ${snap.lineCpm})`);
// Session: 70 correct chars over 90s (1.5 min) = 46.67 rounded = 47
assert(snap.sessionCpm === 47, `session: 70 chars in 90s ~ 47 cpm (got ${snap.sessionCpm})`);

// --- Test 5: errors reduce accuracy ---
stats.recordChar(false);
stats.recordChar(false);
snap = stats.tick();
// 70 correct + 2 errors = 72 total, 70/72 = 97.22 = 97
assert(snap.acc === 97, `accuracy 70/72 ~ 97% (got ${snap.acc})`);
assert(snap.sessionErrors === 2, 'sessionErrors === 2');

// --- Test 6: startSession resets everything ---
stats.startSession();
snap = stats.tick();
assert(snap.sessionCpm === 0, 'sessionCpm 0 after startSession');
assert(snap.lineCpm === 0, 'lineCpm 0 after startSession');
assert(snap.sessionCorrect === 0, 'sessionCorrect 0 after startSession');
assert(snap.sessionErrors === 0, 'sessionErrors 0 after startSession');
assert(snap.acc === 100, 'accuracy 100 after startSession');

// Restore Date.now to avoid polluting anything else
Date.now = origDateNow;

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
