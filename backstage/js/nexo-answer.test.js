'use strict';

// Bundle H rebuild, acceptance tests for nexo-answer.js (the mountable
// trilha-side answer experience module). Mirror of /go/index.html's answer
// body, exposed as a mount/unmount API so trilha can swap it into its
// content area when an open ClassPulse session is detected.
//
// Run: node backstage/js/nexo-answer.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ── minimal DOM stub ─────────────────────────────────────────────────────
function makeNode(tag) {
  const node = {
    tagName: (tag || 'DIV').toUpperCase(),
    nodeType: 1,
    children: [],
    childNodes: [],
    parentNode: null,
    attributes: {},
    style: {},
    dataset: {},
    _listeners: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        if (force === true) { this._set.add(c); return true; }
        if (force === false) { this._set.delete(c); return false; }
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      },
    },
    _innerHTML: '',
    _textContent: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) {
      this._innerHTML = String(v);
      // very loose parse: just enough to record child element ids/classes/tags
      this.children = [];
      this.childNodes = [];
      const re = /<([a-z][a-z0-9-]*)([^>]*)>/gi;
      let m;
      while ((m = re.exec(this._innerHTML)) !== null) {
        const child = makeNode(m[1]);
        const attrs = m[2] || '';
        const idM = attrs.match(/\bid="([^"]+)"/);
        if (idM) {
          child.id = idM[1];
          child.attributes.id = idM[1];
        }
        const clsM = attrs.match(/\bclass="([^"]+)"/);
        if (clsM) {
          child.className = clsM[1];
          clsM[1].split(/\s+/).forEach((c) => child.classList.add(c));
        }
        child.parentNode = this;
        this.children.push(child);
        this.childNodes.push(child);
      }
    },
    get textContent() {
      if (this._textContent) return this._textContent;
      // derive from innerHTML by stripping tags
      return this._innerHTML.replace(/<[^>]*>/g, '');
    },
    set textContent(v) { this._textContent = String(v); this._innerHTML = ''; },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') {
        this.className = String(v);
        this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
      }
      if (k === 'id') this.id = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) { delete this.attributes[k]; if (k === 'id') this.id = ''; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      this.childNodes.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      this.childNodes = this.childNodes.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    querySelector(sel) { return querySelectorImpl(this, sel, false); },
    querySelectorAll(sel) { return querySelectorImpl(this, sel, true) || []; },
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    },
    dispatchEvent(ev) {
      const list = this._listeners[ev.type] || [];
      list.forEach((fn) => fn(ev));
      return true;
    },
    focus() {},
    blur() {},
  };
  node.id = '';
  node.className = '';
  return node;
}

function querySelectorImpl(root, sel, all) {
  const out = [];
  const want = parseSel(sel);
  walk(root, (n) => {
    if (matches(n, want)) {
      out.push(n);
      return all === false ? true : false;
    }
    return false;
  });
  if (all) return out;
  return out[0] || null;
}

function parseSel(s) {
  s = String(s).trim();
  const m = s.match(/^([a-z][a-z0-9-]*)?(?:#([\w-]+))?(?:\.([\w-]+))?$/i);
  if (!m) return { tag: null, id: null, cls: null, raw: s };
  return { tag: m[1] ? m[1].toUpperCase() : null, id: m[2] || null, cls: m[3] || null, raw: s };
}

function matches(node, want) {
  if (!node || node.nodeType !== 1) return false;
  if (want.tag && node.tagName !== want.tag) return false;
  if (want.id && node.id !== want.id) return false;
  if (want.cls && !(node.classList && node.classList.contains(want.cls))) return false;
  return true;
}

function walk(node, fn) {
  if (!node || !node.children) return false;
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (fn(c)) return true;
    if (walk(c, fn)) return true;
  }
  return false;
}

function makeDocument() {
  const docBody = makeNode('body');
  const doc = {
    body: docBody,
    documentElement: makeNode('html'),
    createElement(tag) { return makeNode(tag); },
    createDocumentFragment() {
      const f = makeNode('frag');
      f.nodeType = 11;
      return f;
    },
    getElementById(id) {
      let found = null;
      walk(docBody, (n) => { if (n.id === id) { found = n; return true; } return false; });
      return found;
    },
    querySelector(sel) { return querySelectorImpl(docBody, sel, false); },
    querySelectorAll(sel) { return querySelectorImpl(docBody, sel, true); },
    addEventListener() {},
    removeEventListener() {},
    visibilityState: 'visible',
    hidden: false,
  };
  return doc;
}

// ── load nexo-answer.js ──────────────────────────────────────────────────
const NEXO_PATH = path.join(__dirname, 'nexo-answer.js');

function loadNexoAnswer() {
  const src = fs.readFileSync(NEXO_PATH, 'utf8');
  const win = {};
  const doc = makeDocument();
  const localStorage = {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  const sessionStorage = Object.assign({}, localStorage, { _s: {} });
  const ctx = {
    window: win,
    document: doc,
    localStorage,
    sessionStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    callWorker: async () => ({}),
    dbg: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'nexo-answer.js' });
  return { ctx, doc };
}

// ── tests ────────────────────────────────────────────────────────────────

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('module exposes NexoAnswer.mount and unmount on window', () => {
  const { ctx } = loadNexoAnswer();
  assert.ok(ctx.NexoAnswer, 'window.NexoAnswer is defined');
  assert.equal(typeof ctx.NexoAnswer.mount, 'function', 'mount() is a function');
  assert.equal(typeof ctx.NexoAnswer.unmount, 'function', 'unmount() is a function');
});

test('mount() builds the answer DOM inside the host with all five states', () => {
  const { ctx, doc } = loadNexoAnswer();
  const host = doc.createElement('div');
  doc.body.appendChild(host);

  ctx.NexoAnswer.mount(host, { sessionCode: 'AB12', studentName: 'TestStudent' });

  // every state container required by /go/index.html must exist
  const ids = ['state-waiting', 'state-cpq', 'state-answered', 'state-closed', 'state-student-qa'];
  ids.forEach((id) => {
    assert.ok(doc.getElementById(id), 'missing state container: ' + id);
  });

  // classpulse-question custom element must be present inside the cpq state
  const cpq = doc.getElementById('cpq');
  assert.ok(cpq, 'cpq element missing');
  assert.equal(cpq.tagName, 'CLASSPULSE-QUESTION', 'cpq should be the classpulse-question custom element');
  assert.equal(cpq.getAttribute('session'), 'AB12', 'session attribute must be wired');
});

test('mount() places the qa-bar at body level (sibling of host) with the editor inside it', () => {
  const { ctx, doc } = loadNexoAnswer();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  ctx.NexoAnswer.mount(host, { sessionCode: 'AB12', studentName: 'X' });

  const qaBar = doc.getElementById('qa-bar');
  assert.ok(qaBar, 'qa-bar must be present');
  // editor textarea + send button must exist (the full Q&A surface)
  assert.ok(doc.getElementById('qa-editor-input'), 'qa-editor-input missing');
  assert.ok(doc.getElementById('qa-editor-send'), 'qa-editor-send missing');
  assert.ok(doc.getElementById('qa-bar-collapsed'), 'qa-bar collapsed pill missing');
});

test('unmount() removes the answer DOM and tears down body classes', () => {
  const { ctx, doc } = loadNexoAnswer();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  ctx.NexoAnswer.mount(host, { sessionCode: 'AB12', studentName: 'X' });

  // simulate qa-bar-on body class (set when qa is enabled)
  doc.body.classList.add('qa-bar-on');

  ctx.NexoAnswer.unmount();

  assert.equal(doc.getElementById('state-waiting'), null, 'state-waiting should be gone');
  assert.equal(doc.getElementById('cpq'), null, 'cpq should be gone');
  assert.equal(doc.getElementById('qa-bar'), null, 'qa-bar should be gone');
  assert.equal(doc.body.classList.contains('qa-bar-on'), false, 'qa-bar-on class must be cleared');
});

test('mount() does NOT render a join-screen (no session code input for trilha students)', () => {
  const { ctx, doc } = loadNexoAnswer();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  ctx.NexoAnswer.mount(host, { sessionCode: 'AB12', studentName: 'X' });

  assert.equal(doc.getElementById('join-screen'), null,
    'no join-screen, student is already authenticated via trilha token');
  assert.equal(doc.getElementById('code-input'), null,
    'no code-input, session code must never be surfaced');
});

test('mount() does NOT surface the session code as visible text anywhere', () => {
  const { ctx, doc } = loadNexoAnswer();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  ctx.NexoAnswer.mount(host, { sessionCode: 'AB12', studentName: 'X' });

  // Walk every text node and the host innerHTML for "AB12"
  function gather(node, bag) {
    if (!node) return;
    if (node.nodeType === 1) {
      const tc = node._textContent || '';
      if (tc) bag.push(tc);
      if (node.children) node.children.forEach((c) => gather(c, bag));
    }
  }
  const bag = [];
  gather(doc.body, bag);
  const joined = bag.join(' ');
  assert.ok(!/AB12/.test(joined),
    'session code AB12 must NOT appear in visible textContent; found in: ' + joined.slice(0, 200));

  // Also verify the host innerHTML doesn't display the code as a literal label
  // (the session attribute on the custom element is fine since it's not user-visible)
  const html = host._innerHTML || '';
  const visibleCodeUses = html.match(/>[^<]*AB12[^<]*</g) || [];
  assert.equal(visibleCodeUses.length, 0,
    'session code must not appear between tags as visible text');
});

// ── runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ' + t.name); passed++; }
    catch (e) { console.error('FAIL ' + t.name + '\n  ' + (e && e.message ? e.message : e)); failed++; }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
