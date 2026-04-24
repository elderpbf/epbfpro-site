// Source: Palavras comuns pt-BR (top-1000).

import { WORDS } from '../data/pt-br-1000.js';
import { buildAllowedChars, renderCharsetControls } from '../charset.js';

export function generate(charset, stats, opts) {
  const o = opts || {};
  const wordsPerLesson = Math.max(1, o.wordsPerLesson || 30);
  const repeatWord = Math.max(1, o.repeatWord || 1);
  const linesPerBatch = Math.max(1, o.linesPerBatch || 5);

  const allowed = buildAllowedChars(charset);
  const pool = filterByFocus(WORDS, charset)
    .map(function (w) {
      let out = '';
      for (const ch of w) {
        if (allowed.has(ch.toLowerCase())) out += ch;
      }
      return out;
    })
    .filter(function (w) { return w.length > 0; });

  if (pool.length === 0) return [];

  const lines = [];
  for (let i = 0; i < linesPerBatch; i++) {
    const lineWords = [];
    const pickCount = Math.ceil(wordsPerLesson / repeatWord);
    for (let p = 0; p < pickCount; p++) {
      const w = pool[Math.floor(Math.random() * pool.length)];
      for (let r = 0; r < repeatWord; r++) lineWords.push(w);
    }
    lineWords.length = wordsPerLesson;
    lines.push(lineWords.join(' '));
  }
  return lines;
}

function filterByFocus(words, charset) {
  const focus = charset && charset.focus;
  if (!focus || !focus.length) return words;
  const lc = focus.map(function (f) { return f.toLowerCase(); });
  return words.filter(function (w) {
    const wl = w.toLowerCase();
    for (const f of lc) if (wl.indexOf(f) !== -1) return true;
    return false;
  });
}

export function renderOptions(container, options, onChange) {
  const opts = options || {};

  const charsetSection = document.createElement('div');
  charsetSection.className = 'td-source-options-section';
  renderCharsetControls(charsetSection);
  container.appendChild(charsetSection);

  const numRow = document.createElement('div');
  numRow.className = 'td-source-options-numbers';

  const wplLabel = document.createElement('label');
  wplLabel.className = 'td-opt-field';
  wplLabel.textContent = 'palavras por lição ';
  const wplInput = document.createElement('input');
  wplInput.type = 'number';
  wplInput.min = '5';
  wplInput.max = '200';
  wplInput.value = String(opts.wordsPerLesson || 30);
  wplInput.className = 'td-opt-input';
  wplInput.addEventListener('change', () => {
    onChange({ wordsPerLesson: Math.max(5, Math.min(200, Number(wplInput.value) || 30)) });
  });
  wplLabel.appendChild(wplInput);
  numRow.appendChild(wplLabel);

  const repLabel = document.createElement('label');
  repLabel.className = 'td-opt-field';
  repLabel.textContent = 'repetir palavra ';
  const repInput = document.createElement('input');
  repInput.type = 'number';
  repInput.min = '1';
  repInput.max = '10';
  repInput.value = String(opts.repeatWord || 1);
  repInput.className = 'td-opt-input';
  repInput.addEventListener('change', () => {
    onChange({ repeatWord: Math.max(1, Math.min(10, Number(repInput.value) || 1)) });
  });
  repLabel.appendChild(repInput);
  numRow.appendChild(repLabel);

  container.appendChild(numRow);
}
