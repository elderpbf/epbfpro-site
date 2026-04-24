// Source: Texto personalizado -- user-pasted text pipeline.
// Filters pasted text by active charset, applies optional transforms
// (strip-punct / lowercase / shuffle), groups into wordsPerLesson lines.

import { buildAllowedChars, renderCharsetControls } from '../charset.js';

const STRIP_CHARS = new Set(['.', ',', ';', ':', '!', '?', '"', '(', ')', '[', ']']);

export function generate(charset, stats, opts) {
  const o = opts || {};
  const rawText = typeof o.text === 'string' ? o.text : '';
  if (!rawText.trim()) return [];

  const wordsPerLesson = 30;

  let text = rawText.replace(/\s+/g, ' ').trim();
  if (o.lowercase) text = text.toLocaleLowerCase('pt-BR');
  if (o.stripPunct) {
    let out = '';
    for (const ch of text) {
      if (!STRIP_CHARS.has(ch)) out += ch;
    }
    text = out.replace(/\s+/g, ' ').trim();
  }

  let words = text.split(' ').filter(Boolean);

  const allowed = buildAllowedChars(charset);
  words = words.map(function (w) {
    let out = '';
    for (const ch of w) {
      if (allowed.has(ch.toLowerCase())) out += ch;
    }
    return out;
  }).filter(function (w) { return w.length > 0; });

  if (o.shuffleWords && words.length > 1) {
    const rng = typeof o.seed === 'number' ? mulberry32(o.seed) : Math.random;
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = words[i]; words[i] = words[j]; words[j] = tmp;
    }
  }

  if (words.length === 0) return [];

  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLesson) {
    lines.push(words.slice(i, i + wordsPerLesson).join(' '));
  }
  return lines;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderOptions(container, options, onChange) {
  const opts = options || {};

  const charsetSection = document.createElement('div');
  charsetSection.className = 'td-source-options-section';
  renderCharsetControls(charsetSection);
  container.appendChild(charsetSection);

  const wrap = document.createElement('div');
  wrap.className = 'td-source-options-form';

  const textareaLabel = document.createElement('label');
  textareaLabel.className = 'td-custom-text-label';
  textareaLabel.textContent = 'texto para praticar';
  const textarea = document.createElement('textarea');
  textarea.className = 'td-custom-text';
  textarea.rows = 6;
  textarea.placeholder = 'cole um trecho aqui';
  textarea.value = opts.text || '';
  let debounceTimer = null;
  textarea.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onChange({ text: textarea.value }), 250);
  });
  textareaLabel.appendChild(textarea);
  wrap.appendChild(textareaLabel);

  const togglesRow = document.createElement('div');
  togglesRow.className = 'td-custom-toggles';
  togglesRow.appendChild(makeCheckbox('stripPunct', 'remover pontuação', opts, onChange));
  togglesRow.appendChild(makeCheckbox('lowercase', 'minúsculas', opts, onChange));
  togglesRow.appendChild(makeCheckbox('shuffleWords', 'embaralhar', opts, onChange));
  wrap.appendChild(togglesRow);

  container.appendChild(wrap);
}

function makeCheckbox(key, label, opts, onChange) {
  const lbl = document.createElement('label');
  lbl.className = 'td-checkbox';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!opts[key];
  cb.addEventListener('change', () => onChange({ [key]: cb.checked }));
  lbl.appendChild(cb);
  lbl.appendChild(document.createTextNode(' ' + label));
  return lbl;
}
