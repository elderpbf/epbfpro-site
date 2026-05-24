'use strict';

// Acceptance tests for cv-presets-ui.js (CVPresetsUI window global).
// Derived from SPEC only. Does NOT read module source.
// Run: node backstage/js/cv-presets-ui.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODULE_PATH = path.join(__dirname, 'cv-presets-ui.js');

// ── DOM stub (shared with picker test, inlined for self-containment) ──────

function makeClassList() {
  return {
    _set: new Set(),
    add(c)    { this._set.add(c); },
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
      if (k === 'id')    this.id = String(v);
      if (k === 'type')  this.type = String(v);
      if (k === 'value') this.value = String(v);
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
      this.children = [];
      this.childNodes = [];
      parseHTML(String(v), this);
    },
    get textContent() {
      if (this._textContent) return this._textContent;
      return collectText(this);
    },
    set textContent(v) {
      this._textContent = String(v);
      this._innerHTML = String(v);
      this.children = [];
      this.childNodes = [];
    },
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
      if (ev.bubbles && this.parentNode && !ev._stopped) this.parentNode.dispatchEvent(ev);
      return true;
    },
    querySelector(sel) { return domQuery(this, sel, false); },
    querySelectorAll(sel) { return domQuery(this, sel, true) || []; },
    cloneNode(deep) {
      const c = makeNode(this.tagName);
      Object.assign(c.attributes, this.attributes);
      Object.assign(c.dataset, this.dataset);
      c.id = this.id; c.className = this.className;
      c.classList._set = new Set(this.classList._set);
      c.value = this.value; c.checked = this.checked; c.type = this.type;
      if (deep) this.children.forEach((ch) => c.appendChild(ch.cloneNode(true)));
      return c;
    },
  };
  return node;
}

function collectText(node) {
  if (node._textContent) return node._textContent;
  const raw = node._innerHTML || '';
  if (raw) return raw.replace(/<[^>]*>/g, '');
  if (node.children && node.children.length > 0) return node.children.map(collectText).join('');
  return '';
}

const VOID_TAGS = new Set(['input','br','hr','img','link','meta','area','base','col','embed','param','source','track','wbr']);

function parseAttrsStr(attrsStr) {
  const out = {};
  const re = /([a-z][a-z0-9-:]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/gi;
  let m;
  while ((m = re.exec(attrsStr)) !== null) {
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[1]));
    out[m[1]] = val;
  }
  return out;
}

function tokeniseHTML(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) break;
      const raw = html.slice(i, end + 1);
      if (raw.startsWith('</')) {
        tokens.push({ type: 'close', tag: raw.slice(2, -1).trim().toLowerCase() });
      } else if (!raw.startsWith('<!--')) {
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

function rebuildHTML(tokens, start, end) {
  let out = '';
  for (let i = start; i < end; i++) {
    const t = tokens[i];
    if (t.type === 'text') out += t.text;
    else if (t.type === 'open') out += '<' + t.tag + (t.attrsStr ? ' ' + t.attrsStr.trim() : '') + '>';
    else if (t.type === 'close') out += '</' + t.tag + '>';
  }
  return out;
}

function buildDOMTree(tokens, pos, parent) {
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'close') break;
    if (tok.type === 'text') { pos++; continue; }
    if (tok.type === 'open') {
      const child = makeNode(tok.tag);
      const attrs = parseAttrsStr(tok.attrsStr || '');
      for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
      parent.appendChild(child);
      pos++;
      if (!tok.selfClose) {
        const start = pos;
        pos = buildDOMTree(tokens, pos, child);
        if (pos < tokens.length && tokens[pos].type === 'close' && tokens[pos].tag === tok.tag) pos++;
        child._innerHTML = rebuildHTML(tokens, start, pos - (pos < tokens.length && tokens[pos - 1] && tokens[pos - 1].type === 'close' ? 1 : 0));
        // Simpler: recompute from start to before close tag
        child._innerHTML = rebuildHTML(tokens, start, (pos < tokens.length && pos > 0 && tokens[pos - 1].type === 'close') ? pos - 1 : pos);
      }
    } else { pos++; }
  }
  return pos;
}

function parseHTML(html, parent) {
  const tokens = tokeniseHTML(html);
  buildDOMTree(tokens, 0, parent);
}

function matchesSel(node, sel) {
  if (!node || node.nodeType !== 1) return false;
  sel = sel.trim();

  function matchSimple(n, s) {
    const attrTests = [];
    s = s.replace(/\[([^\]]+)\]/g, (_, expr) => {
      const eq = expr.indexOf('=');
      if (eq === -1) attrTests.push({ k: expr, v: null });
      else attrTests.push({ k: expr.slice(0, eq), v: expr.slice(eq + 1).replace(/^["']|["']$/g, '') });
      return '';
    });
    const tagM = s.match(/^([a-z][a-z0-9-]*)/i);
    const idM  = s.match(/#([\w-]+)/);
    const clsMatches = [];
    let cs; const clsRe = /\.([\w-]+)/g;
    while ((cs = clsRe.exec(s)) !== null) clsMatches.push(cs[1]);

    if (tagM && n.tagName !== tagM[1].toUpperCase()) return false;
    if (idM && n.id !== idM[1]) return false;
    for (const cls of clsMatches) if (!n.classList.contains(cls)) return false;
    for (const at of attrTests) {
      if (at.v === null) { if (!n.hasAttribute(at.k)) return false; }
      else               { if (n.getAttribute(at.k) !== at.v) return false; }
    }
    return true;
  }

  const parts = sel.split(/\s+/);
  if (parts.length === 1) return matchSimple(node, sel);

  function matchDesc(n, pts) {
    if (!matchSimple(n, pts[pts.length - 1])) return false;
    if (pts.length === 1) return true;
    const rest = pts.slice(0, -1);
    let anc = n.parentNode;
    while (anc) { if (matchDesc(anc, rest)) return true; anc = anc.parentNode; }
    return false;
  }
  return matchDesc(node, parts);
}

function walkAll(node, fn, out, first) {
  if (!node || !node.children) return false;
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (fn(c)) { out.push(c); if (first) return true; }
    if (walkAll(c, fn, out, first) && first) return true;
  }
  return false;
}

function domQuery(root, sel, all) {
  const out = [];
  walkAll(root, (n) => matchesSel(n, sel), out, !all);
  return all ? out : (out[0] || null);
}

function makeDocument() {
  const body = makeNode('body');
  return {
    body,
    createElement(tag) { return makeNode(tag); },
    createDocumentFragment() { const f = makeNode('frag'); f.nodeType = 11; return f; },
    querySelector(sel) { return domQuery(body, sel, false); },
    querySelectorAll(sel) { return domQuery(body, sel, true); },
    getElementById(id) { return domQuery(body, '#' + id, false); },
    addEventListener() {},
    removeEventListener() {},
  };
}

function makeEvent(type, opts) {
  const ev = Object.assign({ type, bubbles: false, target: null, currentTarget: null,
    _stopped: false, preventDefault() {}, stopPropagation() { this._stopped = true; } }, opts || {});
  return ev;
}
function click(node, opts) {
  const ev = makeEvent('click', Object.assign({ bubbles: true, target: node, currentTarget: node }, opts || {}));
  node.dispatchEvent(ev);
}
function submit(form) {
  const ev = makeEvent('submit', { bubbles: true, target: form, currentTarget: form });
  form.dispatchEvent(ev);
}

// ── Mock CVItemPicker ─────────────────────────────────────────────────────
// The real picker is NOT loaded; we supply a minimal mock so CVPresetsUI can
// delegate to it. The mock records calls and gives controllable selection.

function makeMockPicker() {
  const instances = [];
  const mock = {
    instances,
    mount(container, opts) {
      let selected = (opts.selectedIds || []).map(String);
      const inst = {
        container,
        opts,
        _selected: selected,
        getSelected() { return [...this._selected]; },
        setItems(items) { this.opts.items = items; },
        destroy() { if (container) { container.children = []; container.childNodes = []; } },
        // test helper: simulate user selecting ids
        _setSelected(ids) { this._selected = ids.map(String); },
      };
      instances.push(inst);
      // Render a minimal placeholder so [data-cv-preset-picker] has a child
      const ph = makeNode('div');
      ph.className = 'mock-picker';
      container.appendChild(ph);
      return inst;
    },
  };
  return mock;
}

// ── Module loader ─────────────────────────────────────────────────────────

function loadModule(pickerMock) {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const doc = makeDocument();
  const mockPicker = pickerMock || makeMockPicker();
  const ctx = {
    window: {},
    document: doc,
    console,
    CVItemPicker: mockPicker,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cv-presets-ui.js' });
  return { ctx, doc, mockPicker };
}

// ── tests ─────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- module presence ---

test('CVPresetsUI is exposed on window with three mount functions', () => {
  const { ctx } = loadModule();
  assert.ok(ctx.CVPresetsUI, 'window.CVPresetsUI must be defined');
  assert.equal(typeof ctx.CVPresetsUI.mountPresetsList,   'function', 'mountPresetsList must be a function');
  assert.equal(typeof ctx.CVPresetsUI.mountPresetEditor,  'function', 'mountPresetEditor must be a function');
  assert.equal(typeof ctx.CVPresetsUI.mountPresetLoader,  'function', 'mountPresetLoader must be a function');
});

// ── mountPresetsList ──────────────────────────────────────────────────────

test('mountPresetsList: empty presets renders .cv-preset-empty', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetsList(container, { presets: [], onEdit: () => {}, onDelete: () => {} });
  const empty = container.querySelector('.cv-preset-empty');
  assert.ok(empty, '.cv-preset-empty must exist for empty presets');
});

test('mountPresetsList: non-empty presets renders .cv-preset-list with rows', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [
    { id: 1, name: 'Alpha', item_ids: ['a', 'b'], created_at: 0, updated_at: 0 },
    { id: 2, name: 'Beta',  item_ids: [],          created_at: 0, updated_at: 0 },
  ];
  ctx.CVPresetsUI.mountPresetsList(container, { presets, onEdit: () => {}, onDelete: () => {} });
  const list = container.querySelector('.cv-preset-list');
  assert.ok(list, '.cv-preset-list must exist for non-empty presets');
  const rows = container.querySelectorAll('.cv-preset-row');
  assert.equal(rows.length, 2, 'must render one row per preset');
});

test('mountPresetsList: each row has data-id, name, count, edit and delete buttons', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 7, name: 'MyPreset', item_ids: ['x', 'y', 'z'], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetsList(container, { presets, onEdit: () => {}, onDelete: () => {} });
  const row = container.querySelector('.cv-preset-row');
  assert.ok(row, '.cv-preset-row must exist');
  assert.equal(row.getAttribute('data-id'), '7', 'row must have data-id matching preset.id');
  assert.ok(row.querySelector('.cv-preset-name'), '.cv-preset-name must exist');
  const countEl = row.querySelector('.cv-preset-count');
  assert.ok(countEl, '.cv-preset-count must exist');
  const countText = countEl.textContent || countEl._textContent || countEl._innerHTML || '';
  assert.ok(/3/.test(countText), '.cv-preset-count must contain item count 3; got: ' + countText);
  assert.ok(row.querySelector('.cv-preset-edit'),   '.cv-preset-edit must exist');
  assert.ok(row.querySelector('.cv-preset-delete'), '.cv-preset-delete must exist');
});

test('mountPresetsList: edit button has data-action="edit"', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 1, name: 'P', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetsList(container, { presets, onEdit: () => {}, onDelete: () => {} });
  const editBtn = container.querySelector('.cv-preset-edit');
  assert.equal(editBtn && editBtn.getAttribute('data-action'), 'edit',
    '.cv-preset-edit must have data-action="edit"');
});

test('mountPresetsList: delete button has data-action="delete"', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 1, name: 'P', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetsList(container, { presets, onEdit: () => {}, onDelete: () => {} });
  const delBtn = container.querySelector('.cv-preset-delete');
  assert.equal(delBtn && delBtn.getAttribute('data-action'), 'delete',
    '.cv-preset-delete must have data-action="delete"');
});

test('mountPresetsList: clicking edit fires onEdit with the full preset object', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const preset = { id: 3, name: 'C', item_ids: ['q'], created_at: 0, updated_at: 0 };
  let editArg = null;
  ctx.CVPresetsUI.mountPresetsList(container, {
    presets: [preset],
    onEdit: (p) => { editArg = p; },
    onDelete: () => {},
  });
  const editBtn = container.querySelector('.cv-preset-edit');
  assert.ok(editBtn, '.cv-preset-edit must exist');
  click(editBtn);
  assert.ok(editArg !== null, 'onEdit must fire');
  assert.equal(editArg.id, 3, 'onEdit must receive preset with id=3');
  assert.equal(editArg.name, 'C', 'onEdit must receive full preset object');
});

test('mountPresetsList: clicking delete fires onDelete with the full preset object', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const preset = { id: 4, name: 'D', item_ids: [], created_at: 0, updated_at: 0 };
  let delArg = null;
  ctx.CVPresetsUI.mountPresetsList(container, {
    presets: [preset],
    onEdit: () => {},
    onDelete: (p) => { delArg = p; },
  });
  const delBtn = container.querySelector('.cv-preset-delete');
  assert.ok(delBtn, '.cv-preset-delete must exist');
  click(delBtn);
  assert.ok(delArg !== null, 'onDelete must fire');
  assert.equal(delArg.id, 4, 'onDelete must receive preset with id=4');
});

test('mountPresetsList: setPresets() re-renders with new list', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const inst = ctx.CVPresetsUI.mountPresetsList(container, {
    presets: [{ id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 }],
    onEdit: () => {},
    onDelete: () => {},
  });
  assert.equal(container.querySelectorAll('.cv-preset-row').length, 1);
  inst.setPresets([
    { id: 2, name: 'B', item_ids: [], created_at: 0, updated_at: 0 },
    { id: 3, name: 'C', item_ids: [], created_at: 0, updated_at: 0 },
  ]);
  assert.equal(container.querySelectorAll('.cv-preset-row').length, 2,
    'setPresets must re-render with new count');
});

// ── mountPresetEditor ─────────────────────────────────────────────────────

test('mountPresetEditor: renders form.cv-preset-editor', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  const form = container.querySelector('.cv-preset-editor');
  assert.ok(form, 'form.cv-preset-editor must exist');
  assert.equal(form.tagName, 'FORM', 'element must be a FORM');
});

test('mountPresetEditor: renders name input .cv-preset-editor-name', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  const nameInput = container.querySelector('.cv-preset-editor-name');
  assert.ok(nameInput, '.cv-preset-editor-name must exist');
});

test('mountPresetEditor: name input pre-filled when editing existing preset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const preset = { id: 5, name: 'ExistingPreset', item_ids: [], created_at: 0, updated_at: 0 };
  ctx.CVPresetsUI.mountPresetEditor(container, {
    preset,
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  const nameInput = container.querySelector('.cv-preset-editor-name');
  assert.ok(nameInput, 'name input must exist');
  assert.equal(nameInput.value, 'ExistingPreset', 'name input must be pre-filled with preset.name');
});

test('mountPresetEditor: renders [data-cv-preset-picker] container', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [{ id: '1', title: 'A', type: 'video' }],
    onSave: () => {},
    onCancel: () => {},
  });
  const pickerEl = container.querySelector('[data-cv-preset-picker]');
  assert.ok(pickerEl, '[data-cv-preset-picker] container must exist');
});

test('mountPresetEditor: CVItemPicker.mount is called to embed the picker', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [{ id: '1', title: 'A', type: 'video' }],
    onSave: () => {},
    onCancel: () => {},
  });
  assert.equal(mockPicker.instances.length, 1, 'CVItemPicker.mount must be called once');
});

test('mountPresetEditor: picker seeded with preset.item_ids as selectedIds', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  const preset = { id: 5, name: 'P', item_ids: ['a', 'b'], created_at: 0, updated_at: 0 };
  ctx.CVPresetsUI.mountPresetEditor(container, {
    preset,
    items: [{ id: 'a', title: 'A', type: 'video' }, { id: 'b', title: 'B', type: 'text' }],
    onSave: () => {},
    onCancel: () => {},
  });
  assert.equal(mockPicker.instances.length, 1, 'picker must be mounted');
  const pickerInst = mockPicker.instances[0];
  const seeded = (pickerInst.opts.selectedIds || []).map(String);
  assert.ok(seeded.includes('a') && seeded.includes('b'),
    'picker must be seeded with preset.item_ids; got: ' + JSON.stringify(seeded));
});

test('mountPresetEditor: renders cancel and save buttons', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  assert.ok(container.querySelector('.cv-preset-editor-cancel'), '.cv-preset-editor-cancel must exist');
  assert.ok(container.querySelector('.cv-preset-editor-save'),   '.cv-preset-editor-save must exist');
});

test('mountPresetEditor: save button label is "Criar preset" for new preset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  const saveBtn = container.querySelector('.cv-preset-editor-save');
  const label = saveBtn.textContent || saveBtn._textContent || saveBtn._innerHTML || saveBtn.value || '';
  assert.ok(/criar preset/i.test(label),
    'save button must say "Criar preset" for new preset; got: ' + label);
});

test('mountPresetEditor: save button label is "Salvar" for existing preset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const preset = { id: 5, name: 'Old', item_ids: [], created_at: 0, updated_at: 0 };
  ctx.CVPresetsUI.mountPresetEditor(container, {
    preset,
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  const saveBtn = container.querySelector('.cv-preset-editor-save');
  const label = saveBtn.textContent || saveBtn._textContent || saveBtn._innerHTML || saveBtn.value || '';
  assert.ok(/salvar/i.test(label),
    'save button must say "Salvar" for existing preset; got: ' + label);
});

test('mountPresetEditor: empty name guard — submitting empty name does NOT fire onSave', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  let saveCalled = false;
  let focusCalled = false;
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => { saveCalled = true; },
    onCancel: () => {},
  });
  const form = container.querySelector('.cv-preset-editor');
  const nameInput = container.querySelector('.cv-preset-editor-name');
  // Override focus to detect call
  if (nameInput) nameInput.focus = () => { focusCalled = true; };
  // Ensure name is empty
  if (nameInput) nameInput.value = '';
  submit(form);
  assert.ok(!saveCalled, 'onSave must NOT fire when name is empty');
});

test('mountPresetEditor: submitting valid name fires onSave with correct payload', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  let savePayload = null;
  const preset = { id: 9, name: 'Old', item_ids: ['x'], created_at: 0, updated_at: 0 };
  ctx.CVPresetsUI.mountPresetEditor(container, {
    preset,
    items: [{ id: 'x', title: 'X', type: 'video' }, { id: 'y', title: 'Y', type: 'text' }],
    onSave: (p) => { savePayload = p; },
    onCancel: () => {},
  });
  const nameInput = container.querySelector('.cv-preset-editor-name');
  nameInput.value = 'New Name';
  // Simulate picker selection via mock
  if (mockPicker.instances.length > 0) {
    mockPicker.instances[0]._setSelected(['x', 'y']);
  }
  const form = container.querySelector('.cv-preset-editor');
  submit(form);
  assert.ok(savePayload !== null, 'onSave must fire for valid name');
  assert.equal(savePayload.id, 9, 'onSave payload must carry preset.id');
  assert.equal(savePayload.name, 'New Name', 'onSave payload must carry the new name');
  assert.ok(Array.isArray(savePayload.item_ids), 'onSave payload must carry item_ids array');
});

test('mountPresetEditor: onSave payload id is undefined for new preset', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  let savePayload = null;
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: (p) => { savePayload = p; },
    onCancel: () => {},
  });
  const nameInput = container.querySelector('.cv-preset-editor-name');
  nameInput.value = 'Brand New';
  const form = container.querySelector('.cv-preset-editor');
  submit(form);
  assert.ok(savePayload !== null, 'onSave must fire');
  assert.equal(savePayload.id, undefined, 'onSave payload.id must be undefined for new preset');
});

test('mountPresetEditor: clicking cancel fires onCancel', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  let cancelCalled = false;
  ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => { cancelCalled = true; },
  });
  const cancelBtn = container.querySelector('.cv-preset-editor-cancel');
  assert.ok(cancelBtn, '.cv-preset-editor-cancel must exist');
  click(cancelBtn);
  assert.ok(cancelCalled, 'onCancel must fire when cancel button is clicked');
});

test('mountPresetEditor: destroy() clears container', () => {
  const mockPicker = makeMockPicker();
  const { ctx, doc } = loadModule(mockPicker);
  const container = doc.createElement('div');
  const inst = ctx.CVPresetsUI.mountPresetEditor(container, {
    items: [],
    onSave: () => {},
    onCancel: () => {},
  });
  assert.ok(container.children.length > 0, 'container must have children before destroy');
  inst.destroy();
  assert.equal(container.children.length, 0, 'container must be empty after destroy');
});

// ── mountPresetLoader ─────────────────────────────────────────────────────

test('mountPresetLoader: empty presets renders nothing (empty container)', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets: [],
    onSelect: () => {},
    onReset: () => {},
  });
  assert.equal(container.children.length, 0, 'empty presets must render nothing');
});

test('mountPresetLoader: non-empty presets renders select.cv-preset-loader-select', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [
    { id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 },
  ];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    onSelect: () => {},
    onReset: () => {},
  });
  const sel = container.querySelector('.cv-preset-loader-select');
  assert.ok(sel, '.cv-preset-loader-select must exist for non-empty presets');
  assert.equal(sel.tagName, 'SELECT', 'element must be a SELECT');
});

test('mountPresetLoader: select has empty first option + one per preset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [
    { id: 1, name: 'Alpha', item_ids: [], created_at: 0, updated_at: 0 },
    { id: 2, name: 'Beta',  item_ids: [], created_at: 0, updated_at: 0 },
  ];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    onSelect: () => {},
    onReset: () => {},
  });
  const sel = container.querySelector('.cv-preset-loader-select');
  assert.ok(sel, 'select must exist');
  // Options are children of select; check innerHTML for option count
  const html = sel._innerHTML || '';
  // Count option tags
  const optCount = (html.match(/<option/gi) || []).length;
  assert.ok(optCount >= 3, 'select must have at least 3 options (1 empty + 2 presets); got: ' + optCount);
  // First option value must be empty string
  const firstValM = html.match(/<option[^>]*value="([^"]*)"/i);
  // Either first option has value="" or we check for a blank value option
  const hasEmptyOpt = /value=""/.test(html) || /value=''/.test(html);
  assert.ok(hasEmptyOpt, 'select must have an option with value="" as placeholder; html: ' + html.slice(0, 200));
});

test('mountPresetLoader: no reset button when currentPresetId is not set', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets: [{ id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 }],
    onSelect: () => {},
    onReset: () => {},
  });
  const resetBtn = container.querySelector('.cv-preset-loader-reset');
  assert.equal(resetBtn, null, 'reset button must NOT exist when currentPresetId is not set');
});

test('mountPresetLoader: reset button rendered when currentPresetId is set', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 1,
    onSelect: () => {},
    onReset: () => {},
  });
  const resetBtn = container.querySelector('.cv-preset-loader-reset');
  assert.ok(resetBtn, '.cv-preset-loader-reset must exist when currentPresetId is set');
  const label = resetBtn.textContent || resetBtn._textContent || resetBtn._innerHTML || resetBtn.value || '';
  assert.ok(/mostrar tudo/i.test(label),
    'reset button must say "Mostrar tudo"; got: ' + label);
});

test('mountPresetLoader: selecting a preset option fires onSelect(preset)', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [
    { id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 },
  ];
  let selectArg = null;
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    onSelect: (p) => { selectArg = p; },
    onReset: () => {},
  });
  const sel = container.querySelector('.cv-preset-loader-select');
  assert.ok(sel, 'select must exist');
  // Simulate selecting preset id=10
  sel.value = '10';
  const changeEv = makeEvent('change', { bubbles: false, target: sel, currentTarget: sel });
  sel.dispatchEvent(changeEv);
  assert.ok(selectArg !== null, 'onSelect must fire on preset selection');
  assert.equal(selectArg.id, 10, 'onSelect must receive the preset object with matching id');
});

test('mountPresetLoader: selecting a preset surfaces the reset button', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    onSelect: () => {},
    onReset: () => {},
  });
  // No reset button initially
  assert.equal(container.querySelector('.cv-preset-loader-reset'), null, 'no reset button before selection');
  const sel = container.querySelector('.cv-preset-loader-select');
  sel.value = '10';
  sel.dispatchEvent(makeEvent('change', { bubbles: false, target: sel, currentTarget: sel }));
  assert.ok(container.querySelector('.cv-preset-loader-reset'),
    'reset button must appear after selecting a preset');
});

test('mountPresetLoader: selecting empty option fires onReset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 }];
  let resetCalled = false;
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 10,
    onSelect: () => {},
    onReset: () => { resetCalled = true; },
  });
  const sel = container.querySelector('.cv-preset-loader-select');
  sel.value = '';
  sel.dispatchEvent(makeEvent('change', { bubbles: false, target: sel, currentTarget: sel }));
  assert.ok(resetCalled, 'onReset must fire when empty option is selected');
});

test('mountPresetLoader: selecting empty option removes reset button', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 10,
    onSelect: () => {},
    onReset: () => {},
  });
  assert.ok(container.querySelector('.cv-preset-loader-reset'), 'reset must exist initially');
  const sel = container.querySelector('.cv-preset-loader-select');
  sel.value = '';
  sel.dispatchEvent(makeEvent('change', { bubbles: false, target: sel, currentTarget: sel }));
  assert.equal(container.querySelector('.cv-preset-loader-reset'), null,
    'reset button must be removed after selecting empty option');
});

test('mountPresetLoader: clicking reset button fires onReset', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 }];
  let resetCalled = false;
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 10,
    onSelect: () => {},
    onReset: () => { resetCalled = true; },
  });
  const resetBtn = container.querySelector('.cv-preset-loader-reset');
  assert.ok(resetBtn, 'reset button must exist');
  click(resetBtn);
  assert.ok(resetCalled, 'onReset must fire when reset button is clicked');
});

test('mountPresetLoader: clicking reset removes the reset button', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 10, name: 'Ten', item_ids: [], created_at: 0, updated_at: 0 }];
  ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 10,
    onSelect: () => {},
    onReset: () => {},
  });
  const resetBtn = container.querySelector('.cv-preset-loader-reset');
  click(resetBtn);
  assert.equal(container.querySelector('.cv-preset-loader-reset'), null,
    'reset button must be removed after clicking it');
});

test('mountPresetLoader: getCurrentId() returns null initially (no currentPresetId)', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 }];
  const inst = ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    onSelect: () => {},
    onReset: () => {},
  });
  assert.equal(inst.getCurrentId(), null, 'getCurrentId must return null when no preset selected');
});

test('mountPresetLoader: getCurrentId() returns the id when currentPresetId is set', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const presets = [{ id: 5, name: 'Five', item_ids: [], created_at: 0, updated_at: 0 }];
  const inst = ctx.CVPresetsUI.mountPresetLoader(container, {
    presets,
    currentPresetId: 5,
    onSelect: () => {},
    onReset: () => {},
  });
  assert.ok(inst.getCurrentId() == 5,
    'getCurrentId must return 5 when currentPresetId=5; got: ' + inst.getCurrentId());
});

test('mountPresetLoader: setPresets() re-renders with new list', () => {
  const { ctx, doc } = loadModule();
  const container = doc.createElement('div');
  const inst = ctx.CVPresetsUI.mountPresetLoader(container, {
    presets: [{ id: 1, name: 'A', item_ids: [], created_at: 0, updated_at: 0 }],
    onSelect: () => {},
    onReset: () => {},
  });
  // Initially 1 preset -> select exists
  assert.ok(container.querySelector('.cv-preset-loader-select'), 'select must exist before setPresets');
  // Set to empty -> should render nothing
  inst.setPresets([]);
  const sel2 = container.querySelector('.cv-preset-loader-select');
  assert.equal(sel2, null, 'setPresets([]) must clear the select');
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
