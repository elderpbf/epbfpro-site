// codex/trilha/js/tarefas.js
// Tarefas tab (track-26 item 2): the student's own revealed tarefas, grouped by aula, each
// showing its state (a_enviar / enviada / corrigida), including the reply/grade once the
// instructor's per-tarefa toggle allows it. Session-gated like the Fórum tab. Card markup/tokens
// are a verbatim /port of the chosen "flutuante" mock (backstage/mocks/trilha-tabs/b2.html); the
// backend (ct_list_my_tarefas) already strips reply/grade when their toggle is off, so this
// module never has to re-derive that gate, it only ever renders what it was handed.
import { state } from './state.js';
import { esc } from './utils.js';
import { trail } from './api.js';
import { t } from '../i18n.js';
import { registerRenderer } from './page.js';
import { openTarefaSubmitModal } from './tarefa-submit-modal.js';

// ── Pure helpers (tested) ────────────────────────────────────────────────────

export function aulaLabel(aulaNumber, aulas) {
  if (aulaNumber == null) return t('tarefas.no_aula');
  const a = (aulas || []).find((x) => x.aula_number === aulaNumber);
  return 'Aula ' + aulaNumber + (a && a.title ? ' · ' + a.title : '');
}

export function countLabel(n) {
  return n + ' ' + (n === 1 ? t('tarefas.one') : t('tarefas.many'));
}

// Group tarefas by aula_number, most recent aula first; unbound (null) last.
export function groupByAula(tarefas) {
  const nums = [];
  const byNum = new Map();
  (tarefas || []).forEach((tf) => {
    const key = tf.aula_number == null ? null : tf.aula_number;
    if (!byNum.has(key)) { byNum.set(key, []); nums.push(key); }
    byNum.get(key).push(tf);
  });
  nums.sort((a, b) => {
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  });
  return nums.map((n) => ({ aulaNumber: n, tarefas: byNum.get(n) }));
}

// PURE. answer_json is always a JSON-encoded value (string | object); render it as text.
export function answerText(sub) {
  if (!sub) return '';
  let v;
  try { v = JSON.parse(sub.answer_json); } catch (_) { return String(sub.answer_json || ''); }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// ── DOM ──────────────────────────────────────────────────────────────────────

let _outerRoot = null;
let _root = null;
let _tarefas = [];
let _openId = null;

export async function renderMyTarefas(root) {
  _outerRoot = root;
  _root = root.querySelector('#cdx-tr-tarefas-root') || root;
  if (!state.sessionToken) {
    _root.innerHTML = '<div class="cdx-tt-login"><p>' + esc(t('tarefas.login_cta')) + '</p></div>';
    return;
  }
  _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('page.loading')) + '</div>';
  try {
    const res = await trail.myTarefas({
      client_slug: state.clientSlug, turma_slug: state.turmaSlug, session_token: state.sessionToken, _silent: true,
    });
    _tarefas = (res && res.tarefas) || [];
  } catch (e) {
    if (window.bsLog) window.bsLog('tarefas myTarefas: ' + (e && e.message || e), 'error');
    _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('tarefas.load_error')) + '</div>';
    return;
  }
  paintList();
}

function paintList() {
  if (!_tarefas.length) {
    _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('tarefas.empty')) + '</div>';
    return;
  }
  const pending = _tarefas.filter((tf) => tf.state === 'a_enviar').length;
  const groups = groupByAula(_tarefas);
  let html = '<div class="cdx-tt-wrap">';
  html += '<div class="cdx-tt-head"><h2 class="cdx-tt-count">' + esc(countLabel(_tarefas.length)) + '</h2>';
  if (pending) html += '<span class="cdx-tt-pending-pill">' + pending + ' ' + esc(t('tarefas.pending_suffix')) + '</span>';
  html += '</div>';
  const aulas = (state.data || {}).aulas || [];
  groups.forEach((g) => {
    html += '<div class="cdx-tt-group"><div class="cdx-tt-group-label">' + esc(aulaLabel(g.aulaNumber, aulas)) + '</div>';
    g.tarefas.forEach((tf) => { html += cardHtml(tf); });
    html += '</div>';
  });
  html += '</div>';
  _root.innerHTML = html;
  wireList();
}

function badgeHtml(tarefa) {
  if (tarefa.state === 'corrigida') return '<span class="cdx-tt-badge cdx-tt-badge--graded">' + esc(t('tarefas.badge_graded')) + '</span>';
  if (tarefa.state === 'enviada') return '<span class="cdx-tt-badge cdx-tt-badge--sent">' + esc(t('tarefas.badge_sent')) + '</span>';
  return '<span class="cdx-tt-badge cdx-tt-badge--pending">' + esc(t('tarefas.badge_pending')) + '</span>';
}

function subHtml(tarefa, open) {
  if (tarefa.state === 'corrigida') return open ? t('tarefas.sub_graded_open') : t('tarefas.sub_graded_closed');
  if (tarefa.state === 'enviada') return t('tarefas.sub_sent');
  return t('tarefas.sub_pending');
}

function bodyHtml(tarefa) {
  const sub = tarefa.submission;
  let html = '<div class="cdx-tt-body">';
  html += '<div class="cdx-tt-field"><div class="cdx-tt-fl">' + esc(t('tarefas.field_answer')) + '</div>' +
    '<div class="cdx-tt-fv">' + esc(answerText(sub)) + '</div></div>';
  if (sub.grade) {
    html += '<div class="cdx-tt-field"><div class="cdx-tt-fl">' + esc(t('tarefas.field_grade')) + '</div>' +
      '<div class="cdx-tt-grade"><span class="cdx-tt-grade-num">' + esc(sub.grade) + '</span>' +
      (sub.instructor_reply ? '<span class="cdx-tt-grade-note">' + esc(sub.instructor_reply) + '</span>' : '') +
      '</div></div>';
  } else if (sub.instructor_reply) {
    html += '<div class="cdx-tt-field"><div class="cdx-tt-fl">' + esc(t('tarefas.field_grade')) + '</div>' +
      '<div class="cdx-tt-fv">' + esc(sub.instructor_reply) + '</div></div>';
  }
  if (!(tarefa.reply_enabled && tarefa.grade_enabled)) {
    html += '<div class="cdx-tt-gate">' + esc(t('tarefas.gate_note')) + '</div>';
  }
  html += '</div>';
  return html;
}

function cardHtml(tarefa) {
  const open = _openId === tarefa.item_id;
  const expandable = tarefa.state === 'corrigida';
  return '<div class="cdx-tt-card' + (open ? ' cdx-tt-card--open' : '') + '" data-tt-card="' + tarefa.item_id + '">' +
    '<div class="cdx-tt-top"' + (tarefa.state !== 'enviada' ? ' data-tt-open="' + tarefa.item_id + '"' : '') + '>' +
      '<div class="cdx-tt-info"><div class="cdx-tt-title">' + esc(tarefa.title) + '</div>' +
      '<div class="cdx-tt-sub">' + esc(subHtml(tarefa, open)) + '</div></div>' +
      badgeHtml(tarefa) +
    '</div>' +
    (open && expandable ? bodyHtml(tarefa) : '') +
  '</div>';
}

function wireList() {
  _root.querySelectorAll('[data-tt-open]').forEach((top) => {
    top.addEventListener('click', () => {
      const id = parseInt(top.getAttribute('data-tt-open'), 10);
      const tarefa = _tarefas.find((tf) => tf.item_id === id);
      if (!tarefa) return;
      if (tarefa.state === 'a_enviar') { openSubmit(tarefa); return; }
      if (tarefa.state === 'corrigida') { _openId = (_openId === id) ? null : id; paintList(); }
    });
  });
}

async function openSubmit(tarefa) {
  let item;
  try {
    const res = await trail.itemPublic({
      client_slug: state.clientSlug, turma_slug: state.turmaSlug, token: state.token,
      item_id: tarefa.item_id, session_token: state.sessionToken, _silent: true,
    });
    item = res && res.item;
  } catch (e) {
    if (window.bsLog) window.bsLog('tarefas openSubmit itemPublic: ' + (e && e.message || e), 'error');
    return;
  }
  if (!item) return;
  openTarefaSubmitModal({
    item,
    clientSlug: state.clientSlug,
    turmaSlug: state.turmaSlug,
    token: state.token,
    sessionToken: state.sessionToken,
    onSubmitted: () => renderMyTarefas(_outerRoot),
  });
}

registerRenderer('tarefas', renderMyTarefas);
