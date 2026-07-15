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

// PURE. Sort tarefas by aula ascending (course order, matching the Aulas timeline); an unbound
// tarefa (aula_number null) sorts last. Returns a copy.
export function sortByAula(tarefas) {
  return (tarefas || []).slice().sort((a, b) => {
    const an = a.aula_number, bn = b.aula_number;
    if (an == null && bn == null) return 0;
    if (an == null) return 1;
    if (bn == null) return -1;
    return an - bn;
  });
}

// PURE. True when at least one aula holds more than one tarefa. This is the trigger (Élder) for
// switching from a plain flat list to status sections: don't add section headers until an aula
// has real volume, otherwise they are just noise over single cards.
export function anyAulaHasMultiple(tarefas) {
  const counts = new Map();
  (tarefas || []).forEach((tf) => {
    const k = tf.aula_number == null ? 'null' : tf.aula_number;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  for (const n of counts.values()) if (n > 1) return true;
  return false;
}

// PURE. Partition into the three status sections in action-first order (pending, then submitted,
// then reviewed), each sorted by aula ascending. Empty sections are dropped.
const STATUS_ORDER = ['a_enviar', 'enviada', 'corrigida'];
export function statusGroups(tarefas) {
  return STATUS_ORDER
    .map((status) => ({ status, tarefas: sortByAula((tarefas || []).filter((tf) => tf.state === status)) }))
    .filter((g) => g.tarefas.length);
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
let _pendingFocus = null;

// Deep-focus from the notification bell (the mirror of forum.js focusThread): land ON the
// tarefa the professor answered, already expanded, instead of dumping the student on the tab
// to hunt for it. The bell usually fires from ANOTHER tab, so this tab has not mounted or
// finished its async load yet: the request is REMEMBERED and applied when the list paints,
// never consumed against an empty list. That async-load race is exactly what broke the admin
// deep-link (track-26 1.d) — same shape, same fix.
export function focusTarefa(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id)) return;
  _openId = id;          // survives the load: cardHtml expands this id whenever it paints
  _pendingFocus = id;    // one-shot: scroll on the next paint only, not on every toggle
  if (_root && _tarefas.length) paintList();   // already loaded (student was on the tab)
}

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

function statusLabel(status) {
  if (status === 'a_enviar') return t('tarefas.section_pending');
  if (status === 'enviada') return t('tarefas.section_sent');
  return t('tarefas.section_graded');
}

function paintList() {
  if (!_tarefas.length) {
    _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('tarefas.empty')) + '</div>';
    return;
  }
  const aulas = (state.data || {}).aulas || [];
  const pending = _tarefas.filter((tf) => tf.state === 'a_enviar').length;
  let html = '<div class="cdx-tt-wrap">';
  html += '<div class="cdx-tt-head"><h2 class="cdx-tt-count">' + esc(countLabel(_tarefas.length)) + '</h2>';
  if (pending) html += '<span class="cdx-tt-pending-pill">' + pending + ' ' + esc(t('tarefas.pending_suffix')) + '</span>';
  html += '</div>';
  if (anyAulaHasMultiple(_tarefas)) {
    // Enough volume: group into status sections (pending first), each in course order.
    statusGroups(_tarefas).forEach((g) => {
      html += '<div class="cdx-tt-section"><div class="cdx-tt-section-label">' + esc(statusLabel(g.status)) +
        '<span class="cdx-tt-section-count">' + g.tarefas.length + '</span></div>';
      g.tarefas.forEach((tf) => { html += cardHtml(tf, aulas); });
      html += '</div>';
    });
  } else {
    // Few tarefas: a plain flat list in course order, no section headers (Élder).
    sortByAula(_tarefas).forEach((tf) => { html += cardHtml(tf, aulas); });
  }
  html += '</div>';
  _root.innerHTML = html;
  wireList();
  // Consume a pending bell focus: the card is already expanded (_openId), just bring it into
  // view. One-shot, so a later manual toggle never yanks the page around.
  if (_pendingFocus != null) {
    const card = _root.querySelector('[data-tt-card="' + _pendingFocus + '"]');
    _pendingFocus = null;
    if (card && card.scrollIntoView) {
      try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (_) { card.scrollIntoView(); }   // older engines: no options object
    }
  }
}

// One definition of "this card opens", used by both the markup and the click handler, so they
// can never disagree about which cards are interactive.
export function isExpandable(tarefa) {
  if (tarefa.state === 'a_enviar') return false;         // that click submits, it doesn't expand
  return tarefa.state === 'corrigida' || !!tarefa.allow_multi;
}

function badgeHtml(tarefa) {
  if (tarefa.state === 'corrigida') return '<span class="cdx-tt-badge cdx-tt-badge--graded">' + esc(t('tarefas.badge_graded')) + '</span>';
  if (tarefa.state === 'enviada') return '<span class="cdx-tt-badge cdx-tt-badge--sent">' + esc(t('tarefas.badge_sent')) + '</span>';
  return '<span class="cdx-tt-badge cdx-tt-badge--pending">' + esc(t('tarefas.badge_pending')) + '</span>';
}

function subHtml(tarefa, open) {
  if (tarefa.state === 'corrigida') return open ? t('tarefas.sub_graded_open') : t('tarefas.sub_graded_closed');
  // "aguardando correção" reads as a dead end, which is right for a single-delivery tarefa but
  // would hide the affordance on a multi one: say it can be tapped.
  if (tarefa.state === 'enviada') return tarefa.allow_multi && !open ? t('tarefas.sub_sent_multi') : t('tarefas.sub_sent');
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
    // A resposta SEM nota é uma resposta, não uma nota. Rotulá-la "Nota" (o que esta
    // branch fazia) confunde justamente o caso do toggle "resposta" ligado sozinho, que
    // é o mais comum. Com nota, a resposta segue como a nota do lado (branch acima).
    html += '<div class="cdx-tt-field"><div class="cdx-tt-fl">' + esc(t('tarefas.field_reply')) + '</div>' +
      '<div class="cdx-tt-fv">' + esc(sub.instructor_reply) + '</div></div>';
  }
  if (!(tarefa.reply_enabled && tarefa.grade_enabled)) {
    html += '<div class="cdx-tt-gate">' + esc(t('tarefas.gate_note')) + '</div>';
  }
  // The teacher opted THIS tarefa into multiple deliveries, so sending again is allowed and the
  // earlier answers are kept. Only offered here, inside the card the student already opened to
  // review what they sent — never on a single-delivery tarefa, where the worker would refuse it.
  if (tarefa.allow_multi) {
    html += '<button type="button" class="cdx-tt-again" data-tt-again="' + tarefa.item_id + '">' +
      esc(t('tarefas.send_another')) + '</button>';
  }
  html += '</div>';
  return html;
}

function cardHtml(tarefa, aulas) {
  const open = _openId === tarefa.item_id;
  // A sent tarefa is normally a dead end: nothing to see until it is graded. With multiple
  // deliveries on, it opens too, so the student can re-read their answer and send another.
  const expandable = isExpandable(tarefa);
  return '<div class="cdx-tt-card' + (open ? ' cdx-tt-card--open' : '') + '" data-tt-card="' + tarefa.item_id + '">' +
    '<div class="cdx-tt-top"' + (tarefa.state === 'a_enviar' || expandable ? ' data-tt-open="' + tarefa.item_id + '"' : '') + '>' +
      '<div class="cdx-tt-info">' +
        '<div class="cdx-tt-aula">' + esc(aulaLabel(tarefa.aula_number, aulas || [])) + '</div>' +
        '<div class="cdx-tt-title">' + esc(tarefa.title) + '</div>' +
        '<div class="cdx-tt-sub">' + esc(subHtml(tarefa, open)) + '</div>' +
      '</div>' +
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
      if (isExpandable(tarefa)) { _openId = (_openId === id) ? null : id; paintList(); }
    });
  });
  _root.querySelectorAll('[data-tt-again]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();                       // the card head toggles; this must not collapse it
      const id = parseInt(btn.getAttribute('data-tt-again'), 10);
      const tarefa = _tarefas.find((tf) => tf.item_id === id);
      if (tarefa) openSubmit(tarefa);
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
  const participant = (state.data || {}).participant || {};
  openTarefaSubmitModal({
    item,
    clientSlug: state.clientSlug,
    turmaSlug: state.turmaSlug,
    token: state.token,
    sessionToken: state.sessionToken,
    participantName: participant.display_name || participant.name || '', // logged-in: drops the name field
    onSubmitted: () => renderMyTarefas(_outerRoot),
  });
}

registerRenderer('tarefas', renderMyTarefas);
