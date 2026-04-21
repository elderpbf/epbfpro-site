// TypeDrill boot. Wires all modules and hands control to the engine.

import * as state from './state.js';
import * as skill from './skill.js';
import * as charset from './charset.js';
import * as session from './session.js';
import * as registry from './source-registry.js';
import * as progressView from './progress-view.js';
import * as engine from './engine.js';
import * as renderer from './renderer.js';
import * as stats from './stats.js';
import * as storage from './storage.js';
import * as sounds from './sounds.js';

import * as symbolsSource from './sources/symbols.js';
import * as commonSource from './sources/common.js';
import * as customSource from './sources/custom.js';
import * as weaknessSource from './sources/weakness.js';
import * as aiSource from './sources/ai.js';
import * as guidedSource from './sources/guided.js';
import * as numbersSource from './sources/numbers.js';

import { WORDS } from './data/pt-br-1000.js';
import { LAYOUT } from './data/abnt2-layout.js';
import { SYMBOLS } from './data/abnt2-symbols.js';

// Shell-level event wiring: paste block + body-click focus restore.
function wireShell() {
  const input = document.getElementById('input');
  input.addEventListener('paste', e => e.preventDefault());
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('button, input, textarea, select, a, [contenteditable]')) return;
    input.focus();
  });
}

// Auth guard (provided by ../js/auth.js, loaded before this module).
window.BS_AUTH.guard();
window.BS_AUTH.clearPasswordInputs();

// Topbar (provided by ../js/backstage-topbar.js) + settings drawer section.
window.Topbar.init({
  title: 'TypeDrill',
  backLink: '../',
  sections: [buildTypeDrillSection()]
});

function buildTypeDrillSection() {
  const s = skill.get();
  const targetWpm = s.targetWpm || 35;
  const wordsPerLesson = (s.settings && s.settings.wordsPerLesson) || 30;
  const repeatWord = (s.settings && s.settings.repeatWord) || 1;
  const content =
    '<div class="bs-field">' +
      '<label for="td-target-wpm">Meta de cpm</label>' +
      '<input id="td-target-wpm" type="number" min="10" max="200" value="' + targetWpm + '">' +
    '</div>' +
    '<div class="bs-field">' +
      '<label for="td-words-per-lesson">Palavras por lição</label>' +
      '<input id="td-words-per-lesson" type="number" min="5" max="200" value="' + wordsPerLesson + '">' +
    '</div>' +
    '<div class="bs-field">' +
      '<label for="td-repeat-word">Repetir palavra</label>' +
      '<input id="td-repeat-word" type="number" min="1" max="10" value="' + repeatWord + '">' +
    '</div>' +
    '<button id="td-reset-progress" class="bs-toggle-btn" type="button">Apagar progresso</button>';
  return { id: 'typedrill', title: 'TypeDrill', content, onInit: wireSettings };
}

function wireSettings() {
  const tWpm = document.getElementById('td-target-wpm');
  const wpl = document.getElementById('td-words-per-lesson');
  const rep = document.getElementById('td-repeat-word');
  const reset = document.getElementById('td-reset-progress');

  if (tWpm) tWpm.addEventListener('change', () => {
    const st = skill.get();
    st.targetWpm = Math.max(10, Math.min(200, Number(tWpm.value) || 35));
    skill.set(st);
    session.regenerate();
  });
  if (wpl) wpl.addEventListener('change', () => {
    const st = skill.get();
    st.settings.wordsPerLesson = Math.max(5, Math.min(200, Number(wpl.value) || 30));
    skill.set(st);
    session.regenerate();
  });
  if (rep) rep.addEventListener('change', () => {
    const st = skill.get();
    st.settings.repeatWord = Math.max(1, Math.min(10, Number(rep.value) || 1));
    skill.set(st);
    session.regenerate();
  });
  if (reset) reset.addEventListener('click', () => {
    if (confirm('Apagar todo o progresso registrado?')) {
      skill.resetProgress();
      charset.init();
      session.regenerate();
    }
  });
}

// Shell-level DOM wiring (paste block, focus restore).
wireShell();

// Charset bar (toggles + focus chips) -- reads/writes skill.js settings.
charset.init();

// === Session wiring (1H) ===
const sourceRowEl = document.getElementById('source-row');
const optionsBandEl = document.getElementById('source-options');
const targetEl = document.getElementById('target');
const inputEl = document.getElementById('input');

function repaint() {
  const line = session.currentLine();
  renderer.paint(targetEl, line, inputEl.value, skill.get().settings);
}

function renderSourceRow() {
  sourceRowEl.innerHTML = '';
  for (const entry of registry.list()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'td-source-card';
    card.textContent = entry.label;
    card.setAttribute('data-source-id', entry.id);
    card.setAttribute('aria-pressed', entry.id === session.getActiveSource() ? 'true' : 'false');
    card.addEventListener('click', () => session.setActiveSource(entry.id));
    sourceRowEl.appendChild(card);
  }
}

function syncSourceRow(activeId) {
  const row = sourceRowEl.querySelectorAll('.td-source-card');
  for (const el of row) {
    el.setAttribute('aria-pressed', el.getAttribute('data-source-id') === activeId ? 'true' : 'false');
  }
}

function renderOptionsBand() {
  const id = session.getActiveSource();
  const entry = registry.get(id);
  optionsBandEl.hidden = false;
  optionsBandEl.innerHTML = '';
  if (!entry || typeof entry.renderOptions !== 'function') {
    const empty = document.createElement('p');
    empty.className = 'td-source-options-empty';
    empty.textContent = 'sem opções para esta fonte';
    optionsBandEl.appendChild(empty);
    return;
  }
  entry.renderOptions(
    optionsBandEl,
    session.getOptions(id),
    (patch) => session.setOptions(id, patch)
  );
}

let lastSourceId = null;
session.subscribe((snap) => {
  if (snap.activeId !== lastSourceId) {
    stats.startSession();
    lastSourceId = snap.activeId;
    syncSourceRow(snap.activeId);
    renderOptionsBand();
  }
  inputEl.value = '';
  engine.setTarget(snap.line);
  stats.startLine();
  repaint();
});

engine.attach({
  inputEl,
  onKeystroke: (ev) => {
    if (ev) stats.recordChar(ev.wasCorrect !== false);
    repaint();
  },
  onLineComplete: () => session.nextLine(),
  onWrongShift: () => {}
});

renderSourceRow();
session.init();
progressView.init('#progress-btn');
inputEl.focus();

// Dev inspection handle. Not used by app logic.
window.__TD__ = {
  state,
  skill,
  charset,
  session,
  registry,
  progressView,
  engine,
  renderer,
  stats,
  storage,
  sounds,
  sources: {
    symbols: symbolsSource,
    common: commonSource,
    custom: customSource,
    weakness: weaknessSource,
    ai: aiSource,
    guided: guidedSource,
    numbers: numbersSource
  },
  data: { WORDS, LAYOUT, SYMBOLS }
};

console.debug('typedrill boot: all modules wired');
