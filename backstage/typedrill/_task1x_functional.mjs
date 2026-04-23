// TypeDrill task 1X -- Texto chunking + no wpl input functional harness.

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.window = { addEventListener: () => {} };

function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    _text: '',
    _class: '',
    attributes: {},
    get className() { return this._class; },
    set className(v) { this._class = String(v); },
    get textContent() {
      if (this._text) return this._text;
      return this.children.map(c => c.textContent || '').join('');
    },
    set textContent(v) { this._text = String(v); this.children = []; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
  };
}
globalThis.document = {
  createElement: (tag) => makeEl(tag),
  createTextNode: (text) => ({ tagName: '#text', children: [], textContent: String(text), _class: '', _text: String(text) }),
  getElementById: () => null,
  querySelectorAll: () => []
};

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const custom = await import('./js/sources/custom.js');

// --- Assertion 1-2: 200-word paste chunks into 7 lines of [30,30,30,30,30,30,20] ---
const words200 = Array.from({ length: 200 }, (_, i) => 'w' + i).join(' ');
const lines200 = custom.generate({ letras: true, pontuacao: true, numeros: true }, {}, { text: words200 });
assert(lines200.length === 7, `200-word paste -> 7 lines (got ${lines200.length})`);
const sizes = lines200.map(l => l.split(' ').length);
const expected = [30, 30, 30, 30, 30, 30, 20];
assert(JSON.stringify(sizes) === JSON.stringify(expected), `chunk sizes = [30,30,30,30,30,30,20] (got ${JSON.stringify(sizes)})`);

// --- Assertion 3: 1P regression -- strip-not-drop with pontuacao:false ---
const r1p = custom.generate({ letras: true, pontuacao: false }, {}, { text: 'Olá, mundo!' });
assert(r1p.length === 1 && r1p[0] === 'Olá mundo', `1P regression: ['Olá mundo'] (got ${JSON.stringify(r1p)})`);

// --- Assertion 4: renderOptions DOM contains no wpl nodes ---
function flatten(el, out = []) {
  out.push(el);
  for (const c of (el.children || [])) flatten(c, out);
  return out;
}
const container = makeEl('div');
custom.renderOptions(container, {}, () => {});
const allNodes = flatten(container);
const wplHits = allNodes.filter(n => {
  const cls = n._class || '';
  const txt = n._text || '';
  return cls.includes('td-opt-field') || cls.includes('td-opt-input')
      || cls.includes('wpl') || txt.includes('palavras por lição');
});
assert(wplHits.length === 0, `renderOptions: no wpl-related nodes (got ${wplHits.length}: ${wplHits.map(n => n.tagName + '.' + n._class).join(', ')})`);

// --- Sanity: renderOptions still renders textarea + three toggles ---
const textareas = allNodes.filter(n => n.tagName === 'TEXTAREA');
assert(textareas.length === 1, `renderOptions: exactly one textarea (got ${textareas.length})`);
const checkboxes = allNodes.filter(n => n.tagName === 'INPUT' && n.type === 'checkbox');
assert(checkboxes.length === 3, `renderOptions: three checkboxes (got ${checkboxes.length})`);

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
