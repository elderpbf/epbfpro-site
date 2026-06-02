// Shared zero-dependency DOM / timer / listener harness for the Questions live
// host behavioral tests (question-element + the live-host unmount blocker). This
// repo carries no jsdom, so we hand-roll just enough of the platform to mount a
// custom element, drive its poll loop, and PROVE that unmount detaches every
// timer and document listener it created. Named without the `.test` suffix so
// the `node --test tests/*.test.mjs` glob does not run it as a test file.
//
// install() swaps the relevant globals for tracked stubs and returns handles to
// inspect live timers + document listeners; restore() puts the real globals back
// (call it in a finally so the test runner keeps its real timers afterwards).

class FakeClassList {
  constructor() { this._s = new Set(); }
  add(...c) { c.forEach((x) => x && this._s.add(x)); }
  remove(...c) { c.forEach((x) => this._s.delete(x)); }
  toggle(c, on) {
    const want = on === undefined ? !this._s.has(c) : !!on;
    if (want) this._s.add(c); else this._s.delete(c);
    return want;
  }
  contains(c) { return this._s.has(c); }
}

// Minimal element. innerHTML setter clears children (the element rebuilds via
// createElement + appendChild for the live paths we exercise). querySelector
// returns null, which is fine: the code paths under test wire listeners onto
// elements they hold by reference (closures), never re-query the subtree.
export class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.style = {};
    this._attrs = {};
    this._listeners = [];
    this._html = '';
    this.hidden = false;
    this.isConnected = false;
    this.parentNode = null;
    this.textContent = '';
  }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  addEventListener(t, f, o) { this._listeners.push({ t, f, o }); }
  removeEventListener(t, f) {
    const i = this._listeners.findIndex((L) => L.t === t && L.f === f);
    if (i >= 0) this._listeners.splice(i, 1);
  }
  dispatchEvent() { return true; }
}

// The element's class declaration evaluates `extends HTMLElement` ONCE, at first
// import, and captures whatever HTMLElement is then. Since this harness is
// statically imported by every behavioral test before any dynamic import of the
// element, seeding it here (at module load) guarantees a stable superclass even
// for tests that import the element without calling install() first. install()
// deliberately does NOT manage HTMLElement, so restore() can never unseat it.
if (!globalThis.HTMLElement) globalThis.HTMLElement = FakeElement;

export function install() {
  const real = {
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    customElements: globalThis.customElements,
    CustomEvent: globalThis.CustomEvent,
    document: globalThis.document,
    callWorker: globalThis.callWorker,
    WORKER_URL: globalThis.WORKER_URL,
  };

  // Tracked, NON-firing timers: we drive the poll loop by hand, so the stubs
  // only record liveness. A live id in the set after unmount = a leak.
  const intervals = new Set();
  const timeouts = new Set();
  let nextId = 1;
  globalThis.setInterval = () => { const id = nextId++; intervals.add(id); return id; };
  globalThis.clearInterval = (id) => { intervals.delete(id); };
  globalThis.setTimeout = () => { const id = nextId++; timeouts.add(id); return id; };
  globalThis.clearTimeout = (id) => { timeouts.delete(id); };

  globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };

  const registry = new Map();
  globalThis.customElements = {
    define(name, ctor) { registry.set(name, ctor); },
    get(name) { return registry.get(name); },
  };

  const docListeners = [];
  globalThis.document = {
    visibilityState: 'visible',
    createElement: (tag) => new FakeElement(tag),
    addEventListener(t, f, o) { docListeners.push({ t, f, o }); },
    removeEventListener(t, f) {
      const i = docListeners.findIndex((L) => L.t === t && L.f === f);
      if (i >= 0) docListeners.splice(i, 1);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  globalThis.WORKER_URL = '';

  return {
    FakeElement,
    intervals,
    timeouts,
    docListeners,
    liveTimers: () => intervals.size + timeouts.size,
    docListenerCount: (type) => (type ? docListeners.filter((L) => L.t === type).length : docListeners.length),
    el: (tag) => new FakeElement(tag),
    // Controls what get_session_state (and any action) returns to the element.
    setWorker(fn) { globalThis.callWorker = fn; },
    setVisibility(v) { globalThis.document.visibilityState = v; },
    restore() {
      for (const k of Object.keys(real)) {
        if (real[k] === undefined) delete globalThis[k];
        else globalThis[k] = real[k];
      }
    },
  };
}

// Build a get_session_state-style responder from a plain state object, honoring
// the {action} the facade injects. Anything but get_session_state resolves to
// an empty ok payload so incidental calls never throw.
export function workerFrom(state) {
  return async (params) => {
    if (params && params.action === 'get_session_state') return state;
    return { ok: true };
  };
}
