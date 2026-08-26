// A DOM stub just wide enough to run the Trail's card builders (sub.js, flat.js) in node and
// read back the HTML they produce. Same approach as _question-harness.mjs and modal.test.mjs:
// install a fake `document`/`window` BEFORE importing the module under test, so the module
// captures the stub.
//
// It exists for ONE job: proving that a refactor of the two card builders changes no output.
// Anything it does not implement, the builders do not use.

class FakeClassList {
  constructor(el) { this.el = el; }
  _list() { return String(this.el.className || '').split(/\s+/).filter(Boolean); }
  add(...c) { const l = this._list(); c.forEach((x) => { if (!l.includes(x)) l.push(x); }); this.el.className = l.join(' '); }
  remove(...c) { this.el.className = this._list().filter((x) => !c.includes(x)).join(' '); }
  contains(c) { return this._list().includes(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.className = '';
    this.dataset = {};
    this._html = '';
    this._attrs = {};
    this.children = [];
    this.parentNode = null;
    this._listeners = {};
    this.classList = new FakeClassList(this);
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }
  insertBefore(c) { return this.appendChild(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  // The builders only query INSIDE the markup they just wrote, and this stub keeps that markup as
  // a string, so a query can only answer "is that class in there". Returning a fresh stub keeps
  // the builder's wiring code running without pretending the node is real.
  querySelector(sel) {
    const cls = String(sel).replace(/^\./, '');
    if (!this._html.includes(cls)) return null;
    const el = new FakeElement('div');
    el.className = cls;
    return el;
  }
  querySelectorAll() { return []; }
  closest() { return null; }
}

export function installFakeDom() {
  const doc = {
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {},
    documentElement: new FakeElement('html'),
    body: new FakeElement('body'),
  };
  globalThis.document = doc;
  globalThis.window = globalThis.window || {};
  globalThis.window.document = doc;
  // The glyph library the cards ask for. Deterministic, so the golden HTML is stable.
  globalThis.window.CdxGlyphs = {
    iconHtml: (key, o) => '<svg data-glyph="' + key + '" data-size="' + ((o && o.size) || '') + '"></svg>',
  };
  // Some trail modules boot at import time and read the URL; give them a stable one.
  const loc = { search: '', pathname: '/trilha/acme/t1', origin: 'https://pensoia.com', href: 'https://pensoia.com/trilha/acme/t1', hash: '' };
  globalThis.location = globalThis.location || loc;
  globalThis.window.location = loc;
  globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
  globalThis.window.matchMedia = globalThis.window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, addListener: () => {} }));
  globalThis.localStorage = globalThis.localStorage || {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  };
  return doc;
}

export { FakeElement };
