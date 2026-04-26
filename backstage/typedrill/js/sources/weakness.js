// Source: Fraqueza (weakness-driven). Reads td_skill_v1.charStats and trains
// the worst-scoring chars in drill (finger-return) or word (pt-BR prose) mode.
//
// Accent handling: charStats variants like 'á','â','ã' aggregate into 'a' for
// ranking and content lookup; 'ç' is a dedicated ABNT2 key and stays itself.
//
// Threshold (re-tune from staging): >= MIN_ATTEMPTS per base char,
// >= TOP_N base chars eligible. Below threshold returns a single placeholder
// line so the source card stays visible without throwing the engine.

import { LAYOUT } from '../data/abnt2-layout.js';
import { WORDS } from '../data/pt-br-1000.js';

const MIN_ATTEMPTS = 30;
const TOP_N = 3;
const PLACEHOLDER = 'treine mais para ativar';

function stripToBase(ch) {
  if (!ch) return '';
  const lc = ch.toLowerCase();
  if (lc === 'ç') return lc;
  return lc.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function aggregateCharStats(charStats) {
  const agg = new Map();
  for (const ch of Object.keys(charStats || {})) {
    const s = charStats[ch];
    if (!s || !s.attempts) continue;
    const base = stripToBase(ch);
    if (!base || base.length !== 1) continue;
    const cur = agg.get(base) || { attempts: 0, errors: 0, wpmSum: 0, wpmN: 0 };
    cur.attempts += s.attempts;
    cur.errors += s.errors || 0;
    if (typeof s.lastWpm === 'number' && s.lastWpm > 0) {
      cur.wpmSum += s.lastWpm;
      cur.wpmN += 1;
    }
    agg.set(base, cur);
  }
  return agg;
}

function rankWeakest(charStats, targetWpm) {
  const agg = aggregateCharStats(charStats);
  const t = Math.max(1, targetWpm || 35);
  const eligible = [];
  for (const [base, s] of agg) {
    if (s.attempts < MIN_ATTEMPTS) continue;
    if (!LAYOUT[base]) continue;
    const acc = (s.attempts - s.errors) / s.attempts;
    const lastWpm = s.wpmN > 0 ? s.wpmSum / s.wpmN : 1;
    const score = (1 - acc) * (t / Math.max(lastWpm, 1));
    eligible.push({ char: base, score });
  }
  eligible.sort((a, b) => b.score - a.score);
  return eligible.slice(0, TOP_N).map(x => x.char);
}

export function generate(charset, stats, opts) {
  const o = opts || {};
  const targetWpm = (stats && stats.targetWpm) || 35;
  const charStats = (stats && stats.charStats) || {};
  const weak = rankWeakest(charStats, targetWpm);
  if (weak.length < TOP_N) return [PLACEHOLDER];

  const mode = o.mode === 'word' ? 'word' : 'drill';
  return mode === 'word' ? generateWordMode(weak, o) : generateDrillMode(weak, o);
}

function generateDrillMode(weak, o) {
  const wordsPerLesson = Math.max(3, Math.min(40, Number(o.wordsPerLesson) || 12));
  const linesPerBatch = Math.max(1, Number(o.linesPerBatch) || 5);

  // 3 finger-return variants per weak char. Group is 4 chars long.
  const variants = [];
  for (const ch of weak) {
    const a = (LAYOUT[ch] && LAYOUT[ch].anchor) ? LAYOUT[ch].anchor : ch;
    variants.push(a + ch + a + ch);
    variants.push(ch + a + ch + a);
    variants.push(a + ch + ch + a);
  }
  if (variants.length === 0) return [PLACEHOLDER];

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

function generateWordMode(weak, o) {
  const wordsPerLesson = Math.max(3, Math.min(50, Number(o.wordsPerLesson) || 15));
  const linesPerBatch = Math.max(1, Number(o.linesPerBatch) || 5);
  const weakSet = new Set(weak);

  const ranked = [];
  for (const w of WORDS) {
    if (!w) continue;
    let hits = 0;
    let len = 0;
    for (const ch of w) {
      const base = stripToBase(ch);
      if (!base) continue;
      len++;
      if (weakSet.has(base)) hits++;
    }
    if (hits === 0 || len === 0) continue;
    ranked.push({ word: w, density: hits / len });
  }
  if (ranked.length === 0) return [PLACEHOLDER];
  ranked.sort((a, b) => b.density - a.density);
  const pool = ranked.map(x => x.word);

  const lines = [];
  for (let l = 0; l < linesPerBatch; l++) {
    const slice = [];
    for (let i = 0; i < wordsPerLesson; i++) {
      slice.push(pool[(l * wordsPerLesson + i) % pool.length]);
    }
    lines.push(slice.join(' '));
  }
  return lines;
}

export function renderOptions(container, options, onChange) {
  const opts = options || {};
  const mode = opts.mode === 'word' ? 'word' : 'drill';
  const defaultWpl = mode === 'word' ? 15 : 12;

  const wrap = document.createElement('div');
  wrap.className = 'td-source-options-form';

  const modeLabel = document.createElement('label');
  modeLabel.className = 'td-opt-field';
  modeLabel.textContent = 'modo ';
  const modeSel = document.createElement('select');
  for (const [val, label] of [['drill', 'treino'], ['word', 'palavras']]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === mode) opt.selected = true;
    modeSel.appendChild(opt);
  }
  modeSel.addEventListener('change', () => onChange({ mode: modeSel.value }));
  modeLabel.appendChild(modeSel);
  wrap.appendChild(modeLabel);

  const wplLabel = document.createElement('label');
  wplLabel.className = 'td-opt-field';
  wplLabel.textContent = ' grupos por linha ';
  const wplInput = document.createElement('input');
  wplInput.type = 'number';
  wplInput.min = '3';
  wplInput.max = '50';
  wplInput.value = String(opts.wordsPerLesson || defaultWpl);
  wplInput.className = 'td-opt-input';
  wplInput.addEventListener('change', () => {
    onChange({ wordsPerLesson: Math.max(3, Math.min(50, Number(wplInput.value) || defaultWpl)) });
  });
  wplLabel.appendChild(wplInput);
  wrap.appendChild(wplLabel);

  container.appendChild(wrap);
}

// Test handle: exposed so __TD__.sources.weakness can be probed from staging.
export const __test = { stripToBase, aggregateCharStats, rankWeakest, MIN_ATTEMPTS, TOP_N };
