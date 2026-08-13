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
import { glyphSvg } from '../../js/glyphs.js';   // the glyph library: no new icons here
import { stampTime } from '../../js/rel-time.js';
import { wireClamps } from '../../js/clamp.js';

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

// PURE. answer_json is a JSON-encoded value. The tarefa-fields registry writes a PAYLOAD OBJECT
// ({ text: '...' } for the text field), so stringifying anything non-string dumped the raw JSON
// onto the student's own screen — `{"text":"test"}` instead of `test`. Élder saw it on 2026-07-15;
// it was live. Plain strings still work: the open/anonymous path predates the registry.
export function answerText(sub) {
  if (!sub) return '';
  let v;
  try { v = JSON.parse(sub.answer_json); } catch (_) { return String(sub.answer_json || ''); }
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.text === 'string') return v.text;
  return JSON.stringify(v);
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

// PURE. Every delivery the student made, newest first. `submissions` is the worker's list;
// `submission` (singular, the most recent) is the older shape, kept so this tab still renders
// correctly against a Worker that has not been promoted yet.
export function deliveries(tarefa) {
  if (tarefa && tarefa.submissions && tarefa.submissions.length) return tarefa.submissions;
  return (tarefa && tarefa.submission) ? [tarefa.submission] : [];
}

// PURE. THE state of a tarefa card, and the single source for its tag, its glyph and whether
// the tag sends. It describes what the STUDENT did, and nothing else (Élder 2026-07-15):
//   nao_respondida -> nothing sent yet          -> tag sends (first answer)
//   respondida     -> sent, teacher closed it   -> done, checkmark
//   de_novo        -> sent, teacher left it open -> tag sends again
// The instructor's reply is deliberately ABSENT here: it is a MESSAGE, not a state of the
// delivery, and mixing the two is what made "Corrigida"/"Respondida" impossible to name
// ("respondida por quem?").
export function tarefaKind(tarefa) {
  if (!deliveries(tarefa).length) return 'nao_respondida';
  return tarefa.allow_multi ? 'de_novo' : 'respondida';
}

// PURE. Can the student send right now? Both the "answer" and the "answer again" cases.
export function canSend(tarefa) {
  const k = tarefaKind(tarefa);
  return k === 'nao_respondida' || k === 'de_novo';
}

// One definition of "this card opens", used by both the markup and the click handler, so they
// can never disagree about which cards are interactive. Anything already delivered opens: the
// student must always be able to re-read what they sent and what the teacher said. Tying this
// to allow_multi (as it briefly was) hid the teacher's own reply the moment the teacher closed
// the tarefa, which is exactly backwards.
export function isExpandable(tarefa) {
  return deliveries(tarefa).length > 0;
}

// PURE. Fill a {placeholder} template from the dictionary. Via a replacer FUNCTION on purpose:
// a student named with a `$&` in it would otherwise be spliced back into the string by
// String.replace's own substitution syntax.
export function fill(tpl, map) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) =>
    (Object.prototype.hasOwnProperty.call(map || {}, k) ? String(map[k]) : m));
}

// PURE. Who made this delivery. An anonymous delivery has no name BECAUSE THE STUDENT CHOSE
// SO, so the absence is the fact to render ("Anônimo") — never a hole to quietly patch with
// the logged-in identity we happen to be holding.
export function deliveryWho(sub) {
  return (sub && sub.student_name) ? sub.student_name : t('tarefas.anonymous');
}

const KIND_TAG = {
  nao_respondida: { label: 'tarefas.badge_unanswered', glyph: 'send',         cls: 'pending' },
  respondida:     { label: 'tarefas.badge_answered',   glyph: 'check-circle', cls: 'done' },
  de_novo:        { label: 'tarefas.badge_again',      glyph: 'send',         cls: 'again' },
};

// The tag IS the button (Élder: "o botão embaixo é desnecessário, a tag em cima já é o botão").
// When it sends, it is a real <button>; when it does not, it is inert text.
//
// It says what it DOES, not what the tarefa IS ("Responder", not "Não respondida"): a button
// labelled with a state is not an action, and the paper plane beside a state made no sense
// either. The state still has a home — the section header ("Não respondidas") — which is where
// a state belongs. The glyph comes AFTER the text (Élder): read the verb, then see the plane.
function badgeHtml(tarefa) {
  const def = KIND_TAG[tarefaKind(tarefa)];
  const icon = glyphSvg(def.glyph, { size: 14, cls: 'cdx-tt-badge-i' });
  const inner = '<span>' + esc(t(def.label)) + '</span>' + icon;
  if (!canSend(tarefa)) return '<span class="cdx-tt-badge cdx-tt-badge--' + def.cls + '">' + inner + '</span>';
  return '<button type="button" class="cdx-tt-badge cdx-tt-badge--' + def.cls + ' cdx-tt-badge--send" ' +
    'data-tt-send="' + tarefa.item_id + '">' + inner + '</button>';
}

// The teacher said something, on any delivery. A MESSAGE, not a correction (Élder: "mais
// didático e menos pressão"), so it sits BESIDE the delivery tag instead of replacing it.
function msgBadgeHtml(tarefa) {
  if (!tarefa.has_instructor_message) return '';
  return '<span class="cdx-tt-badge cdx-tt-badge--msg">' +
    glyphSvg('mail', { size: 14, cls: 'cdx-tt-badge-i' }) +
    '<span>' + esc(t('tarefas.badge_msg')) + '</span></span>';
}

// ONE delivery: what the student sent, and NESTED under it whatever the teacher said about
// THAT delivery. Nesting is the point (Élder: "senão parece que é IM") — a flat stream of
// answers and replies reads like a chat and loses which reply answers which answer.
//
// Every interaction is SIGNED and STAMPED — "de Fulano em 23/06/2026 às 12h26" (Élder
// 2026-07-15). Unsigned, a card with four blocks of text is a pile: the student cannot tell
// their second try from their first, nor their own words from the teacher's.
function deliveryHtml(sub, ordinal, total) {
  let html = '<li class="cdx-tt-delivery">';
  html += '<div class="cdx-tt-meta">';
  if (total > 1) html += '<span class="cdx-tt-dlabel">' + esc(fill(t('tarefas.delivery_n'), { n: ordinal })) + '</span>';
  html += '<span class="cdx-tt-by">' +
    esc(fill(t('tarefas.by_at'), { who: deliveryWho(sub), when: stampTime(sub.submitted_at) })) + '</span>';
  // Editable until the instructor replies (Élder 2026-07-15: "o aluno pode editar até eu
  // responder e pronto"). The SERVER decides (can_edit), never this tab: it's the same
  // column ct_edit_submission checks to accept an edit. The button lives on the entrega's
  // signature line, next to "de Fulano em ...": that's where it says whose it is and when,
  // so that's where you act on it.
  if (sub.can_edit) {
    html += '<button type="button" class="cdx-tt-edit" data-tt-edit="' + esc(sub.id) + '">' +
      esc(t('tarefas.edit')) + '</button>';
  }
  html += '</div>';
  html += '<div class="cdx-tt-fv" data-tt-text>' + esc(answerText(sub)) + '</div>';
  // The instructor's message. They sign as "Instrutor" (Élder), not by name: the student is
  // talking to the role.
  if (sub.instructor_reply) {
    html += '<div class="cdx-tt-reply">' +
      '<div class="cdx-tt-meta"><span class="cdx-tt-by">' +
        esc(fill(t('tarefas.msg_by_at'), { who: t('tarefas.instructor'), when: stampTime(sub.reply_at) })) +
      '</span></div>' +
      '<div class="cdx-tt-fv" data-tt-text>' + esc(sub.instructor_reply) + '</div>' +
    '</div>';
  }
  // The score lives OUTSIDE the message block (Élder 2026-07-15: "a nota não é mensagem do
  // professor, mensagem é só mensagem"). Inside it, an entrega with only a score drew a
  // "Mensagem do Instrutor em ..." that contained no message at all, just a number. They are
  // independent things, and each has its own place on the card.
  if (sub.grade) {
    html += '<div class="cdx-tt-grade">' +
      '<span class="cdx-tt-gl">' + esc(t('tarefas.grade_label')) + '</span>' +
      '<span class="cdx-tt-grade-num">' + esc(sub.grade) + '</span>' +
    '</div>';
  }
  return html + '</li>';
}

function bodyHtml(tarefa) {
  // EVERY delivery, newest first, not just the last one (Élder). The "enviar outra resposta"
  // button that used to live down here is gone: the tag in the head is the button now.
  const subs = deliveries(tarefa);
  const total = subs.length;
  return '<div class="cdx-tt-body"><ul class="cdx-tt-deliveries">' +
    subs.map((s, i) => deliveryHtml(s, total - i, total)).join('') +
    '</ul></div>';
}

function cardHtml(tarefa, aulas) {
  const open = _openId === tarefa.item_id;
  const expandable = isExpandable(tarefa);
  // The chevron lives to the LEFT of the card, vertically centered (Élder): there it points at
  // the CARD, which is what opens. On the right it competed with the action button for the
  // edge and became one more loose control. When there is nothing to open, the slot still
  // occupies the same width, otherwise the title of a card with no entrega would misalign
  // against every other one in the list.
  const chevron = expandable
    ? '<span class="cdx-tt-chev' + (open ? ' is-open' : '') + '">' + glyphSvg('chevron-down', { size: 18 }) + '</span>'
    : '<span class="cdx-tt-chev cdx-tt-chev--none"></span>';
  // ALL tags on the title row, the ACTION always last, on the right (Élder 2026-07-15):
  // [teacher message ✉] [reply ✈]. Fixed order, so the thumb learns ONE spot: the card's
  // right edge is always what does something, and what merely notifies never occupies that
  // spot. When they don't fit side by side, the WHOLE group wraps to the line below, right
  // aligned, the action stays last, which is what the rule calls for.
  return '<div class="cdx-tt-card' + (open ? ' cdx-tt-card--open' : '') + '" data-tt-card="' + tarefa.item_id + '">' +
    '<div class="cdx-tt-top"' + (expandable ? ' data-tt-open="' + tarefa.item_id + '"' : '') + '>' +
      chevron +
      '<div class="cdx-tt-info">' +
        '<div class="cdx-tt-aula">' + esc(aulaLabel(tarefa.aula_number, aulas || [])) + '</div>' +
        '<div class="cdx-tt-title">' + esc(tarefa.title) + '</div>' +
      '</div>' +
      '<div class="cdx-tt-tags">' + msgBadgeHtml(tarefa) + badgeHtml(tarefa) + '</div>' +
    '</div>' +
    (open && expandable ? bodyHtml(tarefa) : '') +
  '</div>';
}

function wireList() {
  // The head toggles. The tag sends. Two jobs, two targets, so tapping the tag never collapses
  // the card the student just opened.
  _root.querySelectorAll('[data-tt-open]').forEach((top) => {
    top.addEventListener('click', () => {
      const id = parseInt(top.getAttribute('data-tt-open'), 10);
      const tarefa = _tarefas.find((tf) => tf.item_id === id);
      if (!tarefa || !isExpandable(tarefa)) return;
      _openId = (_openId === id) ? null : id;
      paintList();
    });
  });
  _root.querySelectorAll('[data-tt-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();   // the button lives inside the open card's body
      openEdit(parseInt(btn.getAttribute('data-tt-edit'), 10));
    });
  });
  _root.querySelectorAll('[data-tt-send]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-tt-send'), 10);
      const tarefa = _tarefas.find((tf) => tf.item_id === id);
      if (tarefa) openSubmit(tarefa);
    });
  });
  // A long answer becomes a window, not a wall (Élder): the block closes at a readable height
  // and opens on tap. Only what REALLY overflows becomes clickable, the shared clamp is what
  // measures that.
  wireClamps(_root, '[data-tt-text]');
}

// The modal needs the ITEM (instructions + field type + whether it accepts anonymous), which
// the list doesn't load. One path for both verbs: what changes between answering and editing
// is `editing`.
async function openModal(tarefa, editing) {
  let item;
  try {
    const res = await trail.itemPublic({
      client_slug: state.clientSlug, turma_slug: state.turmaSlug, token: state.token,
      item_id: tarefa.item_id, session_token: state.sessionToken, _silent: true,
    });
    item = res && res.item;
  } catch (e) {
    if (window.bsLog) window.bsLog('tarefas openModal itemPublic: ' + (e && e.message || e), 'error');
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
    participantName: participant.name || '',   // ONE name (track-42); logged-in drops the name field
    editing,
    onSubmitted: () => renderMyTarefas(_outerRoot),
  });
}

const openSubmit = (tarefa) => openModal(tarefa, null);

// PURE. Find the entrega (and its tarefa) by id. The edit button carries the ENTREGA's id, not
// the tarefa's: on a tarefa with several entregas the tarefa's id doesn't say which one to open.
export function findDelivery(tarefas, subId) {
  for (const tf of tarefas || []) {
    const sub = deliveries(tf).find((s) => s.id === subId);
    if (sub) return { tarefa: tf, sub };
  }
  return null;
}

function openEdit(subId) {
  const hit = findDelivery(_tarefas, subId);
  if (!hit) return;
  // `anon` is what the entrega IS today (no name = anonymous), not a proposal: the modal's
  // checkbox shows the current state so that saving a comma fix doesn't identify someone who
  // chose not to appear.
  openModal(hit.tarefa, { id: hit.sub.id, answer_json: hit.sub.answer_json, anon: !hit.sub.student_name });
}

registerRenderer('tarefas', renderMyTarefas);
