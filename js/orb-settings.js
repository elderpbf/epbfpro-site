// js/orb-settings.js — dev-only orb tuning, persisted to localStorage.
// getSettings() always returns the live values (defaults when no dev panel),
// so orb.js works with or without the panel mounted.
// Enable dev mode: Ctrl+Shift+O, or visit with #orb, or set localStorage.plp_dev='1'.
const KEY = 'plp_orb', DEV = 'plp_dev';

const DEFAULTS = {
  easeFree: 0.035, easeLock: 0.11, easeFollow: 0.12, easeApproach: 0.06, easeArmed: 0.08,
  wanderX: 0.20, wanderXCap: 200, wanderFreq: 0.00075, wanderY: 30, wanderYFreq: 0.0015,
  wobble: 7, lockBand: 0.30, glowBand: 0.26, focus: 0.50, armAt: 0.78, finale: 'iris'
};

function load() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch (e) { return { ...DEFAULTS }; }
}
let state = load();
const listeners = [];
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function emit() { listeners.forEach(fn => fn(state)); }

export function getSettings() { return state; }
export function onSettings(fn) { listeners.push(fn); }
function set(k, v) { state[k] = v; persist(); emit(); }
function reset() { state = { ...DEFAULTS }; persist(); emit(); }

// [key, label, min, max, step] — the sliders exposed in the panel
const SLIDERS = [
  ['easeFree', 'Velocidade ao vaguear', 0.01, 0.12, 0.005],
  ['easeLock', 'Encaixe no destaque', 0.05, 0.30, 0.01],
  ['wanderX', 'Largura do vaguear', 0.05, 0.40, 0.01],
  ['wanderFreq', 'Ritmo do vaguear', 0.0003, 0.002, 0.00005],
  ['wobble', 'Wobble', 0, 20, 1],
  ['armAt', 'Revelar contatos (cedo→tarde)', 0.5, 1.0, 0.02]
];

function buildPanel() {
  if (document.querySelector('.plp-orb-fab')) return;
  const fab = document.createElement('button');
  fab.className = 'plp-orb-fab plp-dev-only'; fab.type = 'button';
  fab.title = 'Orbe · ajustes (dev)'; fab.textContent = '✦';
  const panel = document.createElement('div');
  panel.className = 'plp-orb-panel plp-dev-only';
  panel.innerHTML =
    '<h4>Orbe · ajustes</h4>' +
    '<div class="plp-orb-note">dev local (localStorage); Ctrl+Shift+O para sair</div>' +
    SLIDERS.map(([k, lbl, mn, mx, st]) =>
      `<div class="plp-orb-row"><label>${lbl}<b data-v="${k}"></b></label>` +
      `<input type="range" data-k="${k}" min="${mn}" max="${mx}" step="${st}"></div>`).join('') +
    '<div class="plp-orb-row"><label>Finale</label><div class="plp-orb-seg">' +
    '<button type="button" data-fin="iris" aria-pressed="false">Íris</button>' +
    '<button type="button" data-fin="part" aria-pressed="false">Partículas</button></div></div>' +
    '<div class="plp-orb-actions"><button type="button" data-act="reset">Reset</button>' +
    '<button type="button" data-act="off">Sair do dev</button></div>';
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  fab.addEventListener('click', () => panel.classList.toggle('plp-open'));
  panel.querySelectorAll('input[type=range]').forEach(inp =>
    inp.addEventListener('input', () => set(inp.dataset.k, parseFloat(inp.value))));
  panel.querySelectorAll('[data-fin]').forEach(b =>
    b.addEventListener('click', () => set('finale', b.dataset.fin)));
  panel.querySelector('[data-act=reset]').addEventListener('click', reset);
  panel.querySelector('[data-act=off]').addEventListener('click', () => {
    localStorage.removeItem(DEV); fab.remove(); panel.remove();
  });

  const sync = () => {
    panel.querySelectorAll('input[type=range]').forEach(inp => {
      const k = inp.dataset.k; inp.value = state[k];
      const b = panel.querySelector(`b[data-v="${k}"]`); if (b) b.textContent = String(+state[k]);
    });
    panel.querySelectorAll('[data-fin]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.fin === state.finale));
  };
  onSettings(sync); sync();
}

function removePanel() {
  const f = document.querySelector('.plp-orb-fab'), p = document.querySelector('.plp-orb-panel');
  if (f) f.remove(); if (p) p.remove();
}

export function initOrbSettings() {
  if (location.hash === '#orb') { try { localStorage.setItem(DEV, '1'); } catch (e) {} }
  addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
      e.preventDefault();
      if (localStorage.getItem(DEV) === '1') { localStorage.removeItem(DEV); removePanel(); }
      else { try { localStorage.setItem(DEV, '1'); } catch (err) {} buildPanel(); }
    }
  });
  if (localStorage.getItem(DEV) === '1') buildPanel();
}
