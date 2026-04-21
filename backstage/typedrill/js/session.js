// TypeDrill session. Owns the active source id, per-source options, and the
// current line batch. Subscribes to charset for regenerate triggers and fans
// `{activeId, line, lineIdx, lineCount}` snapshots to consumers.

import * as registry from './source-registry.js';
import * as skill from './skill.js';
import * as charset from './charset.js';

const subscribers = new Set();
let activeId = null;
let lines = [];
let lineIdx = 0;
let charsetUnsub = null;

export function init() {
  const s = skill.get();
  if (!s.settings.sources) s.settings.sources = { symbols: {}, common: {}, custom: {} };
  if (!s.settings.activeSource) s.settings.activeSource = 'common';
  skill.set(s);

  activeId = s.settings.activeSource;

  if (charsetUnsub) charsetUnsub();
  charsetUnsub = charset.subscribe(() => regenerate());

  regenerate();
}

export function setActiveSource(id) {
  if (!registry.get(id)) return;
  activeId = id;
  const s = skill.get();
  s.settings.activeSource = id;
  skill.set(s);
  regenerate();
}

export function getActiveSource() {
  return activeId;
}

export function getOptions(id) {
  const s = skill.get();
  return (s.settings.sources && s.settings.sources[id]) || {};
}

export function setOptions(id, patch) {
  const s = skill.get();
  if (!s.settings.sources) s.settings.sources = {};
  s.settings.sources[id] = { ...(s.settings.sources[id] || {}), ...(patch || {}) };
  skill.set(s);
  if (id === activeId) regenerate();
}

export function regenerate() {
  const entry = registry.get(activeId);
  if (!entry || typeof entry.generate !== 'function') {
    lines = [];
    lineIdx = 0;
    notify();
    return;
  }
  const stats = skill.get();
  const globalDefaults = {
    wordsPerLesson: stats.settings && stats.settings.wordsPerLesson,
    repeatWord: stats.settings && stats.settings.repeatWord
  };
  const opts = { ...globalDefaults, ...getOptions(activeId) };
  try {
    const result = entry.generate(charset.get(), stats, opts);
    lines = Array.isArray(result) ? result : [];
  } catch (e) {
    console.warn('session.regenerate: source threw', activeId, e);
    lines = [];
  }
  lineIdx = 0;
  notify();
}

export function currentLine() {
  return lines[lineIdx] || '';
}

export function nextLine() {
  if (lineIdx + 1 < lines.length) {
    lineIdx++;
    notify();
  } else {
    regenerate();
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  const snap = {
    activeId,
    line: currentLine(),
    lineIdx,
    lineCount: lines.length
  };
  for (const fn of subscribers) {
    try { fn(snap); } catch (e) { console.warn('session subscriber threw', e); }
  }
}
