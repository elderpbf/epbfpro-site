// TypeDrill progress drawer. Lists chars with >= 10 attempts sorted by
// weakness (score = (1 - acc) * (targetWpm / max(lastWpm, 1))). Shares
// `skill.resetProgress` with the settings drawer (1L).

import * as skill from './skill.js';

let overlayEl = null;
let drawerEl = null;
let bodyEl = null;
let footerEl = null;

export function init(buttonSelector) {
  buildDom();
  if (buttonSelector) {
    const btn = document.querySelector(buttonSelector);
    if (btn) btn.addEventListener('click', open);
  }
  if (overlayEl) overlayEl.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerEl && !drawerEl.hidden) close();
  });
}

function buildDom() {
  overlayEl = document.createElement('div');
  overlayEl.className = 'td-drawer-overlay';
  overlayEl.hidden = true;
  document.body.appendChild(overlayEl);

  drawerEl = document.createElement('aside');
  drawerEl.className = 'td-drawer';
  drawerEl.hidden = true;
  drawerEl.setAttribute('role', 'dialog');
  drawerEl.setAttribute('aria-label', 'Progresso');

  const header = document.createElement('header');
  header.className = 'td-drawer-header';
  const h2 = document.createElement('h2');
  h2.textContent = 'Progresso';
  header.appendChild(h2);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'td-drawer-close';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);
  header.appendChild(closeBtn);
  drawerEl.appendChild(header);

  bodyEl = document.createElement('div');
  bodyEl.className = 'td-drawer-body';
  drawerEl.appendChild(bodyEl);

  footerEl = document.createElement('footer');
  footerEl.className = 'td-drawer-footer';
  drawerEl.appendChild(footerEl);

  document.body.appendChild(drawerEl);
}

export function open() {
  render();
  if (overlayEl) overlayEl.hidden = false;
  if (drawerEl) drawerEl.hidden = false;
}

export function close() {
  if (overlayEl) overlayEl.hidden = true;
  if (drawerEl) drawerEl.hidden = true;
}

export function render() {
  if (!bodyEl || !footerEl) return;
  const s = skill.get();
  const charStats = s.charStats || {};
  const target = s.targetWpm || 35;

  const rows = [];
  for (const [ch, cs] of Object.entries(charStats)) {
    if (!cs || cs.attempts < 10) continue;
    const acc = (cs.attempts - cs.errors) / cs.attempts;
    const lastWpm = cs.lastWpm || 0;
    const score = (1 - acc) * (target / Math.max(lastWpm, 1));
    rows.push({ ch, attempts: cs.attempts, acc, lastWpm, score });
  }
  rows.sort((a, b) => b.score - a.score);

  bodyEl.innerHTML = '';
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'td-drawer-empty';
    empty.textContent = 'Nenhum caractere com 10 tentativas ou mais ainda.';
    bodyEl.appendChild(empty);
  } else {
    for (const r of rows) {
      bodyEl.appendChild(buildRow(r));
    }
  }

  footerEl.innerHTML = '';
  const sessionsList = s.sessions || [];
  const minutes = Math.round(sessionsList.reduce((sum, x) => sum + (x.duration || 0), 0) / 60000);
  const meta = document.createElement('div');
  meta.className = 'td-drawer-meta';
  meta.textContent = sessionsList.length + ' sessões · ' + minutes + ' min';
  footerEl.appendChild(meta);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.id = 'td-progress-reset';
  resetBtn.className = 'td-drawer-reset';
  resetBtn.textContent = 'Apagar progresso';
  resetBtn.addEventListener('click', () => {
    if (confirm('Apagar todo o progresso registrado?')) {
      skill.resetProgress();
      render();
    }
  });
  footerEl.appendChild(resetBtn);
}

function buildRow(r) {
  const row = document.createElement('div');
  row.className = 'td-progress-row';
  row.setAttribute('data-char', r.ch);

  const chCell = document.createElement('span');
  chCell.className = 'td-progress-char';
  chCell.textContent = r.ch;
  row.appendChild(chCell);

  const att = document.createElement('span');
  att.className = 'td-progress-attempts';
  att.textContent = String(r.attempts);
  row.appendChild(att);

  const bar = document.createElement('div');
  bar.className = 'td-acc-bar';
  const fill = document.createElement('div');
  fill.className = 'td-acc-bar-fill';
  fill.style.width = Math.round(r.acc * 100) + '%';
  bar.appendChild(fill);
  row.appendChild(bar);

  const wpm = document.createElement('span');
  wpm.className = 'td-progress-wpm';
  wpm.textContent = r.lastWpm ? (r.lastWpm + ' cpm') : '--';
  row.appendChild(wpm);

  return row;
}
