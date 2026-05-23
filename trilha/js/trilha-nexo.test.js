'use strict';

// Bundle H rebuild, acceptance tests for trilha-nexo.js (the orchestrator
// that swaps trilha's content area for the ClassPulse answer experience
// when the turma's session is open).
//
// Run: node trilha/js/trilha-nexo.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reuse the minimal DOM helpers from the sibling test by re-declaring (keep
// each test file self-contained per project convention).
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
    hidden: false,
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
      this.children = [];
      this.childNodes = [];
      const re = /<([a-z][a-z0-9-]*)([^>]*)>/gi;
      let m;
      while ((m = re.exec(this._innerHTML)) !== null) {
        const child = makeNode(m[1]);
        const attrs = m[2] || '';
        const idM = attrs.match(/\bid="([^"]+)"/);
        if (idM) { child.id = idM[1]; child.attributes.id = idM[1]; }
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
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
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
    focus() {}, blur() {},
  };
  node.id = '';
  node.className = '';
  return node;
}

function querySelectorImpl(root, sel, all) {
  const out = [];
  const want = parseSel(sel);
  walk(root, (n) => {
    if (matches(n, want)) { out.push(n); return all === false ? true : false; }
    return false;
  });
  if (all) return out;
  return out[0] || null;
}
function parseSel(s) {
  s = String(s).trim();
  const m = s.match(/^([a-z][a-z0-9-]*)?(?:#([\w-]+))?(?:\.([\w-]+))?$/i);
  if (!m) return { tag: null, id: null, cls: null, raw: s };
  return { tag: m[1] ? m[1].toUpperCase() : null, id: m[2] || null, cls: m[3] || null };
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
    createDocumentFragment() { const f = makeNode('frag'); f.nodeType = 11; return f; },
    getElementById(id) {
      let found = null;
      walk(docBody, (n) => { if (n.id === id) { found = n; return true; } return false; });
      return found;
    },
    querySelector(sel) { return querySelectorImpl(docBody, sel, false); },
    querySelectorAll(sel) { return querySelectorImpl(docBody, sel, true); },
    addEventListener() {}, removeEventListener() {},
    visibilityState: 'visible', hidden: false,
  };
  return doc;
}

// Build a fake trilha page DOM (the relevant scaffold from trilha/index.html)
function makeTrilhaDoc() {
  const doc = makeDocument();

  // pensoia-header (chrome that must stay visible)
  const header = doc.createElement('pensoia-header');
  header.id = 'pensoia-header';
  // simulate the header internals so trilha.js's WhatsApp pill check would pass
  const phRight = doc.createElement('div');
  phRight.classList.add('ph-right');
  const phZoom = doc.createElement('div');
  phZoom.classList.add('ph-zoom');
  phRight.appendChild(phZoom);
  header.appendChild(phRight);
  doc.body.appendChild(header);

  const page = doc.createElement('div');
  page.classList.add('tr-page');

  const main = doc.createElement('main');
  main.id = 'tr-main';
  page.appendChild(main);

  // hero
  const hero = doc.createElement('section');
  hero.classList.add('tr-hero');
  main.appendChild(hero);

  // tabs
  const tabs = doc.createElement('nav');
  tabs.classList.add('tr-tabs');
  tabs.id = 'tr-tabs';
  main.appendChild(tabs);

  // tab-content
  const content = doc.createElement('div');
  content.classList.add('tr-tab-content');
  main.appendChild(content);

  // footer
  const footer = doc.createElement('footer');
  footer.classList.add('tr-footer');
  main.appendChild(footer);

  doc.body.appendChild(page);
  return doc;
}

// ── load trilha-nexo.js into a fresh sandbox per test ────────────────────
const NEXO_PATH = path.join(__dirname, 'trilha-nexo.js');
const TRILHA_PATH = path.join(__dirname, 'trilha.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const GO_INDEX_PATH = path.join(__dirname, '..', '..', 'go', 'index.html');
const ANSWER_MODULE_PATH = path.join(__dirname, '..', '..', 'backstage', 'js', 'nexo-answer.js');

function loadTrilhaNexo({ workerData, location } = {}) {
  const doc = makeTrilhaDoc();
  const localStorage = {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  const sessionStorage = Object.assign({}, localStorage, { _s: {} });
  let calls = 0;
  const ctx = {
    document: doc,
    localStorage,
    sessionStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    location: location || { search: '?c=acme&t=t1&k=tok', pathname: '/trilha/' },
    callWorker: async () => {
      calls++;
      return typeof workerData === 'function' ? workerData(calls) : (workerData || { ok: true, session: null });
    },
    URLSearchParams,
    _callsRef: () => calls,
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  // Inject a NexoAnswer stub if nexo-answer.js does not yet exist; otherwise
  // load the real module (the orchestrator must call it).
  let injectedStub = false;
  if (fs.existsSync(ANSWER_MODULE_PATH)) {
    vm.runInContext(fs.readFileSync(ANSWER_MODULE_PATH, 'utf8'), ctx, { filename: 'nexo-answer.js' });
  } else {
    ctx.NexoAnswer = {
      _mounted: false, _opts: null,
      mount(host, opts) { this._mounted = true; this._opts = opts; this._host = host; },
      unmount() { this._mounted = false; this._opts = null; this._host = null; },
    };
    injectedStub = true;
  }

  // Load trilha-nexo.js
  if (!fs.existsSync(NEXO_PATH)) throw new Error('trilha-nexo.js missing');
  vm.runInContext(fs.readFileSync(NEXO_PATH, 'utf8'), ctx, { filename: 'trilha-nexo.js' });

  return { ctx, doc, injectedStub };
}

// ── tests ────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('trilha-nexo source contains no static reference to nx-pending-pill or nx-overlay', () => {
  const src = fs.readFileSync(NEXO_PATH, 'utf8');
  assert.ok(!/nx-pending-pill/.test(src), 'must not render legacy pending pill');
  assert.ok(!/nx-overlay\b/.test(src), 'must not render legacy fullscreen overlay');
});

test('trilha-nexo invokes NexoAnswer.mount when session is open (regardless of current_question)', async () => {
  const { ctx, doc } = loadTrilhaNexo({
    workerData: { ok: true, session: { code: 'XY99', title: 'Aula 1' }, current_question: null },
  });

  if (typeof ctx.TrilhaNexo !== 'object' || typeof ctx.TrilhaNexo._tickForTest !== 'function') {
    throw new Error('trilha-nexo must expose TrilhaNexo._tickForTest() for tests');
  }
  await ctx.TrilhaNexo._tickForTest();

  assert.equal(ctx.TrilhaNexo._isMountedForTest(), true,
    'orchestrator must report mounted when session.is_open is truthy');
  // The orchestrator creates #nx-answer-host and NexoAnswer fills it with the
  // answer root + qa-bar. Either DOM signal is acceptable evidence of mount.
  assert.ok(doc.getElementById('nx-answer-host'), 'nx-answer-host container must exist');
});

test('trilha-nexo hides hero, tabs, tab-content and footer when mounting', async () => {
  const { ctx, doc } = loadTrilhaNexo({
    workerData: { ok: true, session: { code: 'XY99', title: 'Aula 1' }, current_question: null },
  });
  await ctx.TrilhaNexo._tickForTest();

  function isHidden(el) {
    if (!el) return true; // missing element counts as hidden
    if (el.hidden === true) return true;
    if (el.style && el.style.display === 'none') return true;
    if (el.classList && el.classList.contains('is-hidden-by-nexo')) return true;
    return false;
  }

  assert.ok(isHidden(doc.querySelector('.tr-hero')), 'hero must be hidden');
  assert.ok(isHidden(doc.querySelector('.tr-tabs')), 'tabs must be hidden');
  assert.ok(isHidden(doc.querySelector('.tr-tab-content')), 'tab-content must be hidden');
  assert.ok(isHidden(doc.querySelector('.tr-footer')), 'footer must be hidden');
});

test('trilha-nexo keeps pensoia-header visible when mounting', async () => {
  const { ctx, doc } = loadTrilhaNexo({
    workerData: { ok: true, session: { code: 'XY99', title: 'Aula 1' }, current_question: null },
  });
  await ctx.TrilhaNexo._tickForTest();
  const header = doc.querySelector('pensoia-header');
  assert.ok(header, 'pensoia-header must still exist in the DOM');
  assert.notEqual(header.hidden, true, 'pensoia-header must NOT be hidden');
  assert.notEqual(header.style.display, 'none', 'pensoia-header must NOT have display:none');
});

test('trilha-nexo unmounts and restores hidden elements when session closes', async () => {
  let phase = 'open';
  const { ctx, doc } = loadTrilhaNexo({
    workerData: () => phase === 'open'
      ? { ok: true, session: { code: 'XY99', title: 'Aula 1' }, current_question: null }
      : { ok: true, session: null, current_question: null },
  });
  await ctx.TrilhaNexo._tickForTest();
  assert.equal(ctx.TrilhaNexo._isMountedForTest(), true, 'mounted while open');

  phase = 'closed';
  await ctx.TrilhaNexo._tickForTest();

  assert.equal(ctx.TrilhaNexo._isMountedForTest(), false, 'unmounted when session closes');
  assert.equal(doc.getElementById('nx-answer-host'), null, 'nx-answer-host removed');

  function isHidden(el) {
    if (!el) return false;
    if (el.hidden === true) return true;
    if (el.style && el.style.display === 'none') return true;
    if (el.classList && el.classList.contains('is-hidden-by-nexo')) return true;
    return false;
  }
  assert.equal(isHidden(doc.querySelector('.tr-hero')), false, 'hero restored');
  assert.equal(isHidden(doc.querySelector('.tr-tabs')), false, 'tabs restored');
  assert.equal(isHidden(doc.querySelector('.tr-tab-content')), false, 'tab-content restored');
  assert.equal(isHidden(doc.querySelector('.tr-footer')), false, 'footer restored');
});

test('trilha-nexo does not mount when session is null even if current_question is set', async () => {
  // Defensive: the previous bundle mounted on current_question alone. We must
  // NOT regress to that trigger.
  const { ctx, doc } = loadTrilhaNexo({
    workerData: { ok: true, session: null, current_question: { id: 'q1', text: 'x', options: [] } },
  });
  await ctx.TrilhaNexo._tickForTest();
  assert.equal(ctx.TrilhaNexo._isMountedForTest(), false,
    'must NOT mount on current_question alone; trigger is session.is_open');
  assert.equal(doc.getElementById('nx-answer-host'), null,
    'no answer host should be created');
});

test('go/index.html is still the full answer experience (not collapsed to a shim)', () => {
  const src = fs.readFileSync(GO_INDEX_PATH, 'utf8');
  // Must keep the join-screen, the cpq element, the qa-bar, the working surface.
  assert.ok(/id="join-screen"/.test(src), '/go must keep the join-screen');
  assert.ok(/<classpulse-question/.test(src), '/go must keep the classpulse-question custom element');
  assert.ok(/id="qa-bar"/.test(src), '/go must keep the qa-bar');
  assert.ok(src.length > 20000, '/go must remain the full ~33KB page, not a redirect shim');
});

test('trilha/index.html loads nexo-answer.js and the classpulse deps', () => {
  const src = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assert.ok(/nexo-answer\.js/.test(src), 'trilha must include nexo-answer.js');
  assert.ok(/classpulse-question(\.min)?\.js/.test(src), 'trilha must include classpulse-question.js');
  assert.ok(/question-renderer\.js/.test(src), 'trilha must include question-renderer.js');
  assert.ok(/question-types\.css/.test(src), 'trilha must include question-types.css');
});

test('trilha.js no longer surfaces the session code in the "Perguntas ao vivo" header pill', () => {
  const src = fs.readFileSync(TRILHA_PATH, 'utf8');
  // The injected anchor used "?code=" + classpulse_session_id. After Bundle H
  // the session code must not be surfaced anywhere on the public page.
  assert.ok(!/Perguntas ao vivo/.test(src), 'header pill label must be removed');
  assert.ok(!/classpulse_session_id/.test(src) || !/\?code=/.test(src),
    'session code link must be removed from header injection');
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
