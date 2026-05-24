'use strict';

// Acceptance tests for cv-item-picker.js (CVItemPicker window global).
// Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-item-picker.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'cv-item-picker.js');

// ── DOM stub ──────────────────────────────────────────────────────────────

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
    value: '',
    checked: false,
    type: '',
    _textContent: '',
    _innerHTML: '',
    classList: makeClassList(),
    id: '',
    className: '',
    focus() {},
    blur() {},
    closest(sel) {
      // Walk up ancestor chain including self
      let n = this;
      while (n) {
        if (n.nodeType === 1 && matchesSel(n, sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') {
        this.className = String(v);
        this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
      }
      if (k === 'id') this.id = String(v);
      if (k === 'type') this.type = String(v);
      if (k === 'checked') this.checked = (v !== 'false' && v !== false);
      if (k === 'value') this.value = String(v);
      // Support data-* -> dataset
      const dm = k.match(/^data-(.+)$/);
      if (dm) {
        const camel = dm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = String(v);
        this.dataset[dm[1]] = String(v);
      }
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
      if (k === 'id') this.id = '';
      const dm = k.match(/^data-(.+)$/);
      if (dm) {
        const camel = dm[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete this.dataset[camel];
        delete this.dataset[dm[1]];
      }
    },
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
    replaceChildren(...nodes) {
      this.children = [];
      this.childNodes = [];
      nodes.forEach((n) => { if (n && n.nodeType === 1) this.appendChild(n); });
    },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) {
      this._innerHTML = String(v);
      // Parse children from markup (minimal, sufficient for spec assertions)
      this.children = [];
      this.childNodes = [];
      parseHTML(String(v), this);
    },
    get textContent() {
      if (this._textContent) return this._textContent;
      return collectText(this);
    },
    set textContent(v) { this._textContent = String(v); this._innerHTML = String(v); this.children = []; this.childNodes = []; },
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
      list.forEach((fn) => fn.call(this, ev));
      if (ev.bubbles && this.parentNode) this.parentNode.dispatchEvent(ev);
      return true;
    },
    querySelector(sel) { return domQuery(this, sel, false); },
    querySelectorAll(sel) { return domQuery(this, sel, true) || []; },
    cloneNode(deep) {
      const c = makeNode(this.tagName);
      Object.assign(c.attributes, this.attributes);
      Object.assign(c.dataset, this.dataset);
      c.id = this.id;
      c.className = this.className;
      c.classList._set = new Set(this.classList._set);
      c.value = this.value;
      c.checked = this.checked;
      c.type = this.type;
      if (deep) {
        this.children.forEach((ch) => c.appendChild(ch.cloneNode(true)));
      }
      return c;
    },
  };
  return node;
}

function makeClassList() {
  return {
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
  };
}

function collectText(node) {
  // Use _innerHTML (raw HTML) to extract text by stripping tags. This works for
  // nodes that were assigned via innerHTML as well as those with explicit textContent.
  if (node._textContent) return node._textContent;
  const raw = node._innerHTML || '';
  if (raw) return raw.replace(/<[^>]*>/g, '');
  // Fall back to recursing through children
  if (node.children && node.children.length > 0) {
    return node.children.map(collectText).join('');
  }
  return '';
}

// Void HTML elements (self-closing, no children).
const VOID_TAGS = new Set(['input','br','hr','img','link','meta','area','base','col','embed','param','source','track','wbr']);

// Parse attributes string into a key/value map.
function parseAttrs(attrsStr) {
  const out = {};
  const re = /([a-z][a-z0-9-:]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/gi;
  let m;
  while ((m = re.exec(attrsStr)) !== null) {
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[1]));
    out[m[1]] = val;
  }
  return out;
}

// Tokenise HTML into a flat list of tokens: open tags, close tags, text.
function tokenise(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) break;
      const raw = html.slice(i, end + 1);
      if (raw.startsWith('</')) {
        tokens.push({ type: 'close', tag: raw.slice(2, -1).trim().toLowerCase() });
      } else if (raw.startsWith('<!--')) {
        // skip comment
      } else {
        const selfClose = raw.endsWith('/>');
        const inner = selfClose ? raw.slice(1, -2) : raw.slice(1, -1);
        const spIdx = inner.search(/[\s/]/);
        const tag = (spIdx === -1 ? inner : inner.slice(0, spIdx)).toLowerCase();
        const attrsStr = spIdx === -1 ? '' : inner.slice(spIdx);
        tokens.push({ type: 'open', tag, attrsStr, selfClose: selfClose || VOID_TAGS.has(tag) });
      }
      i = end + 1;
    } else {
      const next = html.indexOf('<', i);
      const text = next === -1 ? html.slice(i) : html.slice(i, next);
      if (text.trim()) tokens.push({ type: 'text', text });
      i = next === -1 ? html.length : next;
    }
  }
  return tokens;
}

// Recursively build DOM tree from tokenised HTML. Returns the position after consumption.
function buildTree(tokens, pos, parent) {
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'close') {
      // Let the caller handle closing tags
      break;
    }
    if (tok.type === 'text') {
      // Text node: store as _innerHTML on parent if no children yet
      // (append to existing text)
      pos++;
      continue;
    }
    if (tok.type === 'open') {
      const child = makeNode(tok.tag);
      // Set attributes
      const attrs = parseAttrs(tok.attrsStr || '');
      for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
      parent.appendChild(child);
      pos++;
      if (!tok.selfClose) {
        // Find the range of tokens that belong to this element's content
        const start = pos;
        pos = buildTree(tokens, pos, child);
        // Skip the matching close tag
        if (pos < tokens.length && tokens[pos].type === 'close' && tokens[pos].tag === tok.tag) {
          pos++;
        }
        // Set _innerHTML to the raw HTML content of this element
        // by reconstructing from the tokens (simple: just capture text tokens + nested)
        child._innerHTML = reconstructHTML(tokens, start, pos);
      }
    } else {
      pos++;
    }
  }
  return pos;
}

function reconstructHTML(tokens, start, end) {
  // Reconstruct inner HTML string from tokens for _innerHTML assignment.
  let out = '';
  for (let i = start; i < end; i++) {
    const t = tokens[i];
    if (t.type === 'text') out += t.text;
    else if (t.type === 'open') {
      out += '<' + t.tag + (t.attrsStr ? ' ' + t.attrsStr.trim() : '') + (t.selfClose && !VOID_TAGS.has(t.tag) ? '/' : '') + '>';
    } else if (t.type === 'close') {
      out += '</' + t.tag + '>';
    }
  }
  return out;
}

// Minimal HTML parser for stub DOM creation from innerHTML assignment.
function parseHTML(html, parent) {
  const tokens = tokenise(html);
  buildTree(tokens, 0, parent);
}

// ── Selector matching ─────────────────────────────────────────────────────
// Supports: tag, .class, #id, [attr], [attr="val"], tag.class, compound (space = descendant)
function matchesSel(node, sel) {
  if (!node || node.nodeType !== 1) return false;
  sel = sel.trim();

  // Parse parts of a single simple selector (no spaces)
  function matchSimple(n, s) {
    // [attr] or [attr="val"]
    const attrTests = [];
    s = s.replace(/\[([^\]]+)\]/g, (_, expr) => {
      const eq = expr.indexOf('=');
      if (eq === -1) {
        attrTests.push({ k: expr, v: null });
      } else {
        attrTests.push({ k: expr.slice(0, eq), v: expr.slice(eq + 1).replace(/^["']|["']$/g, '') });
      }
      return '';
    });
    const tagM = s.match(/^([a-z][a-z0-9-]*)/i);
    const idM = s.match(/#([\w-]+)/);
    const clsMatches = [];
    let cs;
    const clsRe = /\.([\w-]+)/g;
    while ((cs = clsRe.exec(s)) !== null) clsMatches.push(cs[1]);

    if (tagM && n.tagName !== tagM[1].toUpperCase()) return false;
    if (idM && n.id !== idM[1]) return false;
    for (const cls of clsMatches) {
      if (!n.classList.contains(cls)) return false;
    }
    for (const at of attrTests) {
      if (at.v === null) {
        if (!n.hasAttribute(at.k)) return false;
      } else {
        if (n.getAttribute(at.k) !== at.v) return false;
      }
    }
    return true;
  }

  // Descendant combinator
  const parts = sel.split(/\s+/);
  if (parts.length === 1) return matchSimple(node, sel);

  // For descendant: last part must match node, walk ancestors for earlier parts
  function matchDescendant(n, pts) {
    if (pts.length === 0) return true;
    const last = pts[pts.length - 1];
    if (!matchSimple(n, last)) return false;
    if (pts.length === 1) return true;
    // remaining parts must be satisfied by some ancestor chain
    const rest = pts.slice(0, -1);
    let anc = n.parentNode;
    while (anc) {
      if (matchDescendant(anc, rest)) return true;
      anc = anc.parentNode;
    }
    return false;
  }
  return matchDescendant(node, parts);
}

function walkAll(node, fn, out, first) {
  if (!node || !node.children) return false;
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (fn(c)) {
      out.push(c);
      if (first) return true;
    }
    if (walkAll(c, fn, out, first) && first) return true;
  }
  return false;
}

function domQuery(root, sel, all) {
  const out = [];
  walkAll(root, (n) => matchesSel(n, sel), out, !all);
  return all ? out : (out[0] || null);
}

// ── Event helpers ─────────────────────────────────────────────────────────
function makeEvent(type, opts) {
  return Object.assign({
    type,
    bubbles: opts && opts.bubbles ? true : false,
    target: null,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {},
  }, opts || {});
}

function click(node) {
  const ev = makeEvent('click', { bubbles: true, target: node, currentTarget: node });
  node.dispatchEvent(ev);
}

function inputEvent(node, value) {
  node.value = value;
  const ev = makeEvent('input', { bubbles: true, target: node, currentTarget: node });
  node.dispatchEvent(ev);
}

// ── document + window factory ─────────────────────────────────────────────
function makeDocument() {
  const body = makeNode('body');
  return {
    body,
    createElement(tag) { return makeNode(tag); },
    createDocumentFragment() { const f = makeNode('frag'); f.nodeType = 11; return f; },
    querySelector(sel) { return domQuery(body, sel, false); },
    querySelectorAll(sel) { return domQuery(body, sel, true); },
    getElementById(id) {
      let found = null;
      walkAll(body, (n) => n.id === id, found = [], false);
      // simpler: use querySelector
      return domQuery(body, '#' + id, false);
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

function loadModule() {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const doc = makeDocument();
  const ctx = { window: {}, document: doc, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cv-item-picker.js' });
  return { ctx, doc };
}

// Cross-realm deepEqual: VM objects are a different realm; use JSON comparison.
function assertDeepEqualJSON(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert.equal(a, e, (msg || 'deepEqual') + '\n  actual:   ' + a + '\n  expected: ' + e);
}

// ── test helpers ──────────────────────────────────────────────────────────
function freshMount(items, selectedIds, onChange) {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const inst = ctx.CVItemPicker.mount(container, {
    items: items || [],
    selectedIds: selectedIds || [],
    onChange: onChange || (() => {}),
  });
  return { ctx, doc, container, inst };
}

// ── tests ─────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVItemPicker is exposed on window with mount function', () => {
  const { ctx } = loadModule();
  assert.ok(ctx.CVItemPicker, 'window.CVItemPicker must be defined');
  assert.equal(typeof ctx.CVItemPicker.mount, 'function', 'mount must be a function');
});

// --- mount returns instance ---

test('mount() returns object with getSelected, setItems, destroy', () => {
  const { inst } = freshMount([]);
  assert.equal(typeof inst.getSelected, 'function', 'getSelected must be a function');
  assert.equal(typeof inst.setItems,    'function', 'setItems must be a function');
  assert.equal(typeof inst.destroy,     'function', 'destroy must be a function');
});

// --- root structure ---

test('mount() renders .cv-item-picker root inside container', () => {
  const { container } = freshMount([{ id: '1', title: 'Item A', type: 'video' }]);
  const root = container.querySelector('.cv-item-picker');
  assert.ok(root, '.cv-item-picker root must exist inside container');
});

test('mount() renders .cv-item-picker-toolbar with search input and count span', () => {
  const { container } = freshMount([{ id: '1', title: 'Item A', type: 'video' }]);
  const toolbar = container.querySelector('.cv-item-picker-toolbar');
  assert.ok(toolbar, '.cv-item-picker-toolbar must exist');
  const search = container.querySelector('.cv-item-picker-search');
  assert.ok(search, '.cv-item-picker-search input must exist');
  const count = container.querySelector('[data-cv-picker-count]');
  assert.ok(count, '[data-cv-picker-count] span must exist');
});

test('mount() renders .cv-item-picker-list with one row per item', () => {
  const items = [
    { id: '1', title: 'Alpha', type: 'video' },
    { id: '2', title: 'Beta', type: 'text' },
  ];
  const { container } = freshMount(items);
  const list = container.querySelector('.cv-item-picker-list');
  assert.ok(list, '.cv-item-picker-list must exist');
  const rows = container.querySelectorAll('.cv-item-picker-row');
  assert.equal(rows.length, 2, 'must render one row per item');
});

test('each row has data-id attribute matching item id', () => {
  const items = [
    { id: 'abc', title: 'Alpha', type: 'video' },
    { id: 'def', title: 'Beta', type: 'text' },
  ];
  const { container } = freshMount(items);
  const rows = container.querySelectorAll('.cv-item-picker-row');
  const ids = rows.map((r) => r.getAttribute('data-id'));
  assert.ok(ids.includes('abc'), 'row for id=abc must exist');
  assert.ok(ids.includes('def'), 'row for id=def must exist');
});

test('each row contains a checkbox, icon element, and title element', () => {
  // Bundle I rebuild v2: per-row type label dropped in favor of a single
  // type-icon glyph; type info now lives in the group header (e.g. "Tarefas
  // (5)") since rows are grouped by type.
  const { container } = freshMount([{ id: '1', title: 'Alpha', type: 'tarefa' }]);
  const row = container.querySelector('.cv-item-picker-row');
  assert.ok(row.querySelector('.cv-item-picker-check'), '.cv-item-picker-check must exist in row');
  assert.ok(row.querySelector('.cv-item-picker-icon'),  '.cv-item-picker-icon must exist in row');
  assert.ok(row.querySelector('.cv-item-picker-title'), '.cv-item-picker-title must exist in row');
});

// --- empty list ---

test('mount() renders .cv-item-picker-empty when items list is empty', () => {
  const { container } = freshMount([]);
  const empty = container.querySelector('.cv-item-picker-empty');
  assert.ok(empty, '.cv-item-picker-empty must exist when items is []');
});

// --- initial selection ---

test('selected rows get is-selected class and checked checkbox', () => {
  const items = [
    { id: '1', title: 'Alpha', type: 'video' },
    { id: '2', title: 'Beta', type: 'text' },
  ];
  const { container } = freshMount(items, ['1']);
  const rows = container.querySelectorAll('.cv-item-picker-row');
  const row1 = rows.find((r) => r.getAttribute('data-id') === '1');
  const row2 = rows.find((r) => r.getAttribute('data-id') === '2');
  assert.ok(row1, 'row1 must exist');
  assert.ok(row2, 'row2 must exist');
  assert.ok(row1.classList.contains('is-selected'), 'row1 must have is-selected');
  const cb1 = row1.querySelector('.cv-item-picker-check');
  assert.ok(cb1 && cb1.checked, 'row1 checkbox must be checked');
  assert.ok(!row2.classList.contains('is-selected'), 'row2 must NOT have is-selected');
});

test('selectedIds are coerced to string (numeric ids treated as strings)', () => {
  const items = [{ id: 10, title: 'Num', type: 'video' }];
  const { container, inst } = freshMount(items, [10]);
  const selected = inst.getSelected();
  assert.ok(selected.every((id) => typeof id === 'string'), 'ids must be strings');
  assert.ok(selected.includes('10'), 'numeric id 10 must appear as string "10"');
});

test('count shows N selecionado(s)', () => {
  const items = [
    { id: '1', title: 'A', type: 'video' },
    { id: '2', title: 'B', type: 'text' },
  ];
  const { container } = freshMount(items, ['1', '2']);
  const count = container.querySelector('[data-cv-picker-count]');
  assert.ok(count, '[data-cv-picker-count] must exist');
  const text = count.textContent || count._textContent || count._innerHTML || '';
  assert.ok(/2/.test(text), 'count text must contain "2"; got: ' + text);
  assert.ok(/selecionado/i.test(text), 'count text must contain "selecionado"; got: ' + text);
});

// --- getSelected ---

test('getSelected() returns initially selected ids as strings', () => {
  const items = [
    { id: '1', title: 'A', type: 'video' },
    { id: '2', title: 'B', type: 'text' },
  ];
  const { inst } = freshMount(items, ['1']);
  const sel = inst.getSelected();
  assertDeepEqualJSON(sel, ['1'], 'getSelected must return ["1"]');
});

test('getSelected() returns [] when nothing is selected', () => {
  const items = [{ id: '1', title: 'A', type: 'video' }];
  const { inst } = freshMount(items, []);
  assert.equal(inst.getSelected().length, 0, 'getSelected must return empty array');
});

// --- toggle via click ---

test('clicking a row toggles selection and fires onChange', () => {
  const items = [
    { id: 'x', title: 'X', type: 'video' },
    { id: 'y', title: 'Y', type: 'text' },
  ];
  const calls = [];
  const { container, inst } = freshMount(items, [], (ids) => calls.push([...ids]));
  const rows = container.querySelectorAll('.cv-item-picker-row');
  const rowX = rows.find((r) => r.getAttribute('data-id') === 'x');
  assert.ok(rowX, 'row x must exist');
  click(rowX);
  assert.ok(calls.length >= 1, 'onChange must fire on click');
  assert.ok(calls[calls.length - 1].includes('x'), 'onChange must include x after clicking');
  assert.ok(inst.getSelected().includes('x'), 'getSelected must include x after click');
});

test('clicking a selected row deselects it and fires onChange', () => {
  const items = [{ id: 'z', title: 'Z', type: 'video' }];
  const calls = [];
  const { container, inst } = freshMount(items, ['z'], (ids) => calls.push([...ids]));
  const rows = container.querySelectorAll('.cv-item-picker-row');
  const rowZ = rows.find((r) => r.getAttribute('data-id') === 'z');
  assert.ok(rowZ, 'row z must exist');
  click(rowZ);
  assert.ok(calls.length >= 1, 'onChange must fire on deselect click');
  const lastCall = calls[calls.length - 1];
  assert.ok(!lastCall.includes('z'), 'z must be removed from selection after second click');
  assert.ok(!inst.getSelected().includes('z'), 'getSelected must not include z after deselect');
});

test('clicking a row updates is-selected class and checkbox.checked', () => {
  const items = [{ id: 'q', title: 'Q', type: 'video' }];
  const { container } = freshMount(items, []);
  const rows = container.querySelectorAll('.cv-item-picker-row');
  const rowQ = rows.find((r) => r.getAttribute('data-id') === 'q');
  // Before click: not selected
  assert.ok(!rowQ.classList.contains('is-selected'), 'should not be selected before click');
  click(rowQ);
  // After click: selected
  assert.ok(rowQ.classList.contains('is-selected'), 'should be selected after click');
  const cb = rowQ.querySelector('.cv-item-picker-check');
  assert.ok(cb && cb.checked, 'checkbox should be checked after click');
});

// --- search ---

test('typing in search filters items by title substring (case-insensitive)', () => {
  const items = [
    { id: '1', title: 'Introduction to Algebra', type: 'video' },
    { id: '2', title: 'Geometry Basics', type: 'text' },
    { id: '3', title: 'Advanced Algebra', type: 'quiz' },
  ];
  const { container } = freshMount(items);
  const search = container.querySelector('.cv-item-picker-search');
  assert.ok(search, 'search input must exist');
  inputEvent(search, 'algebra');
  const rows = container.querySelectorAll('.cv-item-picker-row');
  assert.equal(rows.length, 2, 'filtering "algebra" must show 2 rows; got: ' + rows.length);
});

test('search is case-insensitive', () => {
  const items = [
    { id: '1', title: 'Introduction to ALGEBRA', type: 'video' },
    { id: '2', title: 'Geometry Basics', type: 'text' },
  ];
  const { container } = freshMount(items);
  const search = container.querySelector('.cv-item-picker-search');
  inputEvent(search, 'INTRO');
  const rows = container.querySelectorAll('.cv-item-picker-row');
  assert.equal(rows.length, 1, 'case-insensitive filter must match 1 row; got: ' + rows.length);
});

test('clearing search restores all items', () => {
  const items = [
    { id: '1', title: 'Alpha', type: 'video' },
    { id: '2', title: 'Beta', type: 'text' },
  ];
  const { container } = freshMount(items);
  const search = container.querySelector('.cv-item-picker-search');
  inputEvent(search, 'alpha');
  assert.equal(container.querySelectorAll('.cv-item-picker-row').length, 1);
  inputEvent(search, '');
  assert.equal(container.querySelectorAll('.cv-item-picker-row').length, 2,
    'clearing search must show all items again');
});

// --- setItems ---

test('setItems() replaces the item list and re-renders', () => {
  const { container, inst } = freshMount([
    { id: '1', title: 'Old', type: 'video' },
  ]);
  assert.equal(container.querySelectorAll('.cv-item-picker-row').length, 1);
  inst.setItems([
    { id: '2', title: 'New A', type: 'text' },
    { id: '3', title: 'New B', type: 'quiz' },
  ]);
  assert.equal(container.querySelectorAll('.cv-item-picker-row').length, 2,
    'setItems must render new item count');
});

// --- destroy ---

test('destroy() clears container', () => {
  const { container, inst } = freshMount([
    { id: '1', title: 'A', type: 'video' },
  ]);
  assert.ok(container.children.length > 0, 'container must have children before destroy');
  inst.destroy();
  assert.equal(container.children.length, 0, 'container must be empty after destroy');
});

// --- mount via CSS selector string ---

test('mount() accepts a CSS selector string as container', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  container.id = 'picker-host';
  doc.body.appendChild(container);
  // Mount by selector -- module must use document.querySelector internally
  const inst = ctx.CVItemPicker.mount('#picker-host', {
    items: [{ id: '1', title: 'A', type: 'video' }],
    selectedIds: [],
    onChange: () => {},
  });
  assert.ok(inst && typeof inst.getSelected === 'function',
    'mount via CSS selector must return a valid instance');
  const root = container.querySelector('.cv-item-picker');
  assert.ok(root, '.cv-item-picker must be rendered when mounting via selector');
});

// ── runner ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      console.log('PASS ' + t.name);
      passed++;
    } catch (e) {
      console.error('FAIL ' + t.name + '\n  ' + (e && e.message ? e.message : String(e)));
      failed++;
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
