'use strict';

// Minimal DOM stub for Node-based UI tests.
// Extracted from cv-presets-ui.test.js so Bundle O UI tests can share it
// without copy-pasting ~280 lines. Same behavior, same query semantics.
//
// Usage:
//   const dom = require('./__test-dom.cjs');
//   const { ctx, doc } = dom.loadInVM(modulePath, { extraGlobals: { CVDriveFoldersAPI: stub } });
//   const host = doc.createElement('div');
//   dom.click(host.querySelector('.foo'));

const fs = require('node:fs');
const vm = require('node:vm');

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
    hidden: false,
    disabled: false,
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
      if (k === 'hidden') this.hidden = true;
      if (k === 'disabled') this.disabled = true;
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
      if (k === 'hidden') this.hidden = false;
      if (k === 'disabled') this.disabled = false;
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

function buildDOMTree(tokens, pos, parent) {
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'close') break;
    if (tok.type === 'text') {
      if (!parent._innerHTML) parent._innerHTML = tok.text;
      pos++;
      continue;
    }
    if (tok.type === 'open') {
      const child = makeNode(tok.tag);
      const attrs = parseAttrsStr(tok.attrsStr || '');
      for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
      parent.appendChild(child);
      pos++;
      if (!tok.selfClose) {
        pos = buildDOMTree(tokens, pos, child);
        if (pos < tokens.length && tokens[pos].type === 'close' && tokens[pos].tag === tok.tag) pos++;
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
function input(node, value) {
  node.value = value == null ? '' : String(value);
  const ev = makeEvent('input', { bubbles: true, target: node, currentTarget: node });
  node.dispatchEvent(ev);
}

function loadInVM(modulePath, opts) {
  const src = fs.readFileSync(modulePath, 'utf8');
  const doc = makeDocument();
  const ctx = Object.assign({
    window: {},
    document: doc,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
  }, (opts && opts.extraGlobals) || {});
  ctx.window = ctx;
  // Mirror non-window globals onto window so modules using `window.X` see them.
  for (const k of Object.keys((opts && opts.extraGlobals) || {})) {
    ctx.window[k] = ctx[k];
  }
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: modulePath });
  return { ctx, doc };
}

module.exports = { makeNode, makeDocument, makeEvent, click, submit, input, loadInVM };
