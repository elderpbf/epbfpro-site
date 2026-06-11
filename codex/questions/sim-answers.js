// questions/sim-answers.js
// Pure, dependency-free answer builder for the debug-only in-host "Simular
// respostas" control. This is the BROWSER re-instantiation of the
// `live-session-simulator` capability (Setup/Blueprints/CATALOG.md); the
// canonical Node version is PensoIA/ClassPulse/tools/loadtest. Same per-type
// distribution contract: weighted winner for choice types, pooled text for
// open/wordcloud, in-range value for rating/numeric.
//
// No DOM, no network, no Date.now(): live-host owns firing submit_answer; this
// only decides WHAT each virtual student answers, so it stays unit-testable.

const OPEN_POOL = ['Concordo', 'Discordo em parte', 'Boa pergunta', 'Depende do caso concreto', 'Nao tenho certeza', 'Precisa de mais contexto', 'Excelente ponto', 'Faz sentido'];
const WORD_POOL = ['prazo', 'recurso', 'prova', 'nulidade', 'competencia', 'merito', 'prescricao', 'duvida'];

// FNV-1a -> uint32 seed, so a student name / question id maps to a stable seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: a tiny seeded PRNG returning [0,1). Deterministic per seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick(weights, rng) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * (sum || 1);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

function winnerWeights(n, winner, skew) {
  const base = (1 - skew) / n;
  const w = new Array(n).fill(base);
  w[winner] = base + skew;
  return w;
}

function parseOpts(opts) {
  if (typeof opts === 'string') { try { return JSON.parse(opts); } catch (e) { return []; } }
  return opts;
}

// Decide one student's answer payload for the active question, or null when the
// question shape cannot be answered (e.g. a choice question with no options).
// `skew` (0..1) biases choice answers toward a per-question winner.
export function buildAnswer(q, rng, skew) {
  if (!q) return null;
  const type = q.type || 'mc';
  const opts = parseOpts(q.options);
  const arr = Array.isArray(opts) ? opts : [];
  switch (type) {
    case 'mc':
    case 'tf':
    case 'poll': {
      if (!arr.length) return null;
      const winner = hashSeed(q.id) % arr.length;
      return { answer_index: weightedPick(winnerWeights(arr.length, winner, skew), rng) };
    }
    case 'open':
      return { answer_value: OPEN_POOL[Math.floor(rng() * OPEN_POOL.length)] };
    case 'wordcloud':
      return { answer_value: WORD_POOL[Math.floor(rng() * WORD_POOL.length)] };
    case 'rating':
    case 'numeric': {
      const o = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
      const min = Number.isFinite(+o.min) ? +o.min : 1;
      const max = Number.isFinite(+o.max) ? +o.max : 5;
      const lo = Math.min(min, max), hi = Math.max(min, max);
      return { answer_value: String(lo + Math.round(rng() * (hi - lo))) };
    }
    default:
      return null;
  }
}
