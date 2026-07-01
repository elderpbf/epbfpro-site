// modal.test.mjs — unit tests for js/modal.js (openModal + closeModal).
// Uses a minimal document/body stub matching the approach in _question-harness.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stub ─────────────────────────────────────────────────────────
// We install a global `document` before importing modal.js so the module
// captures the stub. Mirrors the pattern used by the existing harness.

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.className = '';
    this._html = '';
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this._escHandler = null; // modal.js stores handler here
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
    return c;
  }
  // querySelector returns null (no focusable fields in test HTML, so autofocus is a no-op)
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
}

// Install a tracked document stub before importing the module under test.
const docListeners = [];
const bodyChildren = [];
const fakeBody = {
  appendChild(c) { if (c) { c.parentNode = fakeBody; bodyChildren.push(c); } },
  removeChild(c) { const i = bodyChildren.indexOf(c); if (i >= 0) bodyChildren.splice(i, 1); },
  contains(c) { return bodyChildren.includes(c); },
};

const addCalls = [];
const removeCalls = [];

globalThis.document = {
  createElement(tag) { return new FakeElement(tag); },
  body: fakeBody,
  addEventListener(t, f, o) { docListeners.push({ t, f, o }); addCalls.push({ t, f }); },
  removeEventListener(t, f) {
    const i = docListeners.findIndex((L) => L.t === t && L.f === f);
    if (i >= 0) docListeners.splice(i, 1);
    removeCalls.push({ t, f });
  },
  querySelector() { return null; },
  querySelectorAll(sel) {
    if (sel === '.cdx-modal-backdrop') return bodyChildren.filter((c) => c.className === 'cdx-modal-backdrop');
    return [];
  },
};

// Now import the module (it captures our stubbed document at evaluation time).
const { openModal, closeModal } = await import('../js/modal.js');

// Helper: count document keydown listeners live right now.
function liveKeydownCount() {
  return docListeners.filter((L) => L.t === 'keydown').length;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('openModal appends a .cdx-modal-backdrop to document.body', () => {
  const before = bodyChildren.length;
  const bd = openModal('<div class="cdx-modal">Hi</div>');
  assert.equal(bd.className, 'cdx-modal-backdrop', 'returned element has the correct class');
  assert.equal(bodyChildren.length, before + 1, 'one element was appended to body');
  assert.ok(bodyChildren.includes(bd), 'the appended element is the returned backdrop');
  // Clean up for later tests
  closeModal(bd);
});

test('openModal registers an Escape keydown listener on document', () => {
  const before = liveKeydownCount();
  const bd = openModal('<div></div>');
  assert.equal(liveKeydownCount(), before + 1, 'keydown listener was added');
  closeModal(bd);
});

test('closeModal removes the backdrop from document.body', () => {
  const bd = openModal('<div></div>');
  assert.ok(bodyChildren.includes(bd), 'backdrop is in body before close');
  closeModal(bd);
  assert.ok(!bodyChildren.includes(bd), 'backdrop was removed from body after close');
});

test('closeModal removes the Escape listener (no leak)', () => {
  const before = liveKeydownCount();
  const bd = openModal('<div></div>');
  assert.equal(liveKeydownCount(), before + 1, 'listener added after open');
  closeModal(bd);
  assert.equal(liveKeydownCount(), before, 'listener removed after close');
});

test('closing via Escape removes the backdrop and its listener', () => {
  const before = liveKeydownCount();
  const bd = openModal('<div></div>');
  assert.equal(liveKeydownCount(), before + 1, 'listener present while open');
  // Simulate pressing Escape by calling the stored handler directly.
  assert.ok(typeof bd._escHandler === 'function', 'handler stored on backdrop');
  bd._escHandler({ key: 'Escape' });
  assert.ok(!bodyChildren.includes(bd), 'backdrop removed after Escape');
  assert.equal(liveKeydownCount(), before, 'listener removed after Escape');
});

test('non-Escape key does not close the modal', () => {
  const bd = openModal('<div></div>');
  const before = bodyChildren.length;
  bd._escHandler({ key: 'Enter' });
  assert.ok(bodyChildren.includes(bd), 'backdrop still present after non-Escape key');
  closeModal(bd);
});

test('openModal sets backdrop innerHTML to the provided html', () => {
  const html = '<div class="cdx-modal">Test content</div>';
  const bd = openModal(html);
  assert.equal(bd.innerHTML, html, 'innerHTML matches provided html');
  closeModal(bd);
});

test('closeModal is a no-op on an already-removed backdrop (idempotent)', () => {
  const bd = openModal('<div></div>');
  closeModal(bd);
  // Calling again should not throw or double-remove
  assert.doesNotThrow(() => closeModal(bd));
});

test('multiple modals each track their own Escape listener independently', () => {
  const before = liveKeydownCount();
  const bd1 = openModal('<div>1</div>');
  const bd2 = openModal('<div>2</div>');
  assert.equal(liveKeydownCount(), before + 2, 'two listeners for two modals');
  closeModal(bd1);
  assert.equal(liveKeydownCount(), before + 1, 'one listener after first close');
  closeModal(bd2);
  assert.equal(liveKeydownCount(), before, 'zero extra listeners after both closed');
});

test('Escape closes only the topmost modal when several are stacked', () => {
  const bd1 = openModal('<div>1</div>');
  const bd2 = openModal('<div>2</div>');
  // bd1 is not topmost: its Escape handler must be a no-op.
  bd1._escHandler({ key: 'Escape' });
  assert.ok(bodyChildren.includes(bd1), 'lower modal stays open while a modal sits above it');
  assert.ok(bodyChildren.includes(bd2), 'top modal untouched');
  // bd2 is topmost: Escape closes it.
  bd2._escHandler({ key: 'Escape' });
  assert.ok(!bodyChildren.includes(bd2), 'topmost modal closed by Escape');
  assert.ok(bodyChildren.includes(bd1), 'lower modal still open');
  // bd1 is now topmost: Escape closes it.
  bd1._escHandler({ key: 'Escape' });
  assert.ok(!bodyChildren.includes(bd1), 'lower modal closes once it becomes topmost');
});
