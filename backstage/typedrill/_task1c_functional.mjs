// TypeDrill task 1C engine functional harness.
// Shims DOM (FakeInput) + localStorage + window, drives keydown+input events,
// asserts strict-mode rejection and opposite-hand Shift detection.
// Run from typedrill/: node _task1c_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};

const windowListeners = new Map();
globalThis.window = {
  addEventListener: (ev, cb) => {
    if (!windowListeners.has(ev)) windowListeners.set(ev, []);
    windowListeners.get(ev).push(cb);
  }
};

class FakeInput {
  constructor() {
    this.value = '';
    this._listeners = {};
  }
  addEventListener(type, cb) {
    (this._listeners[type] ||= []).push(cb);
  }
  removeEventListener(type, cb) {
    this._listeners[type] = (this._listeners[type] || []).filter(x => x !== cb);
  }
  _fire(type, event) {
    for (const cb of (this._listeners[type] || [])) cb(event);
  }
  pressShift(side) {
    this._fire('keydown', {
      key: 'Shift',
      location: side === 'left' ? 1 : 2,
      getModifierState: () => false
    });
  }
  type(ch, { shiftHeld = false } = {}) {
    this._fire('keydown', {
      key: ch,
      location: 0,
      getModifierState: (m) => m === 'Shift' ? shiftHeld : false
    });
    this.value += ch;
    this._fire('input', { inputType: 'insertText' });
  }
  backspace() {
    if (!this.value) return;
    let cancelled = false;
    this._fire('keydown', {
      key: 'Backspace',
      location: 0,
      getModifierState: () => false,
      preventDefault: () => { cancelled = true; }
    });
    if (cancelled) return;
    this.value = this.value.slice(0, -1);
    this._fire('input', { inputType: 'deleteContentBackward' });
  }
}

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const engine = await import('./js/engine.js');
const skill = await import('./js/skill.js');

// --- Test 1: wrong char LANDS (realistic mode), errors incremented ---
skill.reset();
let keystrokes = [];
let lineCompletes = 0;
let wrongShifts = [];

const input = new FakeInput();
engine.attach({
  inputEl: input,
  onKeystroke: (k) => keystrokes.push(k),
  onLineComplete: () => lineCompletes++,
  onWrongShift: (w) => wrongShifts.push(w)
});
engine.setTarget('hello');

input.type('X');
assert(input.value === 'X', 'realistic: wrong char lands (value === "X")');
let s = skill.get();
assert(s.charStats.h?.errors === 1, 'charStats.h.errors === 1 after wrong');
assert(s.charStats.h?.attempts === 1, 'charStats.h.attempts === 1 after wrong');
assert(keystrokes[0]?.wasCorrect === false, 'onKeystroke wasCorrect:false');

// --- Test 2: correct char at next position ---
skill.reset();
keystrokes = [];
input.value = '';
engine.setTarget('hello');
input.type('h');
assert(input.value === 'h', 'correct char lands');
s = skill.get();
assert(s.charStats.h.attempts === 1, 'charStats.h.attempts === 1');
assert(!s.charStats.h.errors, 'no errors for correct char');
assert(keystrokes[keystrokes.length - 1]?.wasCorrect === true, 'onKeystroke wasCorrect:true');

// --- Test 3: % with LEFT Shift triggers wrong-hand ---
skill.reset();
keystrokes = []; wrongShifts = []; lineCompletes = 0;
input.value = '';
engine.setTarget('%');
input.pressShift('left');
input.type('%', { shiftHeld: true });
assert(input.value === '%', '% accepted as correct char');
assert(wrongShifts.length === 1, 'onWrongShift fired once for left Shift on %');
assert(wrongShifts[0].char === '%', 'wrongShift payload char === %');
assert(wrongShifts[0].symbolHand === 'left', 'wrongShift symbolHand === left');
assert(wrongShifts[0].shiftSide === 'left', 'wrongShift shiftSide === left');
s = skill.get();
assert(s.charStats['%']?.errors === 1, 'left-Shift on % counts as error in charStats');

// --- Test 4: % with RIGHT Shift does NOT trigger wrong-hand ---
skill.reset();
keystrokes = []; wrongShifts = []; lineCompletes = 0;
input.value = '';
engine.setTarget('%');
input.pressShift('right');
input.type('%', { shiftHeld: true });
assert(input.value === '%', '% accepted (right Shift)');
assert(wrongShifts.length === 0, 'onWrongShift NOT fired for right Shift');
s = skill.get();
assert(s.charStats['%']?.errors === 0, 'right-Shift on % has zero errors');
assert(s.charStats['%']?.attempts === 1, 'right-Shift on % records one attempt');

// --- Test 5: full line completes ---
skill.reset();
keystrokes = []; wrongShifts = []; lineCompletes = 0;
input.value = '';
engine.setTarget('hi');
input.type('h');
assert(lineCompletes === 0, 'lineComplete not fired mid-line');
input.type('i');
assert(input.value === 'hi', 'full line retained');
assert(lineCompletes === 1, 'lineComplete fired once on exact match');

// --- Test 6: backspace on correct char is BLOCKED (1Y) ---
skill.reset();
input.value = '';
engine.setTarget('ab');
input.type('a');
let beforeBS = skill.get().charStats.a?.attempts;
input.backspace();
let afterBS = skill.get().charStats.a?.attempts;
assert(beforeBS === afterBS, 'backspace does not increment attempts');
assert(input.value === 'a', 'backspace BLOCKED on correct char (value retained)');

// --- Test 7: wrong char + backspace + correct char completes line (realistic flow) ---
skill.reset();
keystrokes = []; wrongShifts = []; lineCompletes = 0;
input.value = '';
engine.setTarget('hi');
input.type('X');
assert(input.value === 'X', 'wrong X lands');
assert(lineCompletes === 0, 'line not complete while wrong char present');
const bsMarker = keystrokes.length;
input.backspace();
assert(input.value === '', 'backspace removes wrong char');
assert(keystrokes.length === bsMarker + 1 && keystrokes[bsMarker]?.isDelete === true,
  'backspace emits onKeystroke{isDelete:true} (triggers repaint)');
input.type('h');
input.type('i');
assert(input.value === 'hi', 'correct sequence fully landed');
assert(lineCompletes === 1, 'line completes after clean retype');

// --- Test 9 (1Y): backspace blocked mid-sequence when last char was correct ---
skill.reset();
keystrokes = [];
input.value = '';
engine.setTarget('hello');
input.type('h'); input.type('e'); input.type('l');
const bs9Before = input.value;
input.backspace();
assert(input.value === bs9Before, `backspace blocked after 'hel' (got '${input.value}')`);
// Mistype next char, then backspace should work on the wrong one.
input.type('X');
assert(input.value === 'helX', 'wrong X lands');
input.backspace();
assert(input.value === 'hel', 'backspace deletes wrong X');
// Backspace after cleanup should again be blocked on the correct 'l'.
input.backspace();
assert(input.value === 'hel', 'backspace blocked again on correct l');

// --- Test 8: detach removes listeners ---
engine.detach();
keystrokes = [];
input.type('z');
assert(keystrokes.length === 0, 'detach removes listeners');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
