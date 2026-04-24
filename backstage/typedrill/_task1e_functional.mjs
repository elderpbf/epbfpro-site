// TypeDrill task 1E stats functional harness.
// Mocks Date.now() to advance time deterministically.
// Contract: cpm is based on ACTIVE time only -- gaps between keystrokes
// are clamped to IDLE_THRESHOLD_MS (exported by stats.js). After the last
// keystroke, displayed elapsed grows by at most the threshold, then freezes.
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
const T = stats.IDLE_THRESHOLD_MS;
const round = (x) => Math.round(x);
const cpm = (chars, ms) => ms <= 0 ? 0 : round(chars / (ms / 60000));

// --- Test 1: fresh session returns zeros ---
stats.startSession();
let snap = stats.tick();
assert(snap.sessionCpm === 0, 'fresh session cpm 0');
assert(snap.lineCpm === 0, 'fresh line cpm 0');
assert(snap.acc === 100, 'fresh accuracy 100');
assert(snap.sessionElapsedMs === 0, 'fresh elapsed 0');

// --- Test 2: first keystroke + half-threshold grace window ---
fakeNow = 1000;
stats.recordChar(true);
const halfGrace = Math.floor(T / 2);
advance(halfGrace);
snap = stats.tick();
assert(snap.sessionElapsedMs === halfGrace, `${halfGrace}ms grace elapsed (got ${snap.sessionElapsedMs})`);
assert(snap.sessionCpm === cpm(1, halfGrace), `1 char @ ${halfGrace}ms active = ${cpm(1, halfGrace)} cpm (got ${snap.sessionCpm})`);

// --- Test 3: grace caps at threshold ---
advance(60000); // way past threshold
snap = stats.tick();
assert(snap.sessionElapsedMs === T, `pause > threshold caps at ${T}ms grace (got ${snap.sessionElapsedMs})`);
assert(snap.sessionCpm === cpm(1, T), `grace-cap cpm = ${cpm(1, T)} (got ${snap.sessionCpm})`);

// --- Test 4: recording after long idle only adds threshold worth of active ---
stats.recordChar(true);
snap = stats.tick();
// active = 0 (first key) + min(huge gap, T) = T. Grace right after key = 0.
assert(snap.sessionElapsedMs === T, `after clamped add, elapsed = ${T}ms (got ${snap.sessionElapsedMs})`);
assert(snap.sessionCpm === cpm(2, T), `2 chars @ ${T}ms active = ${cpm(2, T)} cpm (got ${snap.sessionCpm})`);

// --- Test 5: steady typing at threshold interval accumulates linearly ---
stats.startSession();
fakeNow = 0;
stats.recordChar(true);
for (let i = 0; i < 59; i++) {
  advance(T);              // exactly threshold = fully counted
  stats.recordChar(true);
}
snap = stats.tick();
// 59 gaps of T ms = 59*T active
assert(snap.sessionElapsedMs === 59 * T, `60 steady chars @ ${T}ms each -> ${59 * T}ms (got ${snap.sessionElapsedMs})`);
assert(snap.sessionCpm === cpm(60, 59 * T), `steady cpm = ${cpm(60, 59 * T)} (got ${snap.sessionCpm})`);

// --- Test 6: startLine resets line but NOT session ---
stats.startLine();
snap = stats.tick();
assert(snap.lineCpm === 0, 'lineCpm 0 right after startLine');
assert(snap.sessionCorrect === 60, 'sessionCorrect retained');
// Type 10 chars at threshold interval
for (let i = 0; i < 10; i++) {
  advance(T);
  stats.recordChar(true);
}
snap = stats.tick();
// Line: 10 gaps of T = 10*T active
assert(snap.lineCpm === cpm(10, 10 * T), `line: 10 chars @ ${T}ms each = ${cpm(10, 10 * T)} cpm (got ${snap.lineCpm})`);

// --- Test 7: errors reduce accuracy ---
stats.recordChar(false);
stats.recordChar(false);
snap = stats.tick();
// 70 correct + 2 errors = 72 total -> 70/72 ~ 97%
assert(snap.acc === 97, `accuracy 70/72 ~ 97% (got ${snap.acc})`);
assert(snap.sessionErrors === 2, 'sessionErrors === 2');

// --- Test 8: long pause freezes elapsed at active + one grace window ---
const activeBeforeIdle = 59 * T + 10 * T; // session accumulated: test 5 + test 6
advance(30000); // way past threshold
snap = stats.tick();
assert(snap.sessionElapsedMs === activeBeforeIdle + T, `long pause elapsed = active + grace = ${activeBeforeIdle + T} (got ${snap.sessionElapsedMs})`);

// --- Test 9: startSession resets everything ---
stats.startSession();
snap = stats.tick();
assert(snap.sessionCpm === 0, 'sessionCpm 0 after startSession');
assert(snap.lineCpm === 0, 'lineCpm 0 after startSession');
assert(snap.sessionCorrect === 0, 'sessionCorrect 0 after startSession');
assert(snap.sessionErrors === 0, 'sessionErrors 0 after startSession');
assert(snap.sessionElapsedMs === 0, 'elapsed 0 after startSession');
assert(snap.acc === 100, 'accuracy 100 after startSession');

Date.now = origDateNow;

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
