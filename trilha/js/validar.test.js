'use strict';

// Acceptance tests for the certificate-validation page (validar.js).
// Mirrors the trilha.test.js harness style: Node vm sandbox, stubbed callWorker.
//
// Run: node trilha/js/validar.test.js

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const JS_DIR = __dirname;

// ── Minimal DOM mock ──────────────────────────────────────────────────────
// Subset of the trilha.test.js makeNode/makeDocument pattern, sized for the
// elements validar.js actually touches.

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
    className: '',
    id: '',
    _listeners: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        if (force === true)  { this._set.add(c); return true; }
        if (force === false) { this._set.delete(c); return false; }
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      },
    },
    _innerHTML: '',
    _textContent: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get textContent() {
      if (this._textContent) return this._textContent;
      return this._innerHTML.replace(/<[^>]*>/g, '');
    },
    set textContent(v) { this._textContent = String(v); this._innerHTML = ''; },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) { delete this.attributes[k]; },
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
    querySelector(sel) {
      // Simple id selector only, sufficient for validar.js
      const idM = sel.match(/^#([\w-]+)$/);
      if (idM) return findById(this, idM[1]);
      return null;
    },
    querySelectorAll() { return []; },
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
  return node;
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const c of (root.children || [])) {
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
}

function makeValidarDoc() {
  // Build a minimal DOM that mirrors the element IDs validar.js touches.
  const body = makeNode('body');
  const doc  = {
    body,
    _nodes: {},
    createElement(tag) { return makeNode(tag); },
    getElementById(id) { return doc._nodes[id] || null; },
    querySelector(sel) {
      const idM = sel && sel.match(/^#([\w-]+)$/);
      if (idM) return doc._nodes[idM[1]] || null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
  };

  function reg(id, tag) {
    const n = makeNode(tag || 'div');
    n.id = id;
    doc._nodes[id] = n;
    body.appendChild(n);
    return n;
  }

  // Root containers
  const loading = reg('vd-loading');
  loading.hidden = true;

  const entryEl  = reg('vd-entry');
  entryEl.hidden = true;
  const form     = makeNode('form');
  form.id        = 'vd-form';
  doc._nodes['vd-form'] = form;
  entryEl.appendChild(form);
  const input    = makeNode('input');
  input.id       = 'vd-code-input';
  input.value    = '';
  doc._nodes['vd-code-input'] = input;
  form.appendChild(input);

  const errorEl  = reg('vd-error');
  errorEl.hidden = true;
  const errorMsg = makeNode('p');
  errorMsg.id    = 'vd-error-msg';
  doc._nodes['vd-error-msg'] = errorMsg;
  errorEl.appendChild(errorMsg);

  const resultEl = reg('vd-result');
  resultEl.hidden = true;

  const badge    = makeNode('div');
  badge.id       = 'vd-status-badge';
  doc._nodes['vd-status-badge'] = badge;
  resultEl.appendChild(badge);

  function field(id) {
    const n = makeNode('span');
    n.id = id;
    doc._nodes[id] = n;
    resultEl.appendChild(n);
    return n;
  }
  field('vd-holder-name');
  field('vd-course-title');
  field('vd-hours');
  field('vd-issued-on');
  field('vd-issuer');

  const pdfWrap = makeNode('div');
  pdfWrap.id    = 'vd-pdf-wrap';
  pdfWrap.hidden = true;
  doc._nodes['vd-pdf-wrap'] = pdfWrap;
  resultEl.appendChild(pdfWrap);

  const pdfLink  = makeNode('a');
  pdfLink.id     = 'vd-pdf-link';
  doc._nodes['vd-pdf-link'] = pdfLink;
  pdfWrap.appendChild(pdfLink);

  return doc;
}

// ── Sandbox loader ────────────────────────────────────────────────────────

function loadValidar({ urlParams, workerData } = {}) {
  const doc = makeValidarDoc();

  let workerCalls  = 0;
  const workerArgs = [];
  const callWorker = async (args) => {
    workerCalls++;
    workerArgs.push(args);
    if (typeof workerData === 'function') return workerData(workerCalls, args);
    if (workerData instanceof Error)      throw workerData;
    return workerData != null ? workerData : { ok: true };
  };

  const search = '?' + (urlParams || '');
  const ctx = {
    document: doc,
    console,
    URLSearchParams,
    callWorker,
    WORKER_URL: 'https://worker.test',
    location: { search, pathname: '/trilha/validar' },
    history: { pushState() {}, replaceState() {} },
    navigator: {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener()    {},
    removeEventListener() {},
    dispatchEvent()       {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  const src = fs.readFileSync(path.join(JS_DIR, 'validar.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'validar.js' });

  return {
    ctx,
    doc,
    workerCallsRef: () => workerCalls,
    workerArgsRef:  () => workerArgs,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// File exists
test('validar.js exists on disk', () => {
  assert.ok(fs.existsSync(path.join(JS_DIR, 'validar.js')), 'validar.js must exist');
});

// window.Validar exposed
test('Validar global exposed after loading', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(typeof ctx.Validar, 'object', 'window.Validar must be an object');
  for (const fn of ['init', 'validate', 'showEntry', 'showLoading', 'showError', 'showResult']) {
    assert.equal(typeof ctx.Validar[fn], 'function', 'Validar.' + fn + ' must be a function');
  }
});

// Helper: _esc
test('Validar._esc escapes &, <, >, "', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(ctx.Validar._esc('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

test('Validar._esc null/undefined returns empty string', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(ctx.Validar._esc(null), '');
  assert.equal(ctx.Validar._esc(undefined), '');
});

// Helper: _fmtDate
test('Validar._fmtDate formats ISO date to d/m/yyyy', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(ctx.Validar._fmtDate('2026-01-07'), '7/1/2026');
  assert.equal(ctx.Validar._fmtDate('2024-11-30'), '30/11/2024');
});

test('Validar._fmtDate falsy returns empty string', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(ctx.Validar._fmtDate(''), '');
  assert.equal(ctx.Validar._fmtDate(null), '');
});

// getCode
test('Validar._getCode reads ?code= from URL', () => {
  const { ctx } = loadValidar({ urlParams: 'code=ABC123XY' });
  assert.equal(ctx.Validar._getCode(), 'ABC123XY');
});

test('Validar._getCode returns empty string when ?code= absent', () => {
  const { ctx } = loadValidar({ urlParams: '' });
  assert.equal(ctx.Validar._getCode(), '');
});

// showEntry
test('showEntry: shows vd-entry, hides others', () => {
  const { ctx, doc } = loadValidar({ urlParams: '' });
  ctx.Validar.showEntry();
  assert.equal(doc.getElementById('vd-entry').hidden,   false, 'vd-entry visible');
  assert.equal(doc.getElementById('vd-loading').hidden, true,  'vd-loading hidden');
  assert.equal(doc.getElementById('vd-error').hidden,   true,  'vd-error hidden');
  assert.equal(doc.getElementById('vd-result').hidden,  true,  'vd-result hidden');
});

// showLoading
test('showLoading: shows vd-loading, hides others', () => {
  const { ctx, doc } = loadValidar({ urlParams: '' });
  ctx.Validar.showLoading();
  assert.equal(doc.getElementById('vd-loading').hidden, false, 'vd-loading visible');
  assert.equal(doc.getElementById('vd-entry').hidden,   true,  'vd-entry hidden');
  assert.equal(doc.getElementById('vd-error').hidden,   true,  'vd-error hidden');
  assert.equal(doc.getElementById('vd-result').hidden,  true,  'vd-result hidden');
});

// showError
test('showError: shows vd-error with supplied message', () => {
  const { ctx, doc } = loadValidar({ urlParams: '' });
  ctx.Validar.showError('Certificado não encontrado.');
  assert.equal(doc.getElementById('vd-error').hidden,  false);
  assert.equal(doc.getElementById('vd-result').hidden, true);
  assert.match(doc.getElementById('vd-error-msg').textContent, /não encontrado/);
});

// ── Valid certificate ──────────────────────────────────────────────────────
const VALID_CERT = {
  ok: true,
  certificate: {
    holder_name:  'Maria da Silva',
    course_title: 'Inteligência Artificial na Prática',
    hours:        20,
    issued_on:    '2026-05-15',
    issuer:       'PensoIA Educação',
    status:       'issued',
    pdf_url:      '/r2/certificates/ABC123XY.pdf',
  },
};

test('valid cert: renders holder_name', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-holder-name').textContent, 'Maria da Silva');
});

test('valid cert: renders course_title', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-course-title').textContent, 'Inteligência Artificial na Prática');
});

test('valid cert: renders hours with h suffix', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-hours').textContent, '20h');
});

test('valid cert: renders issued_on as d/m/yyyy', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-issued-on').textContent, '15/5/2026');
});

test('valid cert: renders issuer', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-issuer').textContent, 'PensoIA Educação');
});

test('valid cert: PDF link present and has correct href', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-pdf-wrap').hidden, false, 'pdf-wrap must be visible');
  assert.equal(doc.getElementById('vd-pdf-link').href, '/r2/certificates/ABC123XY.pdf');
});

test('valid cert: result div is visible, badge is valid', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  assert.equal(doc.getElementById('vd-result').hidden, false);
  const badge = doc.getElementById('vd-status-badge');
  assert.ok(badge.className.includes('vd-badge--valid'), 'badge must have --valid class');
  assert.match(badge.innerHTML, /válido/i);
});

test('valid cert: no email or cpf fields rendered', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=ABC123XY', workerData: VALID_CERT });
  await ctx.Validar.validate('ABC123XY');
  // These IDs must not exist in the doc
  assert.equal(doc.getElementById('vd-email'), null, 'no vd-email element');
  assert.equal(doc.getElementById('vd-cpf'),   null, 'no vd-cpf element');
});

// ── No PDF when pdf_url is null ────────────────────────────────────────────
test('valid cert without pdf_url: pdf-wrap stays hidden', async () => {
  const noPdf = {
    ok: true,
    certificate: { ...VALID_CERT.certificate, pdf_url: null },
  };
  const { ctx, doc } = loadValidar({ urlParams: 'code=NOPDF', workerData: noPdf });
  await ctx.Validar.validate('NOPDF');
  assert.equal(doc.getElementById('vd-pdf-wrap').hidden, true, 'pdf-wrap hidden when no pdf_url');
});

// ── Revoked certificate ───────────────────────────────────────────────────
const REVOKED_CERT = {
  ok: true,
  certificate: {
    holder_name:  'João Alves',
    course_title: 'Curso de Testes',
    hours:        8,
    issued_on:    '2025-11-01',
    issuer:       'PensoIA',
    status:       'revoked',
    pdf_url:      null,
  },
};

test('revoked cert: shows vd-result with --revoked badge', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=REVOKED1', workerData: REVOKED_CERT });
  await ctx.Validar.validate('REVOKED1');
  assert.equal(doc.getElementById('vd-result').hidden, false, 'result visible');
  const badge = doc.getElementById('vd-status-badge');
  assert.ok(badge.className.includes('vd-badge--revoked'), 'badge must be --revoked');
  assert.match(badge.innerHTML, /revogado/i);
});

test('revoked cert: pdf-wrap is hidden even if pdf_url were present', async () => {
  const revokedWithPdf = {
    ok: true,
    certificate: { ...REVOKED_CERT.certificate, pdf_url: '/r2/certificates/X.pdf' },
  };
  const { ctx, doc } = loadValidar({ urlParams: 'code=REVOKED2', workerData: revokedWithPdf });
  await ctx.Validar.validate('REVOKED2');
  assert.equal(doc.getElementById('vd-pdf-wrap').hidden, true, 'pdf hidden for revoked cert');
});

test('revoked cert: error div stays hidden', async () => {
  const { ctx, doc } = loadValidar({ urlParams: 'code=REVOKED1', workerData: REVOKED_CERT });
  await ctx.Validar.validate('REVOKED1');
  assert.equal(doc.getElementById('vd-error').hidden, true);
});

// ── Not-found (ok:false) ──────────────────────────────────────────────────
test('ok:false -> shows error, hides result', async () => {
  const { ctx, doc } = loadValidar({
    urlParams:  'code=UNKNOWN',
    workerData: { ok: false },
  });
  await ctx.Validar.validate('UNKNOWN');
  assert.equal(doc.getElementById('vd-error').hidden,  false, 'error visible');
  assert.equal(doc.getElementById('vd-result').hidden, true,  'result hidden');
  assert.match(doc.getElementById('vd-error-msg').textContent, /não encontrado/i);
});

// ── Network error ──────────────────────────────────────────────────────────
test('network error -> shows friendly error message', async () => {
  const { ctx, doc } = loadValidar({
    urlParams:  'code=NETFAIL',
    workerData: new Error('Network failure'),
  });
  await ctx.Validar.validate('NETFAIL');
  assert.equal(doc.getElementById('vd-error').hidden, false, 'error visible on network failure');
  assert.match(doc.getElementById('vd-error-msg').textContent, /conexão/i);
});

// ── callWorker called with correct action and code ─────────────────────────
test('validate calls callWorker with action cert_validate and code', async () => {
  const { ctx, workerArgsRef } = loadValidar({
    urlParams:  'code=ABC123XY',
    workerData: VALID_CERT,
  });
  await ctx.Validar.validate('ABC123XY');
  const args = workerArgsRef();
  assert.equal(args.length, 1, 'exactly one callWorker call');
  assert.equal(args[0].action, 'cert_validate');
  assert.equal(args[0].code, 'ABC123XY');
});

// ── Bare /validar with no code -> shows entry form ────────────────────────
test('init with no ?code shows entry form, no worker call', async () => {
  const { ctx, doc, workerCallsRef } = loadValidar({ urlParams: '' });
  ctx.Validar.init();
  // showEntry is synchronous; allow any micro-tasks to settle
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(doc.getElementById('vd-entry').hidden,   false, 'entry visible');
  assert.equal(doc.getElementById('vd-loading').hidden, true,  'loading hidden');
  assert.equal(workerCallsRef(), 0, 'no worker call without code');
});

// ── init with ?code triggers validate + worker call ───────────────────────
test('init with ?code= triggers callWorker', async () => {
  const { ctx, workerCallsRef } = loadValidar({
    urlParams:  'code=TESTCODE',
    workerData: VALID_CERT,
  });
  ctx.Validar.init();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(workerCallsRef(), 1, 'one worker call when code present');
});

// ── Runner ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.name);
      passed++;
    } catch (e) {
      console.error('FAIL ' + t.name + '\n  ' + (e && e.stack ? e.stack : e));
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
