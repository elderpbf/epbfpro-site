// TypeDrill active character set. Persists through skill.js (settings.charset)
// and fans notifications out to subscribers coalesced per microtask.

import * as skill from './skill.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyzáàâãéèêíìîóòôõúùûüçñ';
const DIGITS = '0123456789';
const SYMBOLS_POOL = '@#$%&*()+=<>|~^¨_';
const PUNCT = '.,;:?!\'"-/\\';

export function buildAllowedChars(charset) {
  const s = new Set([' ']);
  const c = charset || { letras: true };
  if (c.letras)    for (const ch of LETTERS) s.add(ch);
  if (c.numeros)   for (const ch of DIGITS) s.add(ch);
  if (c.simbolos)  for (const ch of SYMBOLS_POOL) s.add(ch);
  if (c.pontuacao) for (const ch of PUNCT) s.add(ch);
  return s;
}

const subscribers = new Set();
let batchScheduled = false;

function readState() {
  return skill.get().settings.charset;
}

function writeState(patch) {
  const s = skill.get();
  const next = { ...s.settings.charset, ...patch };
  s.settings.charset = next;
  skill.set(s);
  notify();
}

function notify() {
  if (batchScheduled) return;
  batchScheduled = true;
  queueMicrotask(() => {
    batchScheduled = false;
    const snapshot = get();
    for (const fn of subscribers) {
      try { fn(snapshot); } catch (e) { console.warn('charset subscriber threw', e); }
    }
  });
}

export function get() {
  const cs = readState();
  return {
    letras: !!cs.letras,
    numeros: !!cs.numeros,
    simbolos: !!cs.simbolos,
    pontuacao: !!cs.pontuacao,
    focus: Array.isArray(cs.focus) ? cs.focus.slice() : []
  };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function addFocus(ch) {
  if (!ch || typeof ch !== 'string') return;
  const c = ch[0];
  const cs = readState();
  const focus = Array.isArray(cs.focus) ? cs.focus.slice() : [];
  if (focus.includes(c)) return;
  focus.push(c);
  writeState({ focus });
  renderChips();
}

export function removeFocus(ch) {
  const cs = readState();
  const focus = (Array.isArray(cs.focus) ? cs.focus : []).filter(x => x !== ch);
  writeState({ focus });
  renderChips();
}

function renderChips() {
  const container = document.getElementById('focus-chips');
  if (!container) return;
  container.innerHTML = '';
  const cs = readState();
  for (const ch of (cs.focus || [])) {
    const chip = document.createElement('span');
    chip.className = 'td-focus-chip';
    chip.textContent = ch;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-focus-chip-x';
    btn.setAttribute('aria-label', 'remover');
    btn.textContent = '×';
    btn.addEventListener('click', () => removeFocus(ch));
    chip.appendChild(btn);
    container.appendChild(chip);
  }
}

function syncToggles() {
  const cs = readState();
  const toggles = document.querySelectorAll('.td-toggle[data-charset]');
  for (const t of toggles) {
    const key = t.getAttribute('data-charset');
    t.setAttribute('aria-pressed', cs[key] ? 'true' : 'false');
  }
}

export function init() {
  readState();
  syncToggles();
  renderChips();

  const toggles = document.querySelectorAll('.td-toggle[data-charset]');
  for (const t of toggles) {
    t.addEventListener('click', () => {
      const key = t.getAttribute('data-charset');
      const cs = readState();
      writeState({ [key]: !cs[key] });
      syncToggles();
    });
  }

  const focusInput = document.getElementById('focus-input');
  if (focusInput) {
    focusInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.preventDefault) e.preventDefault();
        const v = (focusInput.value || '').trim();
        if (v) addFocus(v[0]);
        focusInput.value = '';
      } else if (e.key === 'Backspace' && (focusInput.value || '') === '') {
        const cs = readState();
        const focus = cs.focus || [];
        if (focus.length) removeFocus(focus[focus.length - 1]);
      }
    });
  }
}
