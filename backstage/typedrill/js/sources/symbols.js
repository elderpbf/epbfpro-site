// Source: Símbolos ABNT2 (finger-return drills). Levels 1-5.
// Level 1 pattern: {anchor}{baseKey}{anchor}{symbol} groups.
// Level 2 pattern: neighbor-column letters (same hand+finger as the symbol) + symbol.
// Levels 3-5 pull from hand-authored pt-BR content in data/abnt2-symbols.js.

import { LAYOUT } from '../data/abnt2-layout.js';
import { SYMBOLS } from '../data/abnt2-symbols.js';

const BASE_KEY_FOR_SHIFTED = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
  '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=',
  '<': ',', '>': '.', ':': ';', '?': '/', '"': "'"
};

const VALID_CHARS = Object.keys(BASE_KEY_FOR_SHIFTED);
const LETTER_RE = /^[a-zçñáàâãéèêíìîóòôõúùûü]$/i;

export function generate(charset, stats, opts) {
  const o = opts || {};
  if (!charset || !charset.simbolos) return [];
  const symbolChar = o.symbolChar || '%';

  // "Todos" mode: one line per symbol, in SYMBOLS order.
  if (symbolChar === '*all*') {
    const lines = [];
    for (const s of SYMBOLS) {
      const subOpts = { ...o, symbolChar: s.char, linesPerBatch: 1 };
      const r = generate(charset, stats, subOpts);
      if (r.length > 0) lines.push(r[0]);
    }
    return lines;
  }

  if (!VALID_CHARS.includes(symbolChar)) return [];
  const level = Number.isInteger(o.level) ? o.level : 1;
  const entry = SYMBOLS.find(s => s.char === symbolChar);
  if (!entry) return [];

  const wordsPerLesson = Math.max(1, o.wordsPerLesson || 6);
  const repeatWord = Math.max(1, o.repeatWord || 1);
  const linesPerBatch = Math.max(1, o.linesPerBatch || 5);

  switch (level) {
    case 1: return level1Lines(entry, wordsPerLesson, linesPerBatch);
    case 2: return level2Lines(entry, wordsPerLesson, linesPerBatch);
    case 3: return level3Lines(entry, wordsPerLesson, repeatWord, linesPerBatch);
    case 4: return level4Lines(entry, linesPerBatch);
    case 5: return level5Lines(entry, linesPerBatch);
    default: return level1Lines(entry, wordsPerLesson, linesPerBatch);
  }
}

function level1Lines(entry, wordsPerLesson, linesPerBatch) {
  // Rotate 3 finger-return variants so the line doesn't feel like a copy drill.
  // Same fingers and same keys, different stroke order. Line 0 still starts
  // with the canonical anchor+base+anchor+char so earlier assertions hold.
  const a = entry.anchor;
  const b = entry.baseKey;
  const c = entry.char;
  const variants = [a + b + a + c, a + c + a + b, c + a + b + a];
  const lines = [];
  for (let l = 0; l < linesPerBatch; l++) {
    const groups = [];
    for (let i = 0; i < wordsPerLesson; i++) {
      groups.push(variants[(i + l) % variants.length]);
    }
    lines.push(groups.join(' '));
  }
  return lines;
}

function level2Lines(entry, wordsPerLesson, linesPerBatch) {
  const symLoc = LAYOUT[entry.char];
  if (!symLoc) return [];
  const neighbors = [];
  for (const [key, meta] of Object.entries(LAYOUT)) {
    if (!LETTER_RE.test(key)) continue;
    if (meta.hand === symLoc.hand && meta.finger === symLoc.finger) {
      neighbors.push(key);
    }
  }
  if (neighbors.length === 0) return [];

  const clusterSize = 3;
  const clusters = [];
  for (let i = 0; i < neighbors.length; i += clusterSize) {
    clusters.push(neighbors.slice(i, i + clusterSize).join(''));
  }
  const groups = [];
  for (let i = 0; i < wordsPerLesson; i++) {
    groups.push(clusters[i % clusters.length] + entry.char);
  }
  const line = groups.join(' ');
  return Array(linesPerBatch).fill(line);
}

function level3Lines(entry, wordsPerLesson, repeatWord, linesPerBatch) {
  const pool = entry.wordsL3 || [];
  if (pool.length === 0) return [];
  const lines = [];
  for (let l = 0; l < linesPerBatch; l++) {
    const tokens = [];
    const picks = Math.ceil(wordsPerLesson / repeatWord);
    for (let p = 0; p < picks; p++) {
      const w = pool[Math.floor(Math.random() * pool.length)];
      for (let r = 0; r < repeatWord; r++) tokens.push(w);
    }
    tokens.length = wordsPerLesson;
    lines.push(tokens.filter(Boolean).join(' '));
  }
  return lines;
}

function level4Lines(entry, linesPerBatch) {
  const pool = entry.phrasesL4 || [];
  if (pool.length === 0) return [];
  const lines = [];
  for (let i = 0; i < linesPerBatch; i++) {
    lines.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return lines;
}

function level5Lines(entry, linesPerBatch) {
  const pool = entry.paragraphsL5 || [];
  if (pool.length === 0) return [];
  const lines = [];
  for (let i = 0; i < linesPerBatch; i++) {
    const para = pool[Math.floor(Math.random() * pool.length)];
    const sentences = para.split(/\.\s+/).map(s => s.trim()).filter(Boolean);
    lines.push(sentences.length > 1
      ? sentences[Math.floor(Math.random() * sentences.length)]
      : para);
  }
  return lines;
}

export function renderOptions(container, options, onChange) {
  const opts = options || {};
  const level = Number.isInteger(opts.level) ? opts.level : 1;
  const symbolChar = opts.symbolChar || '%';

  const wrap = document.createElement('div');
  wrap.className = 'td-source-options-form';

  const labelLevel = document.createElement('label');
  labelLevel.textContent = 'nível ';
  const selLevel = document.createElement('select');
  for (let i = 1; i <= 5; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === level) opt.selected = true;
    selLevel.appendChild(opt);
  }
  selLevel.addEventListener('change', () => onChange({ level: Number(selLevel.value) }));
  labelLevel.appendChild(selLevel);
  wrap.appendChild(labelLevel);

  const labelSym = document.createElement('label');
  labelSym.textContent = ' símbolo ';
  const selSym = document.createElement('select');
  const allOpt = document.createElement('option');
  allOpt.value = '*all*';
  allOpt.textContent = 'Todos';
  if (symbolChar === '*all*') allOpt.selected = true;
  selSym.appendChild(allOpt);
  for (const ch of VALID_CHARS) {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    if (ch === symbolChar) opt.selected = true;
    selSym.appendChild(opt);
  }
  selSym.addEventListener('change', () => onChange({ symbolChar: selSym.value }));
  labelSym.appendChild(selSym);
  wrap.appendChild(labelSym);

  const labelWpl = document.createElement('label');
  labelWpl.className = 'td-opt-field';
  labelWpl.textContent = ' grupos por linha ';
  const inputWpl = document.createElement('input');
  inputWpl.type = 'number';
  inputWpl.min = '3';
  inputWpl.max = '20';
  inputWpl.value = String(opts.wordsPerLesson || 6);
  inputWpl.className = 'td-opt-input';
  inputWpl.addEventListener('change', () => {
    onChange({ wordsPerLesson: Math.max(3, Math.min(20, Number(inputWpl.value) || 6)) });
  });
  labelWpl.appendChild(inputWpl);
  wrap.appendChild(labelWpl);

  container.appendChild(wrap);
}
