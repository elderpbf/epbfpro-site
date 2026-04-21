// TypeDrill task 1G -- charset module functional harness.
// Shims localStorage + window + minimal DOM, imports charset.js,
// drives toggle clicks, focus add/remove, subscriber batching.
// Run from typedrill/: node _task1g_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};

globalThis.window = {
  addEventListener: () => {}
};

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this._listeners = {};
    this.textContent = '';
    this.value = '';
    this.className = '';
    this.type = '';
    this.id = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(ev, cb) { (this._listeners[ev] ||= []).push(cb); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  set innerHTML(v) { if (v === '') this.children = []; }
  get innerHTML() { return ''; }
  _fire(ev, e = {}) {
    for (const cb of (this._listeners[ev] || [])) cb(e);
  }
}

function makeToggle(key) {
  const el = new FakeElement('button');
  el.setAttribute('data-charset', key);
  return el;
}

const toggles = {
  letras: makeToggle('letras'),
  numeros: makeToggle('numeros'),
  simbolos: makeToggle('simbolos'),
  pontuacao: makeToggle('pontuacao')
};

const focusInput = new FakeElement('input');
focusInput.id = 'focus-input';
const focusChips = new FakeElement('div');
focusChips.id = 'focus-chips';

globalThis.document = {
  getElementById(id) {
    if (id === 'focus-input') return focusInput;
    if (id === 'focus-chips') return focusChips;
    return null;
  },
  querySelectorAll(sel) {
    if (sel === '.td-toggle[data-charset]') return Object.values(toggles);
    return [];
  },
  createElement(tag) { return new FakeElement(tag); }
};

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const charset = await import('./js/charset.js');
const skill = await import('./js/skill.js');

// --- Test 1: default get() shape ---
let cs = charset.get();
assert(cs.letras === true, 'default letras:true');
assert(cs.numeros === false, 'default numeros:false');
assert(cs.simbolos === true, 'default simbolos:true');
assert(cs.pontuacao === false, 'default pontuacao:false');
assert(Array.isArray(cs.focus) && cs.focus.length === 0, 'default focus: []');

// --- Test 2: init syncs aria-pressed on toggles ---
charset.init();
assert(toggles.letras.getAttribute('aria-pressed') === 'true', 'letras aria-pressed=true after init');
assert(toggles.numeros.getAttribute('aria-pressed') === 'false', 'numeros aria-pressed=false after init');
assert(toggles.simbolos.getAttribute('aria-pressed') === 'true', 'simbolos aria-pressed=true after init');
assert(toggles.pontuacao.getAttribute('aria-pressed') === 'false', 'pontuacao aria-pressed=false after init');

// --- Test 3: click on numeros flips and persists ---
toggles.numeros._fire('click');
cs = charset.get();
assert(cs.numeros === true, 'numeros flipped to true after click');
assert(toggles.numeros.getAttribute('aria-pressed') === 'true', 'numeros aria-pressed synced to true');

skill.flush();
let persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.settings.charset.numeros === true, 'numeros flip persisted to localStorage');

// --- Test 4: addFocus('%') appends chip and persists ---
charset.addFocus('%');
cs = charset.get();
assert(cs.focus.includes('%'), 'addFocus(%) appended to focus array');
assert(focusChips.children.length === 1, 'chip DOM rendered (1 child)');
skill.flush();
persisted = JSON.parse(storage.get('td_skill_v1'));
assert(persisted.settings.charset.focus.includes('%'), 'focus % persisted');

// --- Test 5: duplicate addFocus ignored ---
charset.addFocus('%');
cs = charset.get();
assert(cs.focus.filter(c => c === '%').length === 1, 'duplicate % not added twice');

// --- Test 6: removeFocus cleans up ---
charset.removeFocus('%');
cs = charset.get();
assert(!cs.focus.includes('%'), 'removeFocus removed %');
assert(focusChips.children.length === 0, 'chip DOM cleared');

// --- Test 7: subscribers fire exactly once per microtask batch ---
let fireCount = 0;
const unsubscribe = charset.subscribe(() => fireCount++);
charset.addFocus('a');
charset.addFocus('b');
charset.addFocus('c');
await new Promise(r => queueMicrotask(r));
await new Promise(r => queueMicrotask(r));
assert(fireCount === 1, `subscriber fired exactly once per batch (got ${fireCount})`);
unsubscribe();
charset.removeFocus('a');
charset.removeFocus('b');
charset.removeFocus('c');

// --- Test 8: Backspace on empty focus-input removes last chip ---
charset.addFocus('x');
charset.addFocus('y');
assert(charset.get().focus.length === 2, 'two chips before backspace');
focusInput.value = '';
focusInput._fire('keydown', { key: 'Backspace', preventDefault: () => {} });
cs = charset.get();
assert(cs.focus.length === 1 && cs.focus[0] === 'x', 'backspace on empty input removed last chip (y)');
charset.removeFocus('x');

// --- Test 9: Enter on focus-input adds first char ---
focusInput.value = '%';
focusInput._fire('keydown', { key: 'Enter', preventDefault: () => {} });
cs = charset.get();
assert(cs.focus.includes('%'), 'Enter keydown added % from focus-input');
charset.removeFocus('%');

// --- Test 10: common.generate() works with charset.get() output ---
const { generate } = await import('./js/sources/common.js');
const lines = generate(charset.get(), null, { linesPerBatch: 1, wordsPerLesson: 10 });
assert(Array.isArray(lines) && lines.length > 0 && typeof lines[0] === 'string' && lines[0].length > 0,
       'common.generate returns non-empty lines for default charset');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
