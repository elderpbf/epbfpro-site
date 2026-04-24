// TypeDrill task 1E stats functional harness.
// Mocks Date.now() to advance time deterministically.
// Contract: cpm is based on ACTIVE time only -- pauses longer than the
// IDLE_THRESHOLD_MS (2000ms) are excluded from elapsed time. Between
// keystrokes, elapsed grows by at most the threshold (grace window).
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
assert(snap.sessionElapsedMs === 0, 'fresh elapsed 0');

// --- Test 2: first keystroke + 500ms grace window ---
fakeNow = 1000;
stats.recordChar(true);
advance(500);
snap = stats.tick();
// 1 correct char, 500ms grace -> 1 / (500/60000) = 120 cpm
assert(snap.sessionElapsedMs === 500, `500ms grace elapsed (got ${snap.sessionElapsedMs})`);
assert(snap.sessionCpm === 120, `1 char @ 500ms active = 120 cpm (got ${snap.sessionCpm})`);

// --- Test 3: grace window caps at IDLE_THRESHOLD (2000ms) ---
advance(60000); // 60s idle since last key
snap = stats.tick();
assert(snap.sessionElapsedMs === 2000, `pause > threshold caps at 2000ms grace (got ${snap.sessionElapsedMs})`);
// cpm = 1 / (2000/60000) = 30
assert(snap.sessionCpm === 30, `grace-cap cpm = 30 (got ${snap.sessionCpm})`);

// --- Test 4: recording a char after long idle only adds threshold, not full gap ---
stats.recordChar(true);
// active accumulated: 0 (first char) + min(60500ms, 2000ms) = 2000ms
// now lastKeyTs = fakeNow. Tick immediately -> grace = 0
snap = stats.tick();
assert(snap.sessionElapsedMs === 2000, `after clamped add, elapsed = 2000ms (got ${snap.sessionElapsedMs})`);
// 2 chars over 2000ms active = 60 cpm
assert(snap.sessionCpm === 60, `2 chars @ 2000ms active = 60 cpm (got ${snap.sessionCpm})`);

// --- Test 5: steady typing within threshold accumulates linearly ---
stats.startSession();
fakeNow = 0;
stats.recordChar(true);
for (let i = 0; i < 59; i++) {
  advance(1000);           // 1s between each keystroke, within threshold
  stats.recordChar(true);
}
snap = stats.tick();
// 60 chars, active = 59 * 1000 = 59000ms (accumulated between keystrokes)
// Plus tick grace = 0 since we just typed
assert(snap.sessionElapsedMs === 59000, `60 steady chars @ 1s each -> 59000ms (got ${snap.sessionElapsedMs})`);
// cpm = 60 / (59000/60000) = 61 (rounded from 61.017)
assert(snap.sessionCpm === 61, `steady cpm ~ 61 (got ${snap.sessionCpm})`);

// --- Test 6: startLine resets line but NOT session ---
stats.startLine();
snap = stats.tick();
assert(snap.lineCpm === 0, 'lineCpm 0 right after startLine');
assert(snap.sessionCpm === 61, 'sessionCpm unchanged by startLine');
assert(snap.sessionCorrect === 60, 'sessionCorrect retained');
// Type 10 chars over 10 seconds (1s each, within threshold)
for (let i = 0; i < 10; i++) {
  advance(1000);
  stats.recordChar(true);
}
snap = stats.tick();
// Line: 10 chars, active 10*1000 = 10000ms -> 60 cpm
assert(snap.lineCpm === 60, `line: 10 chars @ 1s each = 60 cpm (got ${snap.lineCpm})`);

// --- Test 7: errors reduce accuracy, don't block cpm ---
stats.recordChar(false);
stats.recordChar(false);
snap = stats.tick();
// 70 correct + 2 errors = 72 total -> 70/72 ~ 97%
assert(snap.acc === 97, `accuracy 70/72 ~ 97% (got ${snap.acc})`);
assert(snap.sessionErrors === 2, 'sessionErrors === 2');

// --- Test 8: long pause doesn't drag elapsed after last keystroke ---
// Prior active = 59000 (test 5) + 10000 (test 6) + 0 (test 7 errors at same fakeNow) = 69000.
advance(30000); // 30s idle
snap = stats.tick();
// elapsed = 69000 + min(30000, 2000) = 71000
assert(snap.sessionElapsedMs === 71000, `long pause caps elapsed at +2000 grace (got ${snap.sessionElapsedMs})`);

// --- Test 9: startSession resets everything ---
stats.startSession();
snap = stats.tick();
assert(snap.sessionCpm === 0, 'sessionCpm 0 after startSession');
assert(snap.lineCpm === 0, 'lineCpm 0 after startSession');
assert(snap.sessionCorrect === 0, 'sessionCorrect 0 after startSession');
assert(snap.sessionErrors === 0, 'sessionErrors 0 after startSession');
assert(snap.sessionElapsedMs === 0, 'elapsed 0 after startSession');
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
