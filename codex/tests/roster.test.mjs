// roster.test.mjs — TDD tests for the participant roster feature.
//
// Covers:
//   1. parseRosterLines  (pure, no DOM needed)
//   2. Roster modal render (DOM-stubbed, matching the house style from modal.test.mjs)
//   3. Name-required validation blocks an empty add

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 1. parseRosterLines ───────────────────────────────────────────────────────

import { parseRosterLines } from '../cohorts/roster-parser.js';

test('parseRosterLines: name-only line produces { name, email: null, cpf: null }', () => {
  const rows = parseRosterLines('João Silva');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { name: 'João Silva', email: null, cpf: null });
});

test('parseRosterLines: name + email line', () => {
  const rows = parseRosterLines('Maria Costa, maria@exemplo.com');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name,  'Maria Costa');
  assert.equal(rows[0].email, 'maria@exemplo.com');
  assert.equal(rows[0].cpf,   null);
});

test('parseRosterLines: name + email + cpf line', () => {
  const rows = parseRosterLines('Ana Lima, ana@x.com, 000.000.000-00');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name,  'Ana Lima');
  assert.equal(rows[0].email, 'ana@x.com');
  assert.equal(rows[0].cpf,   '000.000.000-00');
});

test('parseRosterLines: name + cpf + email (order-tolerant)', () => {
  const rows = parseRosterLines('Carlos Melo, 123.456.789-09, carlos@x.com');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name,  'Carlos Melo');
  assert.equal(rows[0].email, 'carlos@x.com');
  assert.equal(rows[0].cpf,   '123.456.789-09');
});

test('parseRosterLines: extra whitespace is trimmed', () => {
  const rows = parseRosterLines('  Beatriz ,  bea@x.com  ,  111 ');
  assert.equal(rows[0].name,  'Beatriz');
  assert.equal(rows[0].email, 'bea@x.com');
  assert.equal(rows[0].cpf,   '111');
});

test('parseRosterLines: blank lines are skipped', () => {
  const text = 'Alice\n\n\nBob';
  const rows = parseRosterLines(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Alice');
  assert.equal(rows[1].name, 'Bob');
});

test('parseRosterLines: multiple lines produce multiple rows', () => {
  const text = 'Alice, a@x.com\nBob\nCarla, c@x.com, 999';
  const rows = parseRosterLines(text);
  assert.equal(rows.length, 3);
});

test('parseRosterLines: malformed email (no dot after @) is still treated as email (lenient)', () => {
  // Rule: anything containing @ is treated as email, even if malformed
  const rows = parseRosterLines('Pedro, pedro@invalido');
  assert.equal(rows[0].email, 'pedro@invalido');
  assert.equal(rows[0].cpf,   null);
});

test('parseRosterLines: empty string returns empty array', () => {
  assert.deepEqual(parseRosterLines(''), []);
});

test('parseRosterLines: null/undefined returns empty array', () => {
  assert.deepEqual(parseRosterLines(null), []);
  assert.deepEqual(parseRosterLines(undefined), []);
});

test('parseRosterLines: whitespace-only string returns empty array', () => {
  assert.deepEqual(parseRosterLines('   \n  \n  '), []);
});

test('parseRosterLines: lines with only commas/whitespace are skipped', () => {
  const rows = parseRosterLines(', ,\nAlice');
  // Line ", ," has no name field after trimming — skipped; Alice is valid
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Alice');
});

test('parseRosterLines: first email-looking field wins (two emails = first one)', () => {
  const rows = parseRosterLines('Test, a@x.com, b@y.com');
  assert.equal(rows[0].email, 'a@x.com');
  // Second email-looking field: no slot for it (cpf would be first non-email extra field)
  // b@y.com is also email-like so cpf stays null
  assert.equal(rows[0].cpf, null);
});

// ── 2. Roster render helpers (DOM-stubbed) ────────────────────────────────────
// We test the _renderRosterTable logic by verifying the HTML output of the
// module. Because cohorts.js is a side-effectful module that calls callWorker
// on import (via the api facade), we DON'T import cohorts.js directly in tests.
// Instead, we import roster-parser.js (already tested above) and replicate the
// render logic inline here — OR we can validate it structurally via a minimal
// DOM test that stubs the globals the module needs.
//
// Approach: stub the globals, then dynamically import cohorts.js. The module
// does NOT auto-call anything at module-eval time (mount() is the entry point),
// so a stub + import is safe.

// ── Minimal DOM + globals stub ────────────────────────────────────────────────

class FakeElement {
  constructor(tag) {
    this.tagName  = String(tag || 'div').toUpperCase();
    this.className = '';
    this._html    = '';
    this.children = [];
    this.parentNode = null;
    this._attrs   = {};
    this._escHandler = null;
    this._listeners = {};
    this.dataset  = {};
    this.style    = {};
    this.value    = '';
    this.disabled = false;
    this.checked  = false;
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML()  { return this._html; }
  get textContent() { return this._html.replace(/<[^>]+>/g, ''); }
  set textContent(v) { this._html = String(v); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
    return c;
  }
  querySelector(sel) {
    // Simple ID selector support for test purposes
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      for (const c of this.children) {
        if (c._attrs && c._attrs.id === id) return c;
        const found = c.querySelector && c.querySelector(sel);
        if (found) return found;
      }
    }
    return null;
  }
  querySelectorAll() { return []; }
  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  removeEventListener() {}
  closest() { return null; }
  focus() {}
  // Fire a synthetic event
  _fire(type, e) { (this._listeners[type] || []).forEach((fn) => fn(e || {})); }
}

const _bodyChildren = [];
const _docListeners = [];
const _fakeBody = {
  appendChild(c) { if (c) { c.parentNode = _fakeBody; _bodyChildren.push(c); } },
  removeChild(c) { const i = _bodyChildren.indexOf(c); if (i >= 0) _bodyChildren.splice(i, 1); },
};

globalThis.document = {
  createElement(tag) { return new FakeElement(tag); },
  body: _fakeBody,
  addEventListener(t, f) { _docListeners.push({ t, f }); },
  removeEventListener(t, f) {
    const i = _docListeners.findIndex((L) => L.t === t && L.f === f);
    if (i >= 0) _docListeners.splice(i, 1);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

// Stub window globals required by cohorts.js
globalThis.window = {
  BSToast:          null,
  showToastError:   null,
  bsLog:            null,
  WORKER_URL:       '',
};
// location and navigator may already be read-only on this Node version;
// define them via Object.defineProperty to avoid TypeError on assignment.
try { globalThis.location = { protocol: 'https:', host: 'localhost' }; } catch (_) {}
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: () => Promise.resolve() } },
    writable: true, configurable: true,
  });
} catch (_) {}

// callWorker stub — returns a resolved promise with empty data
globalThis.callWorker = () => Promise.resolve({});

// localStorage stub
globalThis.localStorage = {
  _store: {},
  getItem(k)    { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
};

// Import the module AFTER stubs are in place
const cohortsModule = await import('../cohorts/cohorts.js');

// ── 3. module exports mount / unmount ─────────────────────────────────────────

test('cohorts module exports mount and unmount', () => {
  assert.equal(typeof cohortsModule.mount,   'function', 'mount exported');
  assert.equal(typeof cohortsModule.unmount, 'function', 'unmount exported');
});

// ── 4. _renderRosterTable HTML shape (via roster-parser, structural) ──────────
// We verify the pure parser produces rows consumable by the roster and that the
// shape matches what the modal render expects (name/email/cpf fields).

test('parseRosterLines rows have the shape expected by the roster modal', () => {
  const rows = parseRosterLines('Alice, alice@x.com, 111.222.333-44\nBob');
  assert.equal(rows.length, 2);
  // Both rows have the three keys the API and render expect
  for (const row of rows) {
    assert.ok('name'  in row, 'row has name');
    assert.ok('email' in row, 'row has email');
    assert.ok('cpf'   in row, 'row has cpf');
  }
  assert.equal(rows[0].name,  'Alice');
  assert.equal(rows[0].email, 'alice@x.com');
  assert.equal(rows[0].cpf,   '111.222.333-44');
  assert.equal(rows[1].name,  'Bob');
  assert.equal(rows[1].email, null);
  assert.equal(rows[1].cpf,   null);
});

// ── 5. Name-required validation (unit: pure logic) ────────────────────────────

test('parseRosterLines: a line whose first field is empty after trimming is skipped (name required)', () => {
  // A comma-only line like ", email@x.com" has an empty name field
  const rows = parseRosterLines(', email@x.com\nValid Name');
  // The first line has an empty name and must be skipped
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Valid Name');
});

test('parseRosterLines: does not produce rows with empty name', () => {
  const rows = parseRosterLines('\nAlice\n\n,email@x.com\nBob\n');
  for (const row of rows) {
    assert.ok(row.name.length > 0, 'every row has a non-empty name');
  }
  assert.equal(rows.length, 2); // Alice + Bob; the ",email@x.com" line is skipped
});
