'use strict';

// Acceptance tests for the trilha public page modules. The page used to be a
// single 903-line IIFE in trilha.js; it now lives in seven Trilha.* modules
// (State, Utils, Actions, Sub, Aulas, Flat, Page). These tests cover module
// loading + URL parsing, pure helpers, action dispatch, DOM builders, init
// flow, error states, tab routing, and persisted tarefa state.
//
// Run: node trilha/js/trilha.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ── DOM mock helpers ──────────────────────────────────────────────────────
// Extends the pattern used by trilha-nexo.test.js. Supports multi-class
// selectors (.foo.bar), closest(), insertBefore + nextSibling so the sub
// expand/collapse path can be exercised.

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
      // Flat parse: each opening tag becomes a child node with id/class extracted.
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
        const dataM = attrs.matchAll(/\bdata-([\w-]+)="([^"]*)"/g);
        for (const d of dataM) {
          const key = d[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          child.dataset[key] = d[2];
          child.attributes['data-' + d[1]] = d[2];
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
    get nextSibling() {
      if (!this.parentNode) return null;
      const sibs = this.parentNode.children;
      const i = sibs.indexOf(this);
      return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
    },
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
    closest(sel) {
      const want = parseSel(sel);
      let n = this;
      while (n) {
        if (matches(n, want)) return n;
        n = n.parentNode;
      }
      return null;
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
  return { tag, id, classes };
}

function matches(node, want) {
  if (!node || node.nodeType !== 1) return false;
  if (want.tag && node.tagName !== want.tag) return false;
  if (want.id && node.id !== want.id) return false;
  for (const c of want.classes) {
    if (!node.classList || !node.classList.contains(c)) return false;
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
    createElement(tag) { return makeNode(tag); },
    createDocumentFragment() { const f = makeNode('frag'); f.nodeType = 11; return f; },
    getElementById(id) {
      let found = null;
      walkAll(docBody, (n) => { if (n.id === id) { found = n; return 'stop'; } });
      return found;
    },
    querySelector(sel) { return querySelectorImpl(docBody, sel, false); },
    querySelectorAll(sel) { return querySelectorImpl(docBody, sel, true); },
    addEventListener() {}, removeEventListener() {},
    visibilityState: 'visible', hidden: false,
  };
  return doc;
}

function makeTrilhaDoc() {
  const doc = makeDocument();

  // pensoia-header (chrome that stays visible)
  const header = doc.createElement('pensoia-header');
  header.id = 'pensoia-header';
  const phRight = doc.createElement('div');
  phRight.classList.add('ph-right');
  header.appendChild(phRight);
  doc.body.appendChild(header);

  const page = doc.createElement('div');
  page.classList.add('tr-page');

  // tr-loading
  const loading = doc.createElement('div');
  loading.id = 'tr-loading';
  page.appendChild(loading);

  // tr-error
  const errorEl = doc.createElement('div');
  errorEl.id = 'tr-error';
  errorEl.hidden = true;
  const errorMsg = doc.createElement('p');
  errorMsg.classList.add('tr-error-msg');
  errorEl.appendChild(errorMsg);
  page.appendChild(errorEl);

  const main = doc.createElement('main');
  main.id = 'tr-main';
  main.hidden = true;
  page.appendChild(main);

  const hero = doc.createElement('section');
  hero.classList.add('tr-hero');
  main.appendChild(hero);
  const heroName = doc.createElement('h1');
  heroName.id = 'tr-client-name';
  hero.appendChild(heroName);
  const heroTurma = doc.createElement('p');
  heroTurma.id = 'tr-turma-name';
  hero.appendChild(heroTurma);
  const avatar = doc.createElement('div');
  avatar.id = 'tr-client-avatar';
  hero.appendChild(avatar);
  const iconImg = doc.createElement('img');
  iconImg.id = 'tr-client-icon';
  iconImg.hidden = true;
  avatar.appendChild(iconImg);

  // tabs nav
  const tabs = doc.createElement('nav');
  tabs.id = 'tr-tabs';
  tabs.classList.add('tr-tabs');
  ['aulas', 'apostila', 'outros'].forEach((name) => {
    const btn = doc.createElement('button');
    btn.classList.add('tr-tab-btn');
    if (name === 'aulas') btn.classList.add('active');
    btn.dataset.tab = name;
    if (name === 'apostila') btn.id = 'tr-tab-apostila';
    if (name === 'outros') btn.id = 'tr-tab-outros';
    tabs.appendChild(btn);
  });
  main.appendChild(tabs);

  // tab-content + panels
  const content = doc.createElement('div');
  content.classList.add('tr-tab-content');
  ['aulas', 'apostila', 'outros'].forEach((name) => {
    const panel = doc.createElement('div');
    panel.id = 'tr-panel-' + name;
    panel.classList.add('tr-panel');
    if (name !== 'aulas') panel.hidden = true;
    if (name === 'aulas') {
      const backPill = doc.createElement('button');
      backPill.id = 'tr-back-pill';
      panel.appendChild(backPill);
      const timeline = doc.createElement('div');
      timeline.id = 'tr-aulas-timeline';
      timeline.classList.add('tl');
      panel.appendChild(timeline);
    } else if (name === 'apostila') {
      const list = doc.createElement('div');
      list.id = 'tr-apostila-list';
      list.classList.add('card-list');
      panel.appendChild(list);
    } else if (name === 'outros') {
      const filter = doc.createElement('div');
      filter.id = 'tr-outros-filter';
      filter.classList.add('tr-type-filter');
      panel.appendChild(filter);
      const list = doc.createElement('div');
      list.id = 'tr-outros-list';
      list.classList.add('card-list');
      panel.appendChild(list);
    }
    content.appendChild(panel);
  });
  main.appendChild(content);

  doc.body.appendChild(page);
  return doc;
}

// ── Module loader (single sandbox, all 7 scripts) ─────────────────────────
const MODULE_FILES = [
  'trilha-state.js',
  'trilha-utils.js',
  'trilha-actions.js',
  'trilha-sub.js',
  'trilha-aulas.js',
  'trilha-flat.js',
  'trilha-page.js',
];
const JS_DIR = __dirname;
function modPath(f) { return path.join(JS_DIR, f); }

function loadTrilha({ urlParams, pathname, workerData, localStorageInit, sessionStorageInit, mobile, hash, includeAllScripts } = {}) {
  const doc = makeTrilhaDoc();

  const localStorage = {
    _s: Object.assign({}, localStorageInit || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  const sessionStorage = {
    _s: Object.assign({}, sessionStorageInit || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };

  let workerCalls = 0;
  const workerArgs = [];
  const callWorker = async (args) => {
    workerCalls++;
    workerArgs.push(args);
    if (typeof workerData === 'function') return workerData(workerArgs.length, args);
    if (workerData instanceof Error) throw workerData;
    return workerData || { ok: true };
  };

  const search = '?' + (urlParams || '');
  const ctx = {
    document: doc,
    localStorage,
    sessionStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    URLSearchParams,
    callWorker,
    WORKER_URL: 'https://worker.test',
    location: { search, pathname: pathname || '/trilha/', hash: hash || '' },
    history: { pushState() {}, replaceState() {} },
    navigator: { clipboard: null },
    matchMedia: (q) => ({
      matches: !!mobile,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    scrollTo() {},
    // stubs the trilha modules look up via window.*
    BSTypeIcon: null,
    CT_TYPE_FILTER: null,
    CTRenderer: { render: () => {} },
    CTTarefaSubmitModal: { open: () => {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  // Load all module files in order. Missing files throw so the test runner
  // surfaces it as a failure.
  const files = MODULE_FILES;
  for (const f of files) {
    const p = modPath(f);
    if (!fs.existsSync(p)) throw new Error('module missing: ' + f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }

  return { ctx, doc, localStorage, sessionStorage, workerCallsRef: () => workerCalls, workerArgsRef: () => workerArgs };
}

// ── tests ────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Module loading ─────────────────────────────────────────────────────
test('Trilha namespace + 7 sub-namespaces exist after loading all modules', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=acme&t=t1&k=tok' });
  assert.equal(typeof ctx.Trilha, 'object', 'Trilha global must exist');
  for (const ns of ['State', 'Utils', 'Actions', 'Sub', 'Aulas', 'Flat', 'Page']) {
    assert.equal(typeof ctx.Trilha[ns], 'object', 'Trilha.' + ns + ' must be an object');
  }
});

test('monolith trilha.js no longer exists', () => {
  assert.equal(fs.existsSync(modPath('trilha.js')), false, 'trilha.js monolith must be deleted');
});

test('all 7 module files exist on disk', () => {
  for (const f of MODULE_FILES) {
    assert.equal(fs.existsSync(modPath(f)), true, 'missing ' + f);
  }
});

// ── State: URL parsing ─────────────────────────────────────────────────
test('State.init parses c/t/k from query string', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=acme&t=t1&k=tok' });
  ctx.Trilha.State.init();
  assert.equal(ctx.Trilha.State.clientSlug, 'acme');
  assert.equal(ctx.Trilha.State.turmaSlug, 't1');
  assert.equal(ctx.Trilha.State.token, 'tok');
});

test('State.init falls back to path /trilha/<client>/<turma> when query missing c/t', () => {
  const { ctx } = loadTrilha({ urlParams: 'k=tok', pathname: '/trilha/acme/t1' });
  ctx.Trilha.State.init();
  assert.equal(ctx.Trilha.State.clientSlug, 'acme');
  assert.equal(ctx.Trilha.State.turmaSlug, 't1');
  assert.equal(ctx.Trilha.State.token, 'tok');
});

test('State.init persists admin=1 to localStorage', () => {
  const { ctx, localStorage } = loadTrilha({ urlParams: 'c=acme&t=t1&k=tok&admin=1' });
  ctx.Trilha.State.init();
  assert.equal(localStorage.getItem('ct_is_admin'), '1');
  assert.equal(ctx.Trilha.State.isAdmin, true);
});

test('State.init clears admin when ?admin=0', () => {
  const { ctx, localStorage } = loadTrilha({
    urlParams: 'c=acme&t=t1&k=tok&admin=0',
    localStorageInit: { ct_is_admin: '1' },
  });
  ctx.Trilha.State.init();
  assert.equal(localStorage.getItem('ct_is_admin'), null);
  assert.equal(ctx.Trilha.State.isAdmin, false);
});

test('State.isFocusMode reflects mqMobile.matches', () => {
  const a = loadTrilha({ urlParams: 'c=a&t=b&k=c', mobile: true });
  a.ctx.Trilha.State.init();
  assert.equal(a.ctx.Trilha.State.isFocusMode(), true);

  const b = loadTrilha({ urlParams: 'c=a&t=b&k=c', mobile: false });
  b.ctx.Trilha.State.init();
  assert.equal(b.ctx.Trilha.State.isFocusMode(), false);
});

test('State exposes ICONS for copy/external/download/check/send', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  const I = ctx.Trilha.State.ICONS;
  for (const k of ['copy', 'external', 'download', 'check', 'send']) {
    assert.ok(typeof I[k] === 'string' && I[k].includes('<svg'), 'icon ' + k + ' must be an svg string');
  }
});

// ── Utils: pure functions ──────────────────────────────────────────────
test('Utils.esc replaces &, <, >, "', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.esc('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

test('Utils.esc null/undefined return empty string', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.esc(null), '');
  assert.equal(ctx.Trilha.Utils.esc(undefined), '');
});

test('Utils.fmtDate converts ISO yyyy-mm-dd to d/m (strips leading zeros)', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.fmtDate('2026-05-07'), '7/5');
  assert.equal(ctx.Trilha.Utils.fmtDate('2026-11-23'), '23/11');
});

test('Utils.fmtDate falsy returns empty', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.fmtDate(''), '');
  assert.equal(ctx.Trilha.Utils.fmtDate(null), '');
});

test('Utils.aulaStatus: happened_on -> done', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaStatus({ happened_on: '2026-01-01' }), 'done');
});

test('Utils.aulaStatus: scheduled_for in the future -> upcoming', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaStatus({ scheduled_for: '2099-01-01' }), 'upcoming');
});

test('Utils.aulaStatus: scheduled_for in the past -> done', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaStatus({ scheduled_for: '2000-01-01' }), 'done');
});

test('Utils.aulaStatus: no date -> und', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaStatus({}), 'und');
});

test('Utils.aulaDateText: happened_on -> "ocorreu em ..."', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaDateText({ happened_on: '2026-03-15' }), 'ocorreu em 15/3');
});

test('Utils.aulaDateText: rescheduled future emits "remarcada (era X, agora Y)"', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  const text = ctx.Trilha.Utils.aulaDateText({ rescheduled_from: '2026-01-05', scheduled_for: '2099-02-10' });
  assert.match(text, /remarcada/);
  assert.match(text, /5\/1/);
  assert.match(text, /10\/2/);
});

test('Utils.aulaDateText: scheduled_for future -> "agendada para ..."', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaDateText({ scheduled_for: '2099-12-31' }), 'agendada para 31/12');
});

test('Utils.aulaDateText: scheduled_for past -> just the date', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaDateText({ scheduled_for: '2000-04-09' }), '9/4');
});

test('Utils.aulaDateText: no date -> "a definir"', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  assert.equal(ctx.Trilha.Utils.aulaDateText({}), 'a definir');
});

test('Utils.parseTopics accepts array, JSON string, comma-separated, falsy', () => {
  // VM-created arrays have a different Array.prototype than the test realm,
  // so deepStrictEqual fails the prototype check. Compare via JSON to
  // normalize across realms.
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  const U = ctx.Trilha.Utils;
  assert.equal(JSON.stringify(U.parseTopics(['x', 'y'])), '["x","y"]');
  assert.equal(JSON.stringify(U.parseTopics('["alfa","beta"]')), '["alfa","beta"]');
  assert.equal(JSON.stringify(U.parseTopics('a, b , c')), '["a","b","c"]');
  assert.equal(JSON.stringify(U.parseTopics('')), '[]');
  assert.equal(JSON.stringify(U.parseTopics(null)), '[]');
});

test('Utils.tarefaSubmittedKey format includes itemId + turma slug', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=acme&t=t1&k=tok' });
  ctx.Trilha.State.init();
  assert.equal(ctx.Trilha.Utils.tarefaSubmittedKey('item-42'), 'ct_tarefa_submitted_item-42_t1');
});

test('Utils.hasSubmittedTarefa reads localStorage flag', () => {
  const { ctx } = loadTrilha({
    urlParams: 'c=acme&t=t1&k=tok',
    localStorageInit: { 'ct_tarefa_submitted_item-1_t1': '1' },
  });
  ctx.Trilha.State.init();
  assert.equal(ctx.Trilha.Utils.hasSubmittedTarefa('item-1'), true);
  assert.equal(ctx.Trilha.Utils.hasSubmittedTarefa('item-2'), false);
});

test('Utils.showError sets error message and hides loading', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=acme&t=t1&k=tok' });
  ctx.Trilha.State.init();
  ctx.Trilha.Utils.showError('link_invalid');
  assert.equal(doc.getElementById('tr-loading').hidden, true);
  const errEl = doc.getElementById('tr-error');
  assert.equal(errEl.hidden, false);
  assert.match(errEl.querySelector('.tr-error-msg').textContent, /inválido/i);

  ctx.Trilha.Utils.showError('error');
  assert.match(errEl.querySelector('.tr-error-msg').textContent, /carregar/i);
});

// ── Actions: getItemAction dispatch ────────────────────────────────────
test('Actions.getItemAction: tarefa not submitted -> kind=submit', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ id: 'x', type: 'tarefa' });
  assert.equal(a.kind, 'submit');
  assert.equal(a.icon, 'send');
});

test('Actions.getItemAction: tarefa already submitted -> kind=submitted', () => {
  const { ctx } = loadTrilha({
    urlParams: 'c=a&t=b&k=c',
    localStorageInit: { 'ct_tarefa_submitted_x_b': '1' },
  });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ id: 'x', type: 'tarefa' });
  assert.equal(a.kind, 'submitted');
  assert.equal(a.icon, 'check');
});

test('Actions.getItemAction: pdf_url -> open/download', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ type: 'paper', meta_json: { pdf_url: 'https://x.pdf' } });
  assert.equal(a.kind, 'open');
  assert.equal(a.icon, 'download');
  assert.equal(a.url, 'https://x.pdf');
});

test('Actions.getItemAction: attachment_url image -> open/external', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ type: 'material', meta_json: { attachment_url: 'https://x.png' } });
  assert.equal(a.kind, 'open');
  assert.equal(a.icon, 'external');
});

test('Actions.getItemAction: attachment_url non-image -> open/download', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ type: 'material', meta_json: { attachment_url: 'https://x.zip' } });
  assert.equal(a.kind, 'open');
  assert.equal(a.icon, 'download');
});

test('Actions.getItemAction: doc_url -> open/external', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ type: 'model_info', meta_json: { doc_url: 'https://docs' } });
  assert.equal(a.kind, 'open');
  assert.equal(a.icon, 'external');
});

test('Actions.getItemAction: body_md only -> copy', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const a = ctx.Trilha.Actions.getItemAction({ type: 'prompt', body_md: 'Hello' });
  assert.equal(a.kind, 'copy');
  assert.equal(a.text, 'Hello');
});

test('Actions.getItemAction: empty item -> null', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  assert.equal(ctx.Trilha.Actions.getItemAction({ type: 'guide' }), null);
});

test('Actions.getMeta parses string meta_json + accepts object', () => {
  // See parseTopics note: cross-realm objects fail deepStrictEqual prototype
  // check. Normalize via JSON.
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  const A = ctx.Trilha.Actions;
  assert.equal(JSON.stringify(A.getMeta({ meta_json: { x: 1 } })), '{"x":1}');
  assert.equal(JSON.stringify(A.getMeta({ meta_json: '{"y":2}' })), '{"y":2}');
  assert.equal(JSON.stringify(A.getMeta({ meta_json: 'not-json' })), '{}');
  assert.equal(JSON.stringify(A.getMeta({})), '{}');
});

// ── Sub builder ────────────────────────────────────────────────────────
test('Sub.buildSub renders .sub with item id', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const sub = ctx.Trilha.Sub.buildSub({ id: 'i1', title: 'X', type: 'guide' }, {});
  assert.equal(sub.classList.contains('sub'), true);
  assert.equal(sub.dataset.itemId, 'i1');
});

test('Sub.buildSub adds .sub--tarefa when opts.isTarefa', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const sub = ctx.Trilha.Sub.buildSub({ id: 'i1', title: 'X', type: 'tarefa' }, { isTarefa: true });
  assert.equal(sub.classList.contains('sub--tarefa'), true);
});

// ── Aulas builder ──────────────────────────────────────────────────────
test('Aulas.buildAulaRow returns a .tl-row with .card child', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { aulas: [], items: [] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1, title: 'Intro' });
  assert.equal(row.classList.contains('tl-row'), true);
  // Mock dataset stores raw values; real DOM coerces to string. Compare loose.
  assert.equal(String(row.dataset.aula), '1');
  assert.ok(row.querySelector('.card'), '.card child must exist');
});

test('Aulas.buildAulaRow pads single-digit aula_number with leading zero', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 3, title: 'X' });
  assert.match(row.innerHTML, /<span class="zone-num">03<\/span>/);
});

test('Aulas.buildAulaRow shows tarefa pill count 2+ as plural', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = {
    items: [
      { aula_number: 1, type: 'tarefa', id: 'a' },
      { aula_number: 1, type: 'tarefa', id: 'b' },
    ],
  };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1 });
  assert.match(row.innerHTML, /Tarefas \(2\)/);
});

test('Aulas.buildAulaRow shows singular tarefa pill when count is 1', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [{ aula_number: 1, type: 'tarefa', id: 'a' }] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1 });
  assert.match(row.innerHTML, /tarefa-pill[^>]*>[^<]*Tarefa</);
  assert.doesNotMatch(row.innerHTML, /Tarefas/);
});

test('Aulas.buildAulaRow omits tarefa pill when count is 0', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1 });
  assert.doesNotMatch(row.innerHTML, /tarefa-pill/);
});

test('Aulas.buildAulaRow renders topic chips for topics_json array', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1, topics_json: ['alfa', 'beta'] });
  assert.match(row.innerHTML, /topic-chip[^>]*>alfa</);
  assert.match(row.innerHTML, /topic-chip[^>]*>beta</);
});

test('Aulas.renderAulas shows empty state when no aulas', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { aulas: [], items: [] };
  ctx.Trilha.Aulas.renderAulas();
  assert.match(doc.getElementById('tr-aulas-timeline').innerHTML, /Nenhuma aula/);
});

// ── Flat builder ───────────────────────────────────────────────────────
test('Flat.buildFlatCard renders meta-eyebrow when opts.eyebrow set', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const card = ctx.Trilha.Flat.buildFlatCard({ id: 'i', title: 'T', type: 'material' }, { eyebrow: 'Aula 01' });
  assert.match(card.innerHTML, /meta-eyebrow[^>]*>Aula 01</);
});

test('Flat.buildFlatCard adds zone--apostila variant when opts.isApostila', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  const card = ctx.Trilha.Flat.buildFlatCard({ id: 'i', title: 'T', type: 'material' }, { isApostila: true });
  assert.match(card.innerHTML, /class="zone zone--apostila"/);
});

test('Flat.renderApostilaTab empty state when no apostila_set', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [], aulas: [] };
  ctx.Trilha.Flat.renderApostilaTab();
  assert.match(doc.getElementById('tr-apostila-list').innerHTML, /Nenhum conteúdo/);
});

test('Flat.renderOutrosTab empty state when no avulso items', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  ctx.Trilha.Flat.renderOutrosTab();
  assert.match(doc.getElementById('tr-outros-list').innerHTML, /Nenhum material avulso/);
});

// ── Page: init + error flow ────────────────────────────────────────────
test('Page.init shows link_invalid when token missing', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b' }); // no k
  ctx.Trilha.Page.init();
  const errEl = doc.getElementById('tr-error');
  assert.equal(errEl.hidden, false);
  assert.match(errEl.querySelector('.tr-error-msg').textContent, /inválido/i);
});

test('Page.init shows link_invalid when client missing', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'k=tok', pathname: '/trilha/' });
  ctx.Trilha.Page.init();
  const errEl = doc.getElementById('tr-error');
  assert.equal(errEl.hidden, false);
});

test('Page.loadTurma worker error not_found -> link_invalid', async () => {
  const err = new Error('forbidden');
  err.data = { error: 'not_found' };
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', workerData: err });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  const errEl = doc.getElementById('tr-error');
  assert.equal(errEl.hidden, false);
  assert.match(errEl.querySelector('.tr-error-msg').textContent, /inválido/i);
});

test('Page.loadTurma worker error forbidden -> link_invalid', async () => {
  const err = new Error('forbidden');
  err.data = { error: 'forbidden' };
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', workerData: err });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(doc.getElementById('tr-error').querySelector('.tr-error-msg').textContent, /inválido/i);
});

test('Page.loadTurma worker generic error -> "Erro ao carregar"', async () => {
  const err = new Error('boom');
  err.data = { error: 'boom' };
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', workerData: err });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(doc.getElementById('tr-error').querySelector('.tr-error-msg').textContent, /carregar/i);
});

test('Page.loadTurma success reveals main and hides loading', async () => {
  const { ctx, doc } = loadTrilha({
    urlParams: 'c=a&t=b&k=c',
    workerData: { client: { display_name: 'Cliente X' }, turma: { name: 'Turma 1' }, aulas: [], items: [] },
  });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(doc.getElementById('tr-loading').hidden, true);
  assert.equal(doc.getElementById('tr-main').hidden, false);
  assert.equal(doc.getElementById('tr-client-name').textContent, 'Cliente X');
});

// ── Tab routing ────────────────────────────────────────────────────────
test('Page.showTab toggles panel hidden + active tab class', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [], aulas: [] };

  ctx.Trilha.Page.showTab('apostila');
  assert.equal(doc.getElementById('tr-panel-aulas').hidden, true);
  assert.equal(doc.getElementById('tr-panel-apostila').hidden, false);
  assert.equal(doc.getElementById('tr-panel-outros').hidden, true);

  const tabs = doc.querySelectorAll('.tr-tab-btn');
  for (const b of tabs) {
    if (b.dataset.tab === 'apostila') {
      assert.equal(b.classList.contains('active'), true);
      assert.equal(b.getAttribute('aria-selected'), 'true');
    } else {
      assert.equal(b.classList.contains('active'), false);
      assert.equal(b.getAttribute('aria-selected'), 'false');
    }
  }
});

test('Page.onHashChange invalid hash defaults to aulas', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', hash: '#nonsense' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [], aulas: [] };
  ctx.Trilha.Page.onHashChange();
  assert.equal(doc.getElementById('tr-panel-aulas').hidden, false);
});

test('Page.showTab lazy-renders each panel only once', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [], aulas: [] };

  let renderCount = 0;
  const original = ctx.Trilha.Aulas.renderAulas;
  ctx.Trilha.Aulas.renderAulas = function () { renderCount++; return original.apply(this, arguments); };

  ctx.Trilha.Page.showTab('aulas');
  ctx.Trilha.Page.showTab('apostila');
  ctx.Trilha.Page.showTab('aulas');
  assert.equal(renderCount, 1, 'renderAulas should only run once');
});

// ── Focus mode + back-pill ─────────────────────────────────────────────
test('Aulas.closeAulaRow removes .open + .is-open + body', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  const row = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1, title: 'X' });
  doc.body.appendChild(row);
  const card = row.querySelector('.card');
  card.classList.add('open');
  row.classList.add('is-open');
  const body = doc.createElement('div');
  body.classList.add('body');
  card.appendChild(body);

  ctx.Trilha.Aulas.closeAulaRow(row);
  assert.equal(card.classList.contains('open'), false);
  assert.equal(row.classList.contains('is-open'), false);
  assert.equal(card.querySelector('.body'), null);
});

test('Aulas.wireBackPill: clicking it closes all open .tl-row', () => {
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();
  ctx.Trilha.State.data = { items: [] };
  ctx.Trilha.Aulas.wireBackPill();

  const row1 = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 1 });
  const row2 = ctx.Trilha.Aulas.buildAulaRow({ aula_number: 2 });
  doc.getElementById('tr-aulas-timeline').appendChild(row1);
  doc.getElementById('tr-aulas-timeline').appendChild(row2);
  row1.classList.add('is-open');
  row2.classList.add('is-open');
  row1.querySelector('.card').classList.add('open');
  row2.querySelector('.card').classList.add('open');

  doc.getElementById('tr-back-pill').dispatchEvent({ type: 'click' });
  assert.equal(doc.querySelectorAll('.tl-row.is-open').length, 0);
});

// ── Action button injection (tarefa: submitted classes applied) ────────
test('Actions.injectActionButton on submitted tarefa applies item-action--submitted + is-done', () => {
  const { ctx } = loadTrilha({
    urlParams: 'c=a&t=b&k=c',
    localStorageInit: { 'ct_tarefa_submitted_t1_b': '1' },
  });
  ctx.Trilha.State.init();
  const sub = ctx.Trilha.Sub.buildSub({ id: 't1', title: 'Tarefa X', type: 'tarefa' }, { isTarefa: true });
  ctx.Trilha.Actions.injectActionButton(sub, { id: 't1', type: 'tarefa' }, { isTarefa: true });
  const btn = sub.querySelector('.item-action');
  assert.ok(btn, 'button must exist');
  assert.equal(btn.classList.contains('item-action--submitted'), true);
  assert.equal(btn.classList.contains('is-done'), true);
  assert.equal(btn.disabled, true);
});

test('Actions.injectActionButton on copy item is a <button>; on open item is an <a>', () => {
  const { ctx } = loadTrilha({ urlParams: 'c=a&t=b&k=c' });
  ctx.Trilha.State.init();

  const sub1 = ctx.Trilha.Sub.buildSub({ id: 'p', title: 'P', type: 'prompt', body_md: 'x' }, {});
  ctx.Trilha.Actions.injectActionButton(sub1, { id: 'p', type: 'prompt', body_md: 'x' }, {});
  assert.equal(sub1.querySelector('.item-action').tagName, 'BUTTON');

  const sub2 = ctx.Trilha.Sub.buildSub({ id: 'm', title: 'M', type: 'material' }, {});
  ctx.Trilha.Actions.injectActionButton(sub2, { id: 'm', type: 'material', meta_json: { attachment_url: 'https://x.pdf' } }, {});
  const a = sub2.querySelector('.item-action');
  assert.equal(a.tagName, 'A');
  assert.equal(a.getAttribute('target'), '_blank' );
});

// ── Integration: init -> tabs counts ───────────────────────────────────
test('Page.init wires apostila tab visibility based on apostila_set + item count', async () => {
  const data = {
    client: { display_name: 'X' },
    turma: { name: 'T' },
    aulas: [],
    items: [{ id: 's1', set_id: 'set-A', type: 'guide', title: 'Sec 1', set_position: 0 }],
    apostila_set: { id: 'set-A' },
  };
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', workerData: data });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  const apostilaBtn = doc.getElementById('tr-tab-apostila');
  assert.equal(apostilaBtn.hidden, false, 'apostila tab visible when set has items');
});

test('Page.init hides outros tab when no avulso items', async () => {
  const data = {
    client: { display_name: 'X' },
    turma: { name: 'T' },
    aulas: [{ aula_number: 1 }],
    items: [{ id: 'a', aula_number: 1, type: 'guide' }],
  };
  const { ctx, doc } = loadTrilha({ urlParams: 'c=a&t=b&k=c', workerData: data });
  ctx.Trilha.Page.init();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(doc.getElementById('tr-tab-outros').hidden, true);
});

// ── Regression vs trilha-nexo Bundle H expectations ────────────────────
test('source files do not surface session code anywhere ("Perguntas ao vivo" gone)', () => {
  for (const f of MODULE_FILES) {
    const src = fs.readFileSync(modPath(f), 'utf8');
    assert.ok(!/Perguntas ao vivo/.test(src), f + ' must not contain "Perguntas ao vivo" pill');
    assert.ok(!/classpulse_session_id/.test(src), f + ' must not reference classpulse_session_id');
  }
});

// ── Runner ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ' + t.name); passed++; }
    catch (e) { console.error('FAIL ' + t.name + '\n  ' + (e && e.stack ? e.stack : e)); failed++; }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
