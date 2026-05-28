'use strict';

// Acceptance tests for the ClassPulse host page modules. host.html used to
// carry a 1135-line inline IIFE; it now lives in nine window.CPHost.* modules
// (State, Utils, Session, Share, Composer, SQA, History, Layout, Page).
//
// These tests cover the smallest viable surface from the Bundle M SCRATCH:
// module loading + structural assertions, State defaults, pure helpers
// (buildTrilhaUrl, typeTag, stripHtml), applyTypeUI, clearForm, applyHostedUI,
// and Layout load/save round-trip.
//
// Run: node "C:/Users/Elder/Google Drive Streaming/My Drive/Archive/Tech/Dev/PensoIA/Site/backstage/classpulse/host.test.js"

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, 'js');
const HOST_HTML = path.join(__dirname, 'host.html');
function modPath(f) { return path.join(JS_DIR, f); }

// Modules load in this order. Page comes last because it consumes every other
// namespace inside its DOMContentLoaded handler.
const MODULE_FILES = [
  'host-state.js',
  'host-utils.js',
  'host-session.js',
  'host-share.js',
  'host-composer.js',
  'host-sqa.js',
  'host-history.js',
  'host-layout.js',
  'host-page.js',
];

// --- DOM mock helpers (mirrors trilha.test.js shape) ----------------------

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
    disabled: false,
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
    get textContent() { return this._textContent || this._innerHTML.replace(/<[^>]*>/g, ''); },
    set textContent(v) { this._textContent = String(v); this._innerHTML = ''; },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') {
        this.className = String(v);
        this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
      }
      if (k === 'id') this.id = String(v);
    },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; if (k === 'id') this.id = ''; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    appendChild(child) { child.parentNode = this; this.children.push(child); this.childNodes.push(child); return child; },
    insertBefore(child, ref) {
      child.parentNode = this;
      if (!ref) { this.children.push(child); this.childNodes.push(child); return child; }
      const i = this.children.indexOf(ref);
      if (i < 0) { this.children.push(child); this.childNodes.push(child); return child; }
      this.children.splice(i, 0, child);
      this.childNodes.splice(i, 0, child);
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

function parseSel(s) {
  s = String(s).trim();
  const tagM = s.match(/^([a-z][a-z0-9-]*)/i);
  const tag = tagM ? tagM[1].toUpperCase() : null;
  const rest = tagM ? s.slice(tagM[0].length) : s;
  const idM = rest.match(/#([\w-]+)/);
  const id = idM ? idM[1] : null;
  const classes = [];
  const clsRe = /\.([\w-]+)/g;
  let cm;
  while ((cm = clsRe.exec(rest)) !== null) classes.push(cm[1]);
  const attrM = rest.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
  const attr = attrM ? { name: attrM[1], value: attrM[2] } : null;
  return { tag, id, classes, attr };
}

function matches(node, want) {
  if (!node || node.nodeType !== 1) return false;
  if (want.tag && node.tagName !== want.tag) return false;
  if (want.id && node.id !== want.id) return false;
  for (const c of want.classes) {
    if (!node.classList || !node.classList.contains(c)) return false;
  }
  if (want.attr) {
    if (!node.attributes) return false;
    const v = node.attributes[want.attr.name];
    if (v === undefined) return false;
    if (want.attr.value !== undefined && v !== want.attr.value) return false;
  }
  return true;
}

function walkAll(root, fn) {
  if (!root || !root.children) return;
  for (const c of root.children) {
    if (fn(c) === 'stop') return;
    walkAll(c, fn);
  }
}

function querySelectorImpl(root, sel, all) {
  const out = [];
  const want = parseSel(sel);
  let stopped = false;
  walkAll(root, (n) => {
    if (stopped) return 'stop';
    if (matches(n, want)) {
      out.push(n);
      if (!all) { stopped = true; return 'stop'; }
    }
  });
  return all ? out : (out[0] || null);
}

function makeDocument() {
  const docBody = makeNode('body');
  const doc = {
    body: docBody,
    documentElement: makeNode('html'),
    activeElement: null,
    createElement(tag) { return makeNode(tag); },
    createDocumentFragment() { const f = makeNode('frag'); f.nodeType = 11; return f; },
    getElementById(id) {
      let found = null;
      walkAll(docBody, (n) => { if (n.id === id) { found = n; return 'stop'; } });
      return found;
    },
    querySelector(sel) { return querySelectorImpl(docBody, sel, false); },
    querySelectorAll(sel) { return querySelectorImpl(docBody, sel, true) || []; },
    addEventListener() {}, removeEventListener() {},
    visibilityState: 'visible', hidden: false,
  };
  return doc;
}

// Build the subset of host.html DOM that the modules touch at init time.
// Keep it boring on purpose: every element host-*.js reads via getElementById
// or querySelector needs a stub here, or modules crash at IIFE/init time.
function makeHostDoc() {
  const doc = makeDocument();

  const idsToCreate = [
    // session/host bar
    'session-name-display', 'display-link', 'host-live-indicator', 'not-hosted-note',
    'start-host-btn', 'stop-host-btn', 'viewToggles', 'resetLayoutBtn',
    'toggle-bars-btn', 'cpq', 'qa-section', 'qa-badge', 'qa-feed',
    'live-bar-subtabs', 'hostBarMenuBtn', 'hostBarMenuPanel',
    // composer
    'launch-q-card', 'q-text', 'q-type', 'q-opts-mc', 'q-opts-poll',
    'q-opts-rating', 'q-opts-numeric', 'q-opt-a', 'q-opt-b', 'q-opt-c', 'q-opt-d',
    'q-mc-max-select', 'q-poll-max-select', 'q-rating-min', 'q-rating-max',
    'q-num-min', 'q-num-max', 'q-generate-btn', 'q-improve-btn', 'q-error',
    'poll-rows', 'poll-add-btn', 'launch-btn', 'clear-form-btn',
    'chk-show-results', 'chk-reveal-answer',
    // active question / SQA
    'active-q-panel', 'active-standard', 'active-student-qa', 'aq-text', 'aq-tally',
    'close-question-btn', 'sqa-meta', 'sqa-text', 'sqa-response', 'sqa-status', 'sqa-close-btn',
    // history
    'history-card', 'history-list',
    // bank
    'bank-toggle-btn', 'bank-panel', 'bank-set-select', 'bank-q-list',
    // trail/qr
    'trail-btn', 'trail-modal', 'trail-modal-content', 'trail-modal-close-btn',
    'qr-btn',
    // alerts/screens
    'alert-success', 'alert-error',
    // layout
    'hdColLeft', 'hdColCenter', 'hdColRight', 'hdResizerLC', 'hdResizerCR',
  ];

  for (const id of idsToCreate) {
    const el = doc.createElement(id.includes('-input') || id === 'q-text' ? 'input' : 'div');
    el.id = id;
    doc.body.appendChild(el);
  }

  // q-type is a <select>; give it a default value
  const qType = doc.getElementById('q-type');
  qType.value = 'mc';
  qType.tagName = 'SELECT';

  // q-text gets value
  const qText = doc.getElementById('q-text');
  qText.value = '';
  qText.tagName = 'TEXTAREA';

  // checkboxes default
  const chkShow = doc.getElementById('chk-show-results');
  chkShow.checked = true;
  const chkReveal = doc.getElementById('chk-reveal-answer');
  chkReveal.checked = false;

  // layout columns need offsetWidth (used by resize)
  const left = doc.getElementById('hdColLeft');
  left.offsetWidth = 360;
  const right = doc.getElementById('hdColRight');
  right.offsetWidth = 380;

  // poll-add-btn / launch-btn / clear-form-btn dataset placeholders
  // (no-op; mocks accept addEventListener)

  // resize handles need data-resize for startResize()
  const rLC = doc.getElementById('hdResizerLC');
  rLC.classList.add('hd-resizer');
  rLC.dataset.resize = 'left-center';
  const rCR = doc.getElementById('hdResizerCR');
  rCR.classList.add('hd-resizer');
  rCR.dataset.resize = 'center-right';

  // view-toggle buttons (data-toggle-col)
  ['left', 'center', 'right'].forEach((col) => {
    const b = doc.createElement('button');
    b.className = 'view-toggle';
    b.classList.add('view-toggle');
    b.dataset.toggleCol = col;
    doc.getElementById('viewToggles').appendChild(b);
  });

  return doc;
}

// --- Stub external modules the host code reaches for ----------------------

function makeStubs(overrides) {
  const calls = { worker: [], topbarInit: 0, topbarSubTabs: 0 };
  const stubs = {
    BS_AUTH: { TOKEN: 'test-token', guard: () => {} },
    Topbar: {
      init: (opts) => { calls.topbarInit++; },
      renderSubTabsInto: () => { calls.topbarSubTabs++; },
      codexTabs: () => [],
      setTabDot: () => {},
    },
    CPVisibilityToggle: {
      attach: () => ({ reset: () => {}, syncFromQuestion: () => {} }),
    },
    CPQuestionTypes: {
      _types: {
        mc: { canReveal: true, canShowResults: true, aiGenSupported: true, usesTextAnswers: false,
              readForm: () => ({ options: [], correct_answer: null, max_select: 1 }),
              clearForm: () => {}, restoreForm: () => {}, setupForm: () => {} },
        open: { canReveal: false, canShowResults: false, aiGenSupported: false, usesTextAnswers: true,
                readForm: () => ({ options: [], correct_answer: null }),
                clearForm: () => {}, restoreForm: () => {}, setupForm: () => {} },
      },
      get(t) { return this._types[t] || this._types.mc; },
      list() { return Object.keys(this._types); },
      applyVisibility: () => {},
    },
    CPCheckboxSync: {
      reset: ({ chk, supported, defaultChecked }) => {
        if (!chk) return;
        chk.disabled = !supported;
        chk.checked = !!defaultChecked && supported;
      },
      sync: ({ chk, supported }) => {
        if (!chk) return;
        chk.disabled = !supported;
      },
    },
    ClassPulseQA: { attach: () => ({ setSessionCode: () => {}, syncFromState: () => {} }) },
    QuestionBank: { init: () => {}, loadSets: () => {} },
    QRShareModal: { open: () => {} },
    LETTERS: ['A', 'B', 'C', 'D', 'E', 'F'],
    showToast: () => {},
    showToastError: () => {},
    escHtml: (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    stripOptPrefix: (s) => String(s || '').replace(/^[A-F]\)\s*/i, ''),
    callWorker: async (args) => { calls.worker.push(args); return { ok: true, id: 'q1' }; },
  };
  if (overrides) Object.assign(stubs, overrides);
  return { stubs, calls };
}

// Load all CPHost modules into a fresh vm context. By default the test does
// NOT call Page.init() so DOM listener attachment is deferred; tests that
// need wiring call it explicitly.
function loadHost({ urlParams, localStorageInit, stubs: stubOverrides, autoInit } = {}) {
  const doc = makeHostDoc();

  const localStorage = {
    _s: Object.assign({}, localStorageInit || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  const { stubs, calls } = makeStubs(stubOverrides);

  const search = '?' + (urlParams || 'code=ABC123');
  const ctx = {
    document: doc,
    localStorage,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    URLSearchParams,
    location: { search, pathname: '/backstage/classpulse/host.html', hash: '', href: '' },
    history: { pushState() {}, replaceState() {} },
    navigator: { clipboard: null },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    scrollTo() {},
    confirm: () => true,
    innerWidth: 1280, innerHeight: 800,
    ...stubs,
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  for (const f of MODULE_FILES) {
    const p = modPath(f);
    if (!fs.existsSync(p)) throw new Error('module missing: ' + f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }

  if (autoInit) {
    ctx.CPHost.Page.init();
  }

  return { ctx, doc, localStorage, calls };
}

// --- tests ----------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- Structural: file existence ------------------------------------------

test('all 9 module files exist on disk', () => {
  for (const f of MODULE_FILES) {
    assert.equal(fs.existsSync(modPath(f)), true, 'missing ' + f);
  }
});

test('host.html no longer carries a long inline script block', () => {
  const html = fs.readFileSync(HOST_HTML, 'utf8');
  // Find the <script>...</script> blocks with no src attribute (inline).
  // Allow tiny inline (< 200 chars of body) since some pages legitimately ship
  // a one-liner inline boot.
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  let longest = 0;
  while ((m = re.exec(html)) !== null) {
    if (m[1].length > longest) longest = m[1].length;
  }
  assert.ok(longest < 200, 'host.html still has a large inline <script> block (' + longest + ' chars)');
});

test('host.html references each host-*.js via <script src>', () => {
  const html = fs.readFileSync(HOST_HTML, 'utf8');
  for (const f of MODULE_FILES) {
    const re = new RegExp('<script src="[^"]*' + f.replace('.', '\\.') + '[^"]*"');
    assert.match(html, re, 'host.html missing <script src> for ' + f);
  }
});

// --- Module loading: 9 namespaces ----------------------------------------

test('CPHost namespace + 9 sub-namespaces exist after loading all modules', () => {
  const { ctx } = loadHost();
  assert.equal(typeof ctx.CPHost, 'object', 'window.CPHost must exist');
  for (const ns of ['State', 'Utils', 'Session', 'Share', 'Composer', 'SQA', 'History', 'Layout', 'Page']) {
    assert.equal(typeof ctx.CPHost[ns], 'object', 'CPHost.' + ns + ' must be an object');
  }
});

test('IIFEs do not touch DOM at module-load time (no init crash without stubs needed)', () => {
  // Loading the modules without calling Page.init() must not throw, so each
  // IIFE has to stay declarative. (We catch shape regressions where someone
  // re-introduces top-level getElementById / addEventListener calls.)
  let err = null;
  try { loadHost(); } catch (e) { err = e; }
  assert.equal(err, null, err ? ('IIFE-time crash: ' + err.message) : '');
});

// --- State defaults -------------------------------------------------------

test('CPHost.State exposes documented defaults', () => {
  const { ctx } = loadHost();
  const S = ctx.CPHost.State;
  assert.equal(S.sessionCode, null);
  assert.equal(S.activeQId, null);
  assert.equal(S._currentSession, null);
  assert.equal(S._trailTurma, null);
  // Cross-realm arrays/objects fail strict deepEqual prototype checks; compare
  // shape via JSON.
  assert.equal(JSON.stringify(S._trailAllTurmas), '[]');
  assert.equal(JSON.stringify(S._historyMap), '{}');
  assert.equal(S.MAX_POLL_OPTS, 6);
  assert.equal(S.LAYOUT_KEY, 'classpulse_b1_layout');
});

test('CPHost.State.TYPE_LABELS covers the 7 question types', () => {
  const { ctx } = loadHost();
  const labels = ctx.CPHost.State.TYPE_LABELS;
  for (const t of ['mc', 'tf', 'poll', 'open', 'wordcloud', 'rating', 'numeric']) {
    assert.equal(typeof labels[t], 'string', 'missing TYPE_LABELS.' + t);
  }
});

test('CPHost.State.DEFAULT_LAYOUT has left/center/right with width', () => {
  const { ctx } = loadHost();
  const D = ctx.CPHost.State.DEFAULT_LAYOUT;
  assert.equal(D.left.visible, true);
  assert.equal(D.left.width, 360);
  assert.equal(D.right.width, 380);
  assert.equal(D.center.visible, true);
});

test('CPHost.State.init reads ?code= and stamps AUTH_TOKEN from BS_AUTH', () => {
  const { ctx } = loadHost({ urlParams: 'code=ABC123' });
  ctx.CPHost.State.init();
  assert.equal(ctx.CPHost.State.urlCode, 'ABC123');
  assert.equal(ctx.CPHost.State.AUTH_TOKEN, 'test-token');
});

// --- Pure helpers: buildTrilhaUrl ----------------------------------------

test('Share.buildTrilhaUrl returns null when no turma is linked', () => {
  const { ctx } = loadHost();
  ctx.CPHost.State._trailTurma = null;
  assert.equal(ctx.CPHost.Share.buildTrilhaUrl(), null);
});

test('Share.buildTrilhaUrl uses pensoia.com host with client/turma/token', () => {
  const { ctx } = loadHost();
  ctx.CPHost.State._trailTurma = { client_slug: 'acme', turma_slug: 'manha', token: 'tok123' };
  assert.equal(
    ctx.CPHost.Share.buildTrilhaUrl(),
    'https://pensoia.com/trilha/acme/manha?k=tok123'
  );
});

test('Share.buildTrilhaUrl omits ?k= when token is empty', () => {
  const { ctx } = loadHost();
  ctx.CPHost.State._trailTurma = { client_slug: 'acme', turma_slug: 'manha', token: '' };
  assert.equal(
    ctx.CPHost.Share.buildTrilhaUrl(),
    'https://pensoia.com/trilha/acme/manha'
  );
});

// --- Pure helpers: History.typeTag and Utils.stripHtml --------------------

test('History.typeTag returns a span with type label', () => {
  const { ctx } = loadHost();
  const out = ctx.CPHost.History.typeTag('mc');
  assert.match(out, /<span class="hi-type-badge hi-type-mc">MC<\/span>/);
});

test('History.typeTag falls back to the raw type when label unknown', () => {
  const { ctx } = loadHost();
  const out = ctx.CPHost.History.typeTag('weird');
  assert.match(out, />weird</);
});

test('Utils.stripHtml converts <br> to newline and strips other tags', () => {
  const { ctx } = loadHost();
  const out = ctx.CPHost.Utils.stripHtml('Hello<br>world<b>!</b>');
  assert.equal(out, 'Hello\nworld!');
});

test('Utils.stripHtml on falsy returns empty string', () => {
  const { ctx } = loadHost();
  assert.equal(ctx.CPHost.Utils.stripHtml(null), '');
  assert.equal(ctx.CPHost.Utils.stripHtml(''), '');
  assert.equal(ctx.CPHost.Utils.stripHtml(undefined), '');
});

// --- applyTypeUI ----------------------------------------------------------

test('Composer.applyTypeUI hides q-generate-btn when type has no AI gen support', () => {
  const { ctx, doc } = loadHost();
  ctx.CPHost.State.init();
  // 'open' type has aiGenSupported=false in our stub.
  ctx.CPHost.Composer.applyTypeUI('open');
  assert.equal(doc.getElementById('q-generate-btn').style.display, 'none');
  assert.equal(doc.getElementById('q-improve-btn').style.display, 'none');
});

test('Composer.applyTypeUI shows q-generate-btn when type supports AI gen', () => {
  const { ctx, doc } = loadHost();
  ctx.CPHost.State.init();
  // 'mc' supports AI gen in our stub.
  ctx.CPHost.Composer.applyTypeUI('mc');
  assert.notEqual(doc.getElementById('q-generate-btn').style.display, 'none');
});

// --- clearForm ------------------------------------------------------------

test('Composer.clearForm resets q-text and selects q-type=mc', () => {
  const { ctx, doc } = loadHost();
  ctx.CPHost.State.init();
  doc.getElementById('q-text').value = 'lingering';
  doc.getElementById('q-type').value = 'poll';
  ctx.CPHost.Composer.clearForm();
  assert.equal(doc.getElementById('q-text').value, '');
  assert.equal(doc.getElementById('q-type').value, 'mc');
});

// --- applyHostedUI --------------------------------------------------------

test('Share.applyHostedUI(true) sets is-hosted body class and reveals host chrome', () => {
  const { ctx, doc } = loadHost();
  ctx.CPHost.State.init();
  ctx.CPHost.Share.applyHostedUI(true);
  assert.equal(doc.body.classList.contains('is-hosted'), true);
  assert.equal(doc.getElementById('host-live-indicator').hidden, false);
  assert.equal(doc.getElementById('not-hosted-note').hidden, true);
  assert.equal(doc.getElementById('start-host-btn').hidden, true);
  assert.equal(doc.getElementById('stop-host-btn').hidden, false);
});

test('Share.applyHostedUI(false) clears active question state', () => {
  const { ctx, doc } = loadHost();
  ctx.CPHost.State.init();
  ctx.CPHost.State.activeQId = 'q42';
  ctx.CPHost.State.activeQType = 'mc';
  ctx.CPHost.Share.applyHostedUI(false);
  assert.equal(doc.body.classList.contains('is-hosted'), false);
  assert.equal(ctx.CPHost.State.activeQId, null);
  assert.equal(ctx.CPHost.State.activeQType, null);
  assert.equal(doc.getElementById('active-q-panel').style.display, 'none');
});

// --- Layout load/save round-trip -----------------------------------------

test('Layout.loadLayout returns DEFAULT_LAYOUT when nothing in localStorage', () => {
  const { ctx } = loadHost();
  const out = ctx.CPHost.Layout.loadLayout();
  assert.deepEqual(out, ctx.CPHost.State.DEFAULT_LAYOUT);
});

test('Layout.loadLayout repairs missing column entries', () => {
  const { ctx } = loadHost({
    localStorageInit: { classpulse_b1_layout: JSON.stringify({ left: { visible: false, width: 280 } }) },
  });
  const out = ctx.CPHost.Layout.loadLayout();
  assert.equal(out.left.visible, false);
  assert.equal(out.left.width, 280);
  // Missing right/center entries should be re-defaulted, not undefined.
  assert.equal(out.right.visible, true);
  assert.equal(out.center.visible, true);
});

test('Layout.saveLayout writes State.layoutState to localStorage as JSON', () => {
  const { ctx, localStorage } = loadHost();
  ctx.CPHost.State.layoutState = JSON.parse(JSON.stringify(ctx.CPHost.State.DEFAULT_LAYOUT));
  ctx.CPHost.State.layoutState.right.width = 420;
  ctx.CPHost.Layout.saveLayout();
  const raw = localStorage.getItem('classpulse_b1_layout');
  assert.ok(raw, 'classpulse_b1_layout must be persisted');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.right.width, 420);
});

// --- Integration: Page.init boot ------------------------------------------

test('CPHost.Page.init wires Topbar, State, and the rest without crashing', () => {
  const { ctx, calls } = loadHost();
  ctx.CPHost.Page.init();
  assert.ok(calls.topbarInit >= 1, 'Topbar.init must be called by Page.init');
  assert.equal(ctx.CPHost.State.AUTH_TOKEN, 'test-token');
  // Layout should have been applied (layoutState materialized).
  assert.ok(ctx.CPHost.State.layoutState, 'State.layoutState must be set by Page.init -> Layout.init');
});

// --- Runner ---------------------------------------------------------------

let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ' + t.name); passed++; }
    catch (e) { console.error('FAIL ' + t.name + '\n  ' + (e && e.stack ? e.stack : e)); failed++; }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
