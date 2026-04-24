// TypeDrill task 1M -- progress view functional harness.
// Stubs localStorage + a minimal DOM, seeds charStats, asserts render output.
// Run from typedrill/: node _task1m_functional.mjs

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.window = { addEventListener: () => {} };
globalThis.confirm = () => true;

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this._listeners = {};
    this.textContent = '';
    this.className = '';
    this.type = '';
    this.id = '';
    this.hidden = false;
    this.style = {};
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

const body = new FakeElement('body');

function findById(root, id) {
  if (root.id === id) return root;
  for (const c of root.children || []) {
    const r = findById(c, id);
    if (r) return r;
  }
  return null;
}

function findAllByClass(root, cls) {
  const out = [];
  const names = (root.className || '').split(' ');
  if (names.includes(cls)) out.push(root);
  for (const c of root.children || []) {
    out.push(...findAllByClass(c, cls));
  }
  return out;
}

globalThis.document = {
  body,
  getElementById: (id) => findById(body, id),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => new FakeElement(tag),
  addEventListener: () => {}
};

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const progressView = await import('./js/progress-view.js');
const skill = await import('./js/skill.js');

// --- Seed charStats: % (10 attempts, 4 errors, lastWpm 20), a (100/5, 40), b (5/1 -- below threshold) ---
for (let i = 0; i < 6; i++) skill.recordAttempt('%', true, 20);
for (let i = 0; i < 4; i++) skill.recordAttempt('%', false, 20);
for (let i = 0; i < 95; i++) skill.recordAttempt('a', true, 40);
for (let i = 0; i < 5; i++) skill.recordAttempt('a', false, 40);
for (let i = 0; i < 4; i++) skill.recordAttempt('b', true, 30);
skill.recordAttempt('b', false, 30);

const s0 = skill.get();
s0.targetWpm = 35;
skill.set(s0);

// --- init builds drawer DOM under body ---
progressView.init('#progress-btn');
const drawer = findAllByClass(body, 'td-drawer')[0];
assert(drawer != null, 'drawer DOM mounted under body');
assert(drawer.getAttribute('role') === 'dialog', 'drawer has role=dialog');

// --- render populates rows filtered + sorted ---
progressView.render();
const rows = findAllByClass(body, 'td-progress-row');
assert(rows.length === 2, `2 rows rendered (got ${rows.length})`);

const chars = rows.map(r => r.getAttribute('data-char'));
assert(chars[0] === '%', `% is first (weakest), got '${chars[0]}'`);
assert(chars.includes('a'), 'a row present');
assert(!chars.includes('b'), 'b filtered out (<10 attempts)');

// --- Accuracy bar width for % should be 60% ---
const pctFill = findAllByClass(rows[0], 'td-acc-bar-fill')[0];
assert(pctFill != null, 'accuracy bar fill element exists in row 0');
assert(pctFill && pctFill.style.width === '60%',
       `% accuracy bar width = 60% (got ${pctFill && pctFill.style.width})`);

// --- Reset button wipes charStats + re-renders empty ---
const resetBtn = findById(body, 'td-progress-reset');
assert(resetBtn != null, '#td-progress-reset button exists in footer');
resetBtn._fire('click');
const after = skill.get();
assert(Object.keys(after.charStats).length === 0, 'reset cleared charStats');

progressView.render();
const rows2 = findAllByClass(body, 'td-progress-row');
assert(rows2.length === 0, 'render after reset produces 0 rows');
const empty = findAllByClass(body, 'td-drawer-empty');
assert(empty.length === 1, 'empty-state message shown');

// --- open / close toggle hidden attribute on overlay + drawer ---
const overlay = findAllByClass(body, 'td-drawer-overlay')[0];
progressView.open();
assert(overlay.hidden === false, 'overlay visible after open');
assert(drawer.hidden === false, 'drawer visible after open');
progressView.close();
assert(overlay.hidden === true, 'overlay hidden after close');
assert(drawer.hidden === true, 'drawer hidden after close');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
