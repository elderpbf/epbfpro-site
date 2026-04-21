// Source: Palavras comuns pt-BR (top-1000).

import { WORDS } from '../data/pt-br-1000.js';
import { buildAllowedChars } from '../charset.js';

export function generate(charset, stats, opts) {
  const o = opts || {};
  const wordsPerLesson = Math.max(1, o.wordsPerLesson || 30);
  const repeatWord = Math.max(1, o.repeatWord || 1);
  const linesPerBatch = Math.max(1, o.linesPerBatch || 5);

  const allowed = buildAllowedChars(charset);
  const pool = filterByFocus(WORDS, charset).filter(function (w) {
    for (const ch of w) {
      if (!allowed.has(ch.toLowerCase())) return false;
    }
    return true;
  });

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
