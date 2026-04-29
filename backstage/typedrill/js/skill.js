// Per-character skill tracker backed by localStorage (td_skill_v1).

import { KEYS, readJSON, writeJSON } from './storage.js';

const DEFAULT_STATE_JSON = JSON.stringify({
  version: 1,
  targetWpm: 35,
  unlockedChars: ['a','s','d','f','j','k','l','ç'],
  currentFocus: 'e',
  charStats: {},
  sessions: [],
  settings: {
    strict: true,
    shiftSide: true,
    sounds: 'none',
    capitalsPct: 0,
    punctPct: 0,
    wordsPerLesson: 30,
    repeatWord: 1,
    dailyGoalMin: 30,
    whitespaceDisplay: 'bullet',
    charset: {
      letras: true,
      numeros: false,
      simbolos: true,
      pontuacao: false,
      focus: []
    },
    sources: {
      symbols: {},
      common: {},
      custom: {},
      weakness: {}
    },
    activeSource: 'common'
  }
});

const DEBOUNCE_MS = 500;
let state = null;
let flushTimer = null;
let beforeUnloadBound = false;

function defaultState() {
  return JSON.parse(DEFAULT_STATE_JSON);
}

function ensureLoaded() {
  if (state) return;
  const stored = readJSON(KEYS.skill);
  state = (stored && stored.version === 1) ? stored : defaultState();
  if (!state.settings) state.settings = defaultState().settings;
  if (!state.settings.charset) {
    state.settings.charset = { letras: true, numeros: false, simbolos: true, pontuacao: false, focus: [] };
  }
  if (!state.settings.sources) {
    state.settings.sources = { symbols: {}, common: {}, custom: {} };
  }
  if (!state.settings.activeSource) {
    state.settings.activeSource = 'common';
  }
  ensureBeforeUnload();
}

function ensureBeforeUnload() {
  if (beforeUnloadBound) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeunload', flush);
  beforeUnloadBound = true;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

export function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!state) return;
  writeJSON(KEYS.skill, state);
}

export function recordAttempt(expectedChar, wasCorrect, wpm) {
  ensureLoaded();
  if (!expectedChar) return;
  let stats = state.charStats[expectedChar];
  if (!stats) {
    stats = { attempts: 0, errors: 0, bestWpm: 0, lastWpm: 0, avgWpm: 0, lastSeen: 0 };
    state.charStats[expectedChar] = stats;
  }
  stats.attempts++;
  if (!wasCorrect) stats.errors++;
  if (typeof wpm === 'number' && wpm > 0) {
    stats.lastWpm = wpm;
    stats.bestWpm = Math.max(stats.bestWpm, wpm);
    stats.avgWpm = stats.avgWpm
      ? Math.round(stats.avgWpm * 0.9 + wpm * 0.1)
      : wpm;
  }
  stats.lastSeen = Date.now();
  scheduleFlush();
}

export function get() {
  ensureLoaded();
  return state;
}

export function set(obj) {
  state = obj;
  scheduleFlush();
}

export function reset() {
  state = defaultState();
  flush();
}

export function resetProgress() {
  ensureLoaded();
  state.charStats = {};
  state.sessions = [];
  flush();
}
