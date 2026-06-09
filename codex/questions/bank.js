// questions/bank.js
// Codex Questions -> Bank sub-tab (native, host/admin). A faithful re-port of the
// legacy ClassPulse cp-banks-layout: a Conjuntos sidebar (pick, create inline,
// rename inline, delete) on the left; a question area on the right whose top
// carries a cross-set search bar, then the conjunto header
// [Editar banco | Editar nome | Excluir conjunto], then the "Questoes" header
// [+ Gerar em Lote | + Nova questao], then the question list. Question cards
// preview their options (A/B/C/D, correct highlighted). Add/edit happen in a
// native modal that reuses the shared question-composer plus AI generate/improve.
// "Editar banco" is a reorder/move mode (drag to reorder, multi-select to move
// between sets); "Gerar em Lote" is a two-step AI bulk modal (config -> review).
// All backend access goes through the facade (questions + ai); all strings
// through t(); destructive actions use an inline confirm (no native confirm).
// No polling, so unmount drops listeners, the search timer and the composer.
import { questions as api, ai, audiences as audiencesApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import { mountComposer, setAudienceConfig } from './question-composer.js';
import { questionType, lintConfig, parseAudienceDraft, slug } from '../js/audiences.js';

let _viewEl = null;
let _cleanup = [];
let _composer = null;
let _currentSet = null;
let _banks = [];
let _questions = [];
let _editingOriginal = null;
let _searchTimer = null;
let _newSetActive = false;
let _renaming = false;
let _confirmDelSet = false;
let _confirmDelQ = null;
let _searching = false;
let _editBank = false;
let _selected = new Set();
let _dragId = null;
let _bulkItems = [];
let _hubTab = 'export';
let _exportFormat = 'json';
let _exportScope = 'current';
let _exportChosen = new Set();
let _exportCache = {};
let _hubExportText = '';
let _importMode = 'text';
let _importItems = [];
let _importTarget = '';
let _audienceConfig = null;   // { version, variables[], audiences{} } for typed questions
let _audTab = 'audiences';    // matrix-manager active tab

const _DEFAULT_VARS = ['workspace', 'actor_role', 'deliverable', 'domain'];
function _emptyConfig() { return { version: 1, variables: _DEFAULT_VARS.slice(), audiences: {} }; }
function _audienceLabel(key) {
  const auds = (_audienceConfig && _audienceConfig.audiences) || {};
  return (auds[key] && auds[key].label) || key;
}
// Audience-label -> ascii key is the shared `slug` from js/audiences.js (same
// key for manual add and AI add).

// Pure: move an item up/down, immutable, clamped at the ends.
export function moveInArray(arr, index, dir) {
  const out = arr.slice();
  const j = dir === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= out.length || j < 0 || j >= out.length) return out;
  const tmp = out[index]; out[index] = out[j]; out[j] = tmp;
  return out;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
function _on(el, evt, fn) { if (!el) return; el.addEventListener(evt, fn); _cleanup.push(() => el.removeEventListener(evt, fn)); }
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }
function _destroyComposer() { if (_composer) { try { _composer.destroy(); } catch (_) { /* ignore */ } } _composer = null; _editingOriginal = null; }
function _typeBadge(type) { return '<span class="cdx-q-type">' + t('questions.type_' + (type || 'mc')) + '</span>'; }
// Class/audience badge: nothing for generic, "Variável" for templated, and
// "Única · <audience>" for audience-scoped questions.
function _classBadge(q) {
  const cls = questionType(q);
  if (cls === 'generic') return '';
  if (cls === 'unique') return '<span class="cdx-q-class cdx-q-class--unique">' + t('questions.qclass_unique') + ' · ' + _esc(_audienceLabel(q.audience)) + '</span>';
  return '<span class="cdx-q-class cdx-q-class--variable">' + t('questions.qclass_variable') + '</span>';
}

const _LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const _BULK_TYPES = ['mc', 'tf', 'poll', 'open', 'wordcloud'];

// Strip a leading option enumerator ("A) ", "B. ", "1) ", ...) from an option
// string. The UI supplies the A/B/C/D letter chip, so an AI that bakes the
// letter into the option text would otherwise render it twice ("A  A) ...").
// Requires a single alnum char + ) or . + whitespace, so it never eats a real
// option like "Paris" or a numeric answer like "3.14".
function _stripEnum(s) {
  return String(s == null ? '' : s).replace(/^\s*[A-Za-z0-9][).]\s+/, '');
}

function _optionList(q) {
  let opts = q.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts || '[]'); } catch (_) { opts = []; } }
  return Array.isArray(opts) ? opts.map(_stripEnum) : [];
}

function _correctSet(q) {
  const raw = q.correct_answer;
  if (raw === null || raw === undefined || raw === '') return new Set();
  if (typeof raw === 'number') return new Set([raw]);
  const s = String(raw).trim();
  if (s[0] === '[') { try { const a = JSON.parse(s); return new Set((a || []).map(Number)); } catch (_) { return new Set(); } }
  const n = parseInt(s, 10);
  return new Set(Number.isInteger(n) ? [n] : []);
}

// A stored question persists options as a JSON string and correctness as
// correct_answer (scalar index or JSON-array string). The composer expects an
// options ARRAY (or {min,max} for rating/numeric) and a correct INDEX array.
// Normalize so the edit modal pre-fills options + the correct selection.
function _composerInitial(q) {
  if (!q) return null;
  const type = q.type || 'mc';
  let options;
  if (type === 'rating' || type === 'numeric') {
    let o = q.options;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = {}; } }
    options = (o && !Array.isArray(o)) ? o : {};
  } else {
    options = _optionList(q);
  }
  const correct = Array.from(_correctSet(q));
  return {
    _original: q.question,
    type: type,
    question: q.question,
    options: options,
    correct: correct,
    correct_answers: correct,
    max_select: (q.max_select != null ? Number(q.max_select) : 1),
    audience: q.audience || null,
  };
}

// ---- Canonical exchange format (import + export share one shape) ----
function _canonicalCorrect(q) {
  const raw = q.correct_answer;
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s[0] === '[') { try { return JSON.parse(s).map(Number); } catch (_) { return ''; } }
  const n = parseInt(s, 10);
  return Number.isInteger(n) ? n : '';
}
function _canonicalOptions(q) {
  const type = q.type || 'mc';
  if (type === 'rating' || type === 'numeric') {
    let o = q.options;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = {}; } }
    return (o && !Array.isArray(o)) ? o : {};
  }
  if (type === 'open' || type === 'wordcloud') return [];
  return _optionList(q);
}
function _toCanonical(q) {
  const c = {
    type: q.type || 'mc',
    question: q.question || '',
    options: _canonicalOptions(q),
    correct_answer: _canonicalCorrect(q),
  };
  if (q.max_select != null) c.max_select = Number(q.max_select);
  if (q.audience) c.audience = q.audience;
  return c;
}

function _csvCell(s) {
  const v = String(s == null ? '' : s);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// Shared review list (bulk generate + import both render to this).
function _reviewItemsHTML(items) {
  return items.map((q, i) => {
    const raw = q.correct_answer;
    const correct = new Set(Array.isArray(raw) ? raw.map(Number) : (raw === '' || raw == null ? [] : [Number(raw)]));
    const opts = Array.isArray(q.options) ? q.options.map((o, oi) =>
      '<li' + (correct.has(oi) ? ' class="cdx-q-opt--correct"' : '') + '>' + _esc(o) +
      (correct.has(oi) ? ' (' + t('questions.bank_correct_tag') + ')' : '') + '</li>').join('') : '';
    return '<label class="cdx-bank-bulk-item">' +
      '<input type="checkbox" data-i="' + i + '" checked>' +
      '<div class="cdx-bank-bulk-item-body">' +
        '<div class="cdx-bank-bulk-item-q">' + _esc(q.question) + '</div>' +
        (opts ? '<ul class="cdx-bank-bulk-item-opts">' + opts + '</ul>' : '') +
      '</div>' +
    '</label>';
  }).join('');
}

// Clipboard + file download.
function _copy(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); } catch (_) { /* ignore */ }
  return Promise.resolve();
}
function _download(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }, 1000);
  } catch (_) { /* ignore */ }
}

// Import: the AI system prompt that turns pasted text into the canonical schema.
const _IMPORT_SYS =
  'Você organiza texto em questões para um banco de questões. Receberá um texto ' +
  '(conteúdo de aula ou questões em prosa). Devolva APENAS um array JSON estrito, ' +
  'sem markdown, no formato: [{"type":"mc|tf|poll|open|wordcloud|rating|numeric",' +
  '"question":"...","options":["..."] (ou {"min":1,"max":5} para rating/numeric, ' +
  'ou [] para open/wordcloud),"correct_answer": índice base-0 (mc/tf), array de ' +
  'índices (mc múltipla), ou "" (sem correta),"max_select": inteiro}]. Para mc use ' +
  '4 opções e correct_answer com o índice da correta. Para tf use options ' +
  '["Verdadeiro","Falso"]. Preserve as questões já presentes no texto; se for ' +
  'conteúdo, gere questões de múltipla escolha cobrindo os pontos principais. ' +
  'NUNCA inclua a letra (ex: "A)") no texto das opções.';

// ---- Sets sidebar ----
function _setRow(b) {
  const name = b.list_name;
  return '<button class="cdx-bank-set' + (name === _currentSet ? ' active' : '') + '" data-act="pick" data-set="' + _esc(name) + '" type="button">' +
    '<span class="cdx-bank-set-name">' + _esc(name) + '</span>' +
    '<span class="cdx-bank-set-count">' + (b.count || 0) + '</span>' +
  '</button>';
}

function _renderSets() {
  const el = _q('#cdx-bank-setlist');
  if (!el) return;
  let html = '';
  if (_newSetActive) {
    html += '<div class="cdx-bank-newset-row">' +
      '<input class="cdx-input cdx-bank-newset-input" type="text" maxlength="80" placeholder="' + _esc(t('questions.bank_new_set')) + '" autocomplete="off">' +
      '<button class="cdx-bank-iconbtn" data-act="newset-ok" type="button" aria-label="ok">✓</button>' +
      '<button class="cdx-bank-iconbtn" data-act="newset-cancel" type="button" aria-label="x">✗</button>' +
    '</div>';
  }
  if (_banks.length) html += _banks.map(_setRow).join('');
  else if (!_newSetActive) html += '<div class="cdx-bank-empty">' + t('questions.bank_empty_sets') + '</div>';
  el.innerHTML = html;
  if (_newSetActive) { const inp = el.querySelector('.cdx-bank-newset-input'); if (inp) inp.focus(); }
}

async function _loadSets() {
  let res; try { res = await api.listSets(); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  _banks = (res && res.banks) || [];
  _renderSets();
}

// ---- Question cards ----
function _optionPreview(q) {
  const type = q.type || 'mc';
  if (type !== 'mc' && type !== 'tf' && type !== 'poll') return '';
  const opts = _optionList(q);
  if (!opts.length) return '';
  const correct = _correctSet(q);
  return '<div class="cdx-q-opts">' +
    opts.map((o, i) => '<div class="cdx-q-opt' + (correct.has(i) ? ' cdx-q-opt--correct' : '') + '">' +
      '<span class="cdx-q-opt-letter">' + (_LETTERS[i] || (i + 1)) + '</span> ' + _esc(o) + '</div>').join('') +
  '</div>';
}

function _qCard(q) {
  // Reorder/move mode: drag handle + select checkbox + compact body.
  if (_editBank) {
    const checked = _selected.has(String(q.id));
    return '<div class="cdx-q cdx-q--edit" draggable="true" data-qid="' + _esc(q.id) + '">' +
      '<span class="cdx-q-drag" aria-hidden="true">⠿</span>' +
      '<input type="checkbox" class="cdx-q-select" data-act="select" data-qid="' + _esc(q.id) + '"' + (checked ? ' checked' : '') + '>' +
      '<div class="cdx-q-editbody"><div class="cdx-q-text">' + _esc(q.question) + '</div>' + _typeBadge(q.type) + _classBadge(q) + '</div>' +
    '</div>';
  }
  const confirming = _confirmDelQ != null && String(_confirmDelQ) === String(q.id);
  const foot = confirming
    ? '<div class="cdx-q-foot">' + _typeBadge(q.type) + _classBadge(q) +
        '<span class="cdx-q-confirm">' + t('questions.bank_delete_q') + '</span>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delq-yes" data-qid="' + _esc(q.id) + '" type="button">' + t('questions.bank_yes') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-act="delq-no" type="button">' + t('questions.bank_no') + '</button>' +
      '</div>'
    : '<div class="cdx-q-foot">' + _typeBadge(q.type) + _classBadge(q) +
        '<button class="cdx-btn cdx-btn-sm" data-act="edit" data-qid="' + _esc(q.id) + '" type="button">' + t('questions.bank_edit') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delq" data-qid="' + _esc(q.id) + '" type="button">' + t('questions.bank_delete') + '</button>' +
      '</div>';
  return '<div class="cdx-q">' +
    '<div class="cdx-q-text">' + _esc(q.question) + '</div>' +
    _optionPreview(q) +
    foot +
  '</div>';
}

// ---- Conjunto view (header + questions) ----
function _conjuntoHeader() {
  if (_confirmDelSet) {
    return '<div class="cdx-bank-conjunto-header">' +
      '<h2 class="cdx-bank-conjunto-title">' + _esc(_currentSet) + '</h2>' +
      '<div class="cdx-bank-conjunto-actions">' +
        '<span class="cdx-bank-confirm-text">' + t('questions.bank_delete_set_q') + '</span>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delset-yes" type="button">' + t('questions.bank_yes') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-act="delset-no" type="button">' + t('questions.bank_no') + '</button>' +
      '</div>' +
    '</div>';
  }
  return '<div class="cdx-bank-conjunto-header">' +
    '<h2 class="cdx-bank-conjunto-title">' + _esc(_currentSet) + '</h2>' +
    '<div class="cdx-bank-conjunto-actions">' +
      '<button class="cdx-btn cdx-btn-sm' + (_editBank ? ' cdx-btn-primary' : '') + '" data-act="edit-bank" type="button">' +
        t(_editBank ? 'questions.bank_edit_bank_done' : 'questions.bank_edit_bank') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm" data-act="rename" type="button">' + t('questions.bank_edit_name') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delset" type="button">' + t('questions.bank_delete_set') + '</button>' +
    '</div>' +
  '</div>';
}

function _renameRow() {
  if (!_renaming) return '';
  return '<div class="cdx-bank-rename-row">' +
    '<input class="cdx-input cdx-bank-rename-input" type="text" value="' + _esc(_currentSet) + '" autocomplete="off">' +
    '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="rename-save" type="button">' + t('questions.bank_save') + '</button>' +
    '<button class="cdx-btn cdx-btn-sm" data-act="rename-cancel" type="button">' + t('questions.bank_cancel') + '</button>' +
  '</div>';
}

function _qHeader() {
  return '<div class="cdx-bank-qheader">' +
    '<span class="cdx-bank-qheader-label">' + t('questions.bank_questions_label') + '</span>' +
    '<div class="cdx-bank-qheader-actions">' +
      '<button class="cdx-btn cdx-btn-sm" data-act="bulk" type="button">' + t('questions.bank_bulk_generate') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="addq" type="button">' + t('questions.bank_new_question') + '</button>' +
    '</div>' +
  '</div>';
}

// Move bar (shown in reorder/move mode once at least one question is selected).
function _moveBar() {
  if (!_editBank || _selected.size === 0) return '';
  const dests = _banks.filter((b) => b.list_name !== _currentSet);
  const opts = dests.map((b) => '<option value="' + _esc(b.list_name) + '">' + _esc(b.list_name) + '</option>').join('');
  return '<div class="cdx-bank-movebar">' +
    '<span class="cdx-bank-movebar-count">' + t('questions.bank_move') + ' ' + _selected.size + ' ' + t('questions.bank_move_selected') + ':</span>' +
    '<span>' + t('questions.bank_move_to') + '</span>' +
    '<select class="cdx-select cdx-bank-move-dest">' + opts + '</select>' +
    '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="move-do" type="button">' + t('questions.bank_move') + '</button>' +
    '<button class="cdx-btn cdx-btn-sm" data-act="move-cancel" type="button">' + t('questions.bank_cancel') + '</button>' +
  '</div>';
}

function _renderConjunto() {
  const body = _q('#cdx-bank-body');
  if (!body) return;
  const list = _questions.length
    ? _questions.map(_qCard).join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_empty_questions') + '</div>';
  body.innerHTML = _conjuntoHeader() + _renameRow() + _qHeader() + _moveBar() +
    '<div class="cdx-bank-qlist' + (_editBank ? ' cdx-bank-qlist--editing' : '') + '">' + list + '</div>';
  if (_renaming) { const inp = body.querySelector('.cdx-bank-rename-input'); if (inp) { inp.focus(); inp.select(); } }
}

async function _loadQuestions() {
  const body = _q('#cdx-bank-body');
  if (!body) return;
  if (!_currentSet) { body.innerHTML = '<div class="cdx-bank-empty">' + t('questions.bank_pick_set') + '</div>'; return; }
  body.innerHTML = '<div class="cdx-bank-loading">' + t('questions.bank_loading') + '</div>';
  let res; try { res = await api.getQuestions({ list_name: _currentSet }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl || !_currentSet || _searching) return;
  _questions = (res && res.questions) || [];
  _renderConjunto();
}

function _selectSet(name) {
  _currentSet = name;
  _renaming = false; _confirmDelSet = false; _confirmDelQ = null;
  _editBank = false; _selected.clear(); _dragId = null;
  _renderSets();
  _loadQuestions();
}

// ---- Reorder / move mode ----
function _toggleEditBank() {
  _editBank = !_editBank;
  if (!_editBank) { _selected.clear(); _dragId = null; }
  _renderConjunto();
}

async function _moveSelected() {
  const sel = _q('.cdx-bank-move-dest');
  const dest = sel ? sel.value : '';
  if (!dest) return;
  const movers = _questions.filter((q) => _selected.has(String(q.id)));
  if (!movers.length) return;
  for (const q of movers) {
    const payload = {
      list_name: _currentSet, original_question: q.question,
      question: q.question, type: q.type,
      options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
      correct_answer: (q.correct_answer != null ? q.correct_answer : ''),
      new_list_name: dest,
    };
    try { await api.updateQuestion(payload); } catch (e) { notice.internal(e); }
  }
  _selected.clear(); _editBank = false;
  await _loadSets();
  await _loadQuestions();
}

// ---- Modal editor (reuses the shared composer + AI generate/improve) ----
function _openModal(initial) {
  const modal = _q('#cdx-bank-modal');
  if (!modal) return;
  _editingOriginal = initial ? initial.question : null;
  _q('.cdx-bank-modal-title').textContent = initial ? t('questions.bank_modal_edit') : t('questions.bank_modal_new');
  _q('.cdx-bank-modal-err').textContent = '';
  modal.hidden = false;
  _destroyComposer();
  _composer = mountComposer(_q('#cdx-bank-composer'), initial || null);
}

function _closeModal() {
  const modal = _q('#cdx-bank-modal');
  if (modal) modal.hidden = true;
  _destroyComposer();
}

async function _saveQuestion() {
  if (!_composer || !_currentSet) return;
  const payload = _composer.read();
  const errEl = _q('.cdx-bank-modal-err');
  if (!payload.question) { if (errEl) errEl.textContent = t('questions.bank_question_text'); return; }
  let res;
  try {
    res = (_editingOriginal != null)
      ? await api.updateQuestion(Object.assign({ list_name: _currentSet, original_question: _editingOriginal }, payload))
      : await api.addQuestion(Object.assign({ list_name: _currentSet }, payload));
  } catch (e) { notice.internal(e); res = null; }
  if (res && res.error) { if (errEl) errEl.textContent = t('questions.bank_save_error'); return; }
  _closeModal();
  await _loadQuestions();
  _loadSets();
}

// ---- Bulk generate modal (two steps: config -> review) ----
function _openBulk() {
  if (!_currentSet) return;
  const modal = _q('#cdx-bank-bulk');
  if (!modal) return;
  _bulkItems = [];
  _q('#cdx-bank-bulk-config').hidden = false;
  _q('#cdx-bank-bulk-review').hidden = true;
  _q('.cdx-bank-bulk-err').textContent = '';
  _q('.cdx-bank-bulk-theme').value = '';
  _q('[data-act="bulk-generate"]').hidden = false;
  _q('[data-act="bulk-cancel"]').hidden = false;
  _q('[data-act="bulk-discard"]').hidden = true;
  _q('[data-act="bulk-save"]').hidden = true;
  modal.hidden = false;
}

function _closeBulk() {
  const modal = _q('#cdx-bank-bulk');
  if (modal) modal.hidden = true;
  _bulkItems = [];
}

async function _bulkGenerate() {
  const type = _q('.cdx-bank-bulk-type').value;
  const count = parseInt(_q('.cdx-bank-bulk-count').value, 10) || 5;
  const theme = _q('.cdx-bank-bulk-theme').value.trim();
  const errEl = _q('.cdx-bank-bulk-err');
  if (!theme) { errEl.textContent = t('questions.bank_bulk_empty_theme'); return; }
  errEl.textContent = '';
  const btn = _q('[data-act="bulk-generate"]');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = t('questions.bank_bulk_generating');
  let res; try { res = await ai.question({ prompt: theme, type: type, count: count }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  btn.disabled = false; btn.textContent = orig;
  const arr = res && (Array.isArray(res.ai) ? res.ai : (Array.isArray(res) ? res : null));
  if (!arr) { errEl.textContent = t('questions.bank_bulk_error'); return; }
  _bulkItems = arr.map((q) => ({
    question: q.question || '',
    type: q.type || type,
    options: (q.options || []).map(_stripEnum),
    correct_answer: (typeof q.correct === 'number') ? String(q.correct) : '',
  }));
  _renderBulkReview();
}

function _renderBulkReview() {
  _q('#cdx-bank-bulk-config').hidden = true;
  _q('#cdx-bank-bulk-review').hidden = false;
  _q('[data-act="bulk-generate"]').hidden = true;
  _q('[data-act="bulk-cancel"]').hidden = true;
  _q('[data-act="bulk-discard"]').hidden = false;
  _q('[data-act="bulk-save"]').hidden = false;
  _q('#cdx-bank-bulk-list').innerHTML = _reviewItemsHTML(_bulkItems);
}

async function _bulkSave() {
  const list = _q('#cdx-bank-bulk-list');
  const checks = Array.prototype.slice.call(list.querySelectorAll('input[type="checkbox"]:checked'));
  const errEl = _q('.cdx-bank-bulk-err');
  if (!checks.length) { errEl.textContent = t('questions.bank_bulk_no_selection'); return; }
  const selected = checks.map((c) => _bulkItems[parseInt(c.getAttribute('data-i'), 10)]);
  const btn = _q('[data-act="bulk-save"]');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = t('questions.bank_bulk_saving');
  try { await api.addQuestionsBulk({ list_name: _currentSet, questions: selected }); } catch (e) { notice.internal(e); }
  if (!_viewEl) return;
  btn.disabled = false; btn.textContent = orig;
  _closeBulk();
  await _loadQuestions();
  _loadSets();
}

// ---- Import / Export hub (collection-level; scope: current / all / choose) ----
function _openHub() {
  const modal = _q('#cdx-bank-hub');
  if (!modal) return;
  _hubTab = 'export';
  _exportScope = _currentSet ? 'current' : 'all';
  _exportFormat = 'json';
  _exportChosen = new Set();
  _exportCache = {};
  if (_currentSet) _exportCache[_currentSet] = _questions.slice();
  _importMode = 'text'; _importItems = []; _importTarget = _currentSet || '';
  _q('.cdx-bank-hub-title').textContent = t('questions.bank_hub_title');
  _renderHubTabs();
  _resetImportPanel();
  _renderHubExport();
  modal.hidden = false;
}
function _closeHub() { const m = _q('#cdx-bank-hub'); if (m) m.hidden = true; _importItems = []; }
function _renderHubTabs() {
  if (!_viewEl) return;
  _viewEl.querySelectorAll('.cdx-bank-hub-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-hub') === _hubTab));
  const ex = _q('#cdx-bank-hub-export'); if (ex) ex.hidden = _hubTab !== 'export';
  const im = _q('#cdx-bank-hub-import'); if (im) im.hidden = _hubTab !== 'import';
}

// --- Export side (envelope: { codex_questions, banks: [...] }) ---
function _exportNames() {
  const all = _banks.map((b) => b.list_name);
  if (_exportScope === 'all') return all;
  if (_exportScope === 'choose') return all.filter((n) => _exportChosen.has(n));
  return _currentSet ? [_currentSet] : [];
}
async function _ensureExportData(names) {
  for (const n of names) {
    if (_exportCache[n]) continue;
    let res; try { res = await api.getQuestions({ list_name: n }); } catch (_) { res = null; }
    _exportCache[n] = (res && res.questions) || [];
  }
}
function _buildEnvelope(names) {
  return { codex_questions: 1, banks: names.map((n) => ({ list_name: n, questions: (_exportCache[n] || []).map(_toCanonical) })) };
}
function _envelopeMarkdown(env) {
  let out = '';
  env.banks.forEach((bank) => {
    out += '# ' + bank.list_name + '\n\n';
    bank.questions.forEach((c, i) => {
      out += (i + 1) + '. [' + String(c.type || 'mc').toUpperCase() + '] ' + c.question + '\n';
      if (Array.isArray(c.options) && c.options.length) {
        const correct = new Set(Array.isArray(c.correct_answer) ? c.correct_answer : (c.correct_answer === '' ? [] : [c.correct_answer]));
        c.options.forEach((o, oi) => { out += '   - ' + (_LETTERS[oi] || (oi + 1)) + '. ' + o + (correct.has(oi) ? ' (' + t('questions.bank_correct_tag') + ')' : '') + '\n'; });
      } else if (c.options && !Array.isArray(c.options) && (c.options.min != null || c.options.max != null)) {
        out += '   - ' + (c.options.min != null ? c.options.min : '') + '..' + (c.options.max != null ? c.options.max : '') + '\n';
      }
      out += '\n';
    });
  });
  return out;
}
function _envelopeCSV(env) {
  let out = 'set,type,question,options,correct,max_select\n';
  env.banks.forEach((bank) => {
    bank.questions.forEach((c) => {
      const opts = Array.isArray(c.options) ? c.options.join(' | ') : (c.options && (c.options.min != null || c.options.max != null) ? (c.options.min + '..' + c.options.max) : '');
      const correct = Array.isArray(c.correct_answer) ? c.correct_answer.join(';') : (c.correct_answer === '' ? '' : c.correct_answer);
      out += [_csvCell(bank.list_name), _csvCell(c.type), _csvCell(c.question), _csvCell(opts), _csvCell(correct), _csvCell(c.max_select != null ? c.max_select : '')].join(',') + '\n';
    });
  });
  return out;
}
async function _renderHubExport() {
  if (!_viewEl) return;
  _viewEl.querySelectorAll('.cdx-bank-scope-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-scope') === _exportScope));
  _viewEl.querySelectorAll('.cdx-bank-export-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-fmt') === _exportFormat));
  const checklist = _q('.cdx-bank-hub-checklist');
  if (checklist) {
    checklist.hidden = _exportScope !== 'choose';
    if (_exportScope === 'choose') {
      checklist.innerHTML = _banks.length
        ? _banks.map((b) => '<label class="cdx-bank-check"><input type="checkbox" data-set="' + _esc(b.list_name) + '"' + (_exportChosen.has(b.list_name) ? ' checked' : '') + '> ' + _esc(b.list_name) + '</label>').join('')
        : '<div class="cdx-bank-empty">' + t('questions.bank_empty_sets') + '</div>';
    }
  }
  const out = _q('.cdx-bank-export-out');
  const names = _exportNames();
  if (!names.length) { _hubExportText = ''; if (out) out.value = ''; return; }
  if (out) out.value = t('questions.bank_loading');
  await _ensureExportData(names);
  if (!_viewEl) return;
  const env = _buildEnvelope(names);
  _hubExportText = _exportFormat === 'md' ? _envelopeMarkdown(env) : (_exportFormat === 'csv' ? _envelopeCSV(env) : JSON.stringify(env, null, 2));
  if (out) out.value = _hubExportText;
}
function _exportDownload() {
  const ext = _exportFormat === 'md' ? 'md' : _exportFormat;
  const mime = _exportFormat === 'json' ? 'application/json' : (_exportFormat === 'csv' ? 'text/csv' : 'text/markdown');
  const names = _exportNames();
  const base = (names.length === 1 ? names[0] : 'bancos').replace(/[^a-z0-9_-]+/gi, '_');
  _download(base + '.' + ext, _hubExportText, mime);
}

// --- Import side (paste text -> AI; paste JSON envelope -> direct, fans out) ---
function _resetImportPanel() {
  _importItems = [];
  _q('#cdx-bank-import-config').hidden = false;
  _q('#cdx-bank-import-review').hidden = true;
  _q('.cdx-bank-import-err').textContent = '';
  _q('.cdx-bank-import-in').value = '';
  const tgt = _q('.cdx-bank-import-target'); if (tgt) tgt.value = _importTarget;
  const dl = _q('#cdx-bank-target-list'); if (dl) dl.innerHTML = _banks.map((b) => '<option value="' + _esc(b.list_name) + '"></option>').join('');
  _q('[data-act="import-process"]').hidden = false;
  _q('[data-act="import-discard"]').hidden = true;
  _q('[data-act="import-save"]').hidden = true;
  _syncImportTabs();
}
function _syncImportTabs() {
  if (!_viewEl) return;
  _viewEl.querySelectorAll('.cdx-bank-import-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-mode') === _importMode));
  const inp = _q('.cdx-bank-import-in');
  if (inp) inp.placeholder = t(_importMode === 'json' ? 'questions.bank_import_json_ph' : 'questions.bank_import_text_ph');
  const proc = _q('[data-act="import-process"]');
  if (proc) proc.textContent = t(_importMode === 'json' ? 'questions.bank_import_load' : 'questions.bank_import_organize');
  // Target applies to text import (and single-bank JSON falls back to it).
  const row = _q('.cdx-bank-import-target-row');
  if (row) row.hidden = _importMode === 'json';
}
function _normOne(q, listName) {
  return {
    list_name: listName || null,
    type: q.type || 'mc',
    question: String(q.question),
    options: Array.isArray(q.options) ? q.options.map(_stripEnum) : ((q.options && typeof q.options === 'object') ? q.options : []),
    correct_answer: (q.correct_answer !== undefined ? q.correct_answer : (q.correct !== undefined ? q.correct : '')),
    max_select: (q.max_select != null ? Number(q.max_select) : 1),
    audience: (q.audience != null ? q.audience : null),
  };
}
function _itemsFromJson(raw) {
  let data; try { data = JSON.parse(String(raw).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch (_) { return undefined; }
  const items = [];
  if (data && Array.isArray(data.banks)) {
    data.banks.forEach((bk) => { (bk.questions || []).forEach((q) => { if (q && q.question) items.push(_normOne(q, bk.list_name)); }); });
  } else {
    const arr = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
    if (arr === null) return undefined;
    const ln = (data && data.list_name) ? data.list_name : null;
    arr.forEach((q) => { if (q && q.question) items.push(_normOne(q, ln)); });
  }
  return items;
}
async function _importProcess() {
  const inp = _q('.cdx-bank-import-in');
  const errEl = _q('.cdx-bank-import-err');
  const raw = inp ? inp.value.trim() : '';
  if (errEl) errEl.textContent = '';
  if (!raw) { if (errEl) errEl.textContent = t('questions.bank_import_empty'); return; }

  if (_importMode === 'json') {
    const items = _itemsFromJson(raw);
    if (items === undefined) { if (errEl) errEl.textContent = t('questions.bank_import_json_invalid'); return; }
    if (!items.length) { if (errEl) errEl.textContent = t('questions.bank_import_none'); return; }
    _importItems = items;
    _renderImportReview();
    return;
  }

  const btn = _q('[data-act="import-process"]');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = t('questions.bank_import_organizing');
  let res; try { res = await ai.chat({ system: _IMPORT_SYS, messages: [{ role: 'user', content: raw }] }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  btn.disabled = false; btn.textContent = orig;
  const items = (res && res.text) ? _itemsFromJson(res.text) : undefined;
  if (!items || !items.length) { if (errEl) errEl.textContent = t('questions.bank_import_ai_error'); return; }
  _importItems = items;
  _renderImportReview();
}
function _renderImportReview() {
  _q('#cdx-bank-import-config').hidden = true;
  _q('#cdx-bank-import-review').hidden = false;
  _q('[data-act="import-process"]').hidden = true;
  _q('[data-act="import-discard"]').hidden = false;
  _q('[data-act="import-save"]').hidden = false;
  _q('#cdx-bank-import-list').innerHTML = _reviewItemsHTML(_importItems);
}
async function _importSave() {
  const listEl = _q('#cdx-bank-import-list');
  const checks = Array.prototype.slice.call(listEl.querySelectorAll('input[type="checkbox"]:checked'));
  const errEl = _q('.cdx-bank-import-err');
  if (!checks.length) { if (errEl) errEl.textContent = t('questions.bank_bulk_no_selection'); return; }
  const items = checks.map((c) => _importItems[parseInt(c.getAttribute('data-i'), 10)]);
  const tgtInput = _q('.cdx-bank-import-target');
  const textTarget = (tgtInput && tgtInput.value.trim()) || _currentSet || '';
  const btn = _q('[data-act="import-save"]');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = t('questions.bank_bulk_saving');
  // add_question per item (not bulk) so max_select + correct serialize; each item
  // lands in its own list_name (multi-bank JSON) or the chosen target.
  for (const q of items) {
    const listName = q.list_name || textTarget;
    if (!listName) continue;
    try {
      await api.addQuestion({
        list_name: listName, question: q.question, type: q.type || 'mc',
        options: q.options || [], correct_answer: q.correct_answer,
        max_select: (q.max_select != null ? q.max_select : 1),
        audience: q.audience || null,
      });
    } catch (e) { notice.internal(e); }
  }
  if (!_viewEl) return;
  btn.disabled = false; btn.textContent = orig;
  _closeHub();
  await _loadSets();
  await _loadQuestions();
}

// ---- Audience matrix manager (variables x audiences) ----
// Edits mutate _audienceConfig in place (cell inputs via change handlers; add/
// remove via re-render); Save persists the whole doc. Seeds the default variable
// vocabulary when the config is empty so the grid is immediately usable.
async function _loadAudienceConfig() {
  let res; try { res = await audiencesApi.getConfig(); } catch (_) { res = null; }
  if (!_viewEl) return;
  _audienceConfig = (res && res.config) || _emptyConfig();
  if (!Array.isArray(_audienceConfig.variables) || !_audienceConfig.variables.length) _audienceConfig.variables = _DEFAULT_VARS.slice();
  if (!_audienceConfig.audiences) _audienceConfig.audiences = {};
  setAudienceConfig(_audienceConfig);
}
function _openAudiences() {
  const modal = _q('#cdx-bank-aud');
  if (!modal) return;
  _audTab = 'audiences';
  const err = _q('.cdx-bank-aud-err'); if (err) err.textContent = '';
  modal.hidden = false;
  if (!_audienceConfig) _audienceConfig = _emptyConfig();
  _renderAudContent();
}
function _closeAudiences() { const m = _q('#cdx-bank-aud'); if (m) m.hidden = true; }
function _renderAudContent() {
  if (!_viewEl) return;
  _viewEl.querySelectorAll('.cdx-bank-aud-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-audtab') === _audTab));
  const content = _q('#cdx-bank-aud-content');
  if (content) content.innerHTML = _audTab === 'variables' ? _renderVariablesTab() : _renderAudiencesTab();
}
function _renderAudiencesTab() {
  const auds = _audienceConfig.audiences || {};
  const keys = Object.keys(auds);
  const rows = keys.length ? keys.map((k) =>
    '<div class="cdx-aud-row">' +
      '<input class="cdx-input cdx-aud-label" data-aud-label="' + _esc(k) + '" value="' + _esc(auds[k].label || k) + '">' +
      '<span class="cdx-aud-key">' + _esc(k) + '</span>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="aud-del" data-aud="' + _esc(k) + '" type="button">' + t('questions.aud_delete') + '</button>' +
    '</div>').join('')
    : '<div class="cdx-bank-empty">' + t('questions.aud_empty') + '</div>';
  return '<div class="cdx-aud-list">' + rows + '</div>' +
    '<div class="cdx-aud-addrow">' +
      '<input class="cdx-input cdx-aud-new-label" placeholder="' + _esc(t('questions.aud_label_ph')) + '">' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="aud-add" type="button">' + t('questions.aud_add') + '</button>' +
    '</div>' +
    '<div class="cdx-aud-ai-row">' +
      '<input class="cdx-input cdx-aud-ai-input" placeholder="' + _esc(t('questions.aud_ai_ph')) + '">' +
      '<button class="cdx-btn cdx-btn-sm" data-act="aud-ai" type="button">' + t('questions.aud_ai_create') + '</button>' +
    '</div>';
}
function _varAddRow() {
  return '<div class="cdx-aud-addrow">' +
    '<input class="cdx-input cdx-var-new-key" placeholder="' + _esc(t('questions.aud_var_ph')) + '">' +
    '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="var-add" type="button">' + t('questions.aud_var_add') + '</button>' +
  '</div>';
}
function _gnSelect(which, audKey, varKey, val) {
  const opts = which === 'g'
    ? [['f', t('questions.aud_g_f')], ['m', t('questions.aud_g_m')]]
    : [['sg', t('questions.aud_n_sg')], ['pl', t('questions.aud_n_pl')]];
  return '<select class="cdx-select cdx-var-' + which + '" data-aud="' + _esc(audKey) + '" data-var="' + _esc(varKey) + '">' +
    opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + _esc(o[1]) + '</option>').join('') +
  '</select>';
}
function _renderVariablesTab() {
  const cfg = _audienceConfig;
  const auds = cfg.audiences || {};
  const audKeys = Object.keys(auds);
  const vars = cfg.variables || [];
  if (!audKeys.length) return '<div class="cdx-bank-empty">' + t('questions.aud_no_audiences_hint') + '</div>' + _varAddRow();
  const issues = lintConfig(cfg);
  const bad = new Set(issues.map((i) => i.audience + '|' + i.variable));
  const head = '<th>' + t('questions.aud_variable') + '</th>' + audKeys.map((k) => '<th>' + _esc(auds[k].label || k) + '</th>').join('');
  const rows = vars.map((v) =>
    '<tr><td class="cdx-var-key">' + _esc(v) +
      ' <button class="cdx-bank-iconbtn" data-act="var-del" data-var="' + _esc(v) + '" type="button" aria-label="x">✗</button></td>' +
      audKeys.map((k) => {
        const cell = (auds[k].values && auds[k].values[v]) || {};
        const isBad = bad.has(k + '|' + v);
        return '<td class="cdx-var-cell' + (isBad ? ' cdx-var-cell--bad' : '') + '">' +
          '<input class="cdx-input cdx-var-text" data-aud="' + _esc(k) + '" data-var="' + _esc(v) + '" value="' + _esc(cell.text || '') + '" placeholder="' + _esc(t('questions.aud_value_ph')) + '">' +
          '<div class="cdx-var-gn">' + _gnSelect('g', k, v, cell.g || 'f') + _gnSelect('n', k, v, cell.n || 'sg') + '</div>' +
        '</td>';
      }).join('') +
    '</tr>').join('');
  const lintMsg = issues.length ? '<div class="cdx-aud-lint">' + issues.length + ' ' + t('questions.aud_lint_issues') + '</div>' : '';
  return '<div class="cdx-var-gridwrap"><table class="cdx-var-grid"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + lintMsg + _varAddRow();
}
function _ensureCell(audKey, varKey) {
  const a = _audienceConfig.audiences[audKey];
  if (!a.values) a.values = {};
  if (!a.values[varKey]) a.values[varKey] = { text: '', g: 'f', n: 'sg' };
  return a.values[varKey];
}
// AI-audience-create: strict-JSON system prompt. The model gets a name/
// description of a público and returns ONE audience object the matrix can stage.
// Strict JSON (no markdown) is load-bearing for the cheap fallback models; one
// worked example anchors the schema. Fills only the existing variable vocabulary.
function _audSysPrompt(variables) {
  const list = (variables || []).join(', ');
  return 'Você cria a configuração de uma audiência (público-alvo) para um banco de questões. ' +
    'Receberá o nome/descrição de um público. Devolva APENAS um objeto JSON estrito, sem markdown, no formato: ' +
    '{"label":"<nome curto do público>","values":{"<variável>":{"text":"<termo concreto em PT-BR>","g":"m|f","n":"sg|pl"}}}. ' +
    'Use EXATAMENTE estas variáveis como chaves, todas preenchidas: ' + list + '. ' +
    'Para cada variável, "text" é o termo que esse público realmente usa, "g" é o gênero gramatical do termo ("m" ou "f") e "n" o número ("sg" ou "pl"). ' +
    'Não invente outras chaves nem inclua texto fora do JSON. ' +
    'Exemplo para "Advocacia" com variáveis workspace, actor_role, deliverable, domain: ' +
    '{"label":"IA na Advocacia","values":{"workspace":{"text":"escritório","g":"m","n":"sg"},"actor_role":{"text":"advogado","g":"m","n":"sg"},"deliverable":{"text":"petição","g":"f","n":"sg"},"domain":{"text":"Direito","g":"m","n":"sg"}}}.';
}

// Generate a whole audience from a typed name/description via ai.chat. The result
// is a REVIEWABLE DRAFT staged in memory only (never auto-saved): it lands in the
// config and we switch to the variables grid so Élder can edit; lint + Salvar own
// persistence. Errors route to notice (pill) + the inline error line.
async function _aiCreateAudience() {
  const inp = _q('.cdx-aud-ai-input');
  const desc = inp ? inp.value.trim() : '';
  const err = _q('.cdx-bank-aud-err');
  if (err) err.textContent = '';
  if (!desc) { notice.info(t('questions.aud_ai_empty')); return; }
  const btn = _q('[data-act="aud-ai"]');
  let orig = '';
  if (btn) { btn.disabled = true; orig = btn.textContent; btn.textContent = t('questions.aud_ai_generating'); }
  let res; try { res = await ai.chat({ system: _audSysPrompt(_audienceConfig.variables), messages: [{ role: 'user', content: desc }] }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  if (btn) { btn.disabled = false; btn.textContent = orig; }
  const draft = parseAudienceDraft(res && res.text, _audienceConfig.variables);
  if (!draft) {
    // Never swallow the cause into the toast alone: log the real AI response to
    // the debug pill so the failure is diagnosable (CLAUDE.md pill rule).
    const raw = (res && res.text != null) ? String(res.text)
      : (res === null ? '<null: rate-limited or both AI providers failed>' : '<response had no text field>');
    notice.internal('aud-ai: no valid draft parsed from AI response. raw=' + raw.slice(0, 400));
    if (err) err.textContent = t('questions.aud_ai_error');
    return;
  }
  _audienceConfig.audiences[draft.key] = { label: draft.label, values: draft.values };
  _audTab = 'variables';
  _renderAudContent();
  notice.ok(t('questions.aud_ai_done'));
}

function _addAudience() {
  const inp = _q('.cdx-aud-new-label');
  const label = inp ? inp.value.trim() : '';
  if (!label) return;
  const key = slug(label);
  if (!key) return;
  if (!_audienceConfig.audiences[key]) _audienceConfig.audiences[key] = { label: label, values: {} };
  else _audienceConfig.audiences[key].label = label;
  _renderAudContent();
}
function _delAudience(key) {
  delete _audienceConfig.audiences[key];
  _renderAudContent();
}
function _addVariable() {
  const inp = _q('.cdx-var-new-key');
  const key = slug(inp ? inp.value.trim() : '');
  if (!key) return;
  if (_audienceConfig.variables.indexOf(key) === -1) _audienceConfig.variables.push(key);
  _renderAudContent();
}
function _delVariable(key) {
  _audienceConfig.variables = _audienceConfig.variables.filter((v) => v !== key);
  const auds = _audienceConfig.audiences || {};
  Object.keys(auds).forEach((k) => { if (auds[k].values) delete auds[k].values[key]; });
  _renderAudContent();
}
async function _saveAudiences() {
  const err = _q('.cdx-bank-aud-err');
  if (err) err.textContent = '';
  const btn = _q('[data-act="aud-save"]');
  if (btn) btn.disabled = true;
  let res; try { res = await audiencesApi.saveConfig({ config: _audienceConfig }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  if (btn) btn.disabled = false;
  if (!res || res.error) { if (err) err.textContent = t('questions.aud_save_error'); return; }
  setAudienceConfig(_audienceConfig);
  notice.ok(t('questions.aud_saved'));
  if (_currentSet && !_searching) _renderConjunto();
}

// ---- Cross-set search ----
async function _runSearch(query) {
  const body = _q('#cdx-bank-body');
  if (!body) return;
  const term = (query || '').trim();
  if (term.length < 2) { _searching = false; _toggleSearchClear(false); _loadQuestions(); return; }
  _searching = true; _editBank = false; _selected.clear();
  _toggleSearchClear(true);
  body.innerHTML = '<div class="cdx-bank-loading">' + t('questions.bank_loading') + '</div>';
  let res; try { res = await api.search({ q: term }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl || !_searching) return;
  const found = (res && res.questions) || [];
  const header = '<div class="cdx-bank-search-head">' + found.length + ' ' + t('questions.bank_results_for') + ' "' + _esc(term) + '"</div>';
  const list = found.length
    ? found.map((qq) => '<div class="cdx-q cdx-q--result" data-act="goto" data-set="' + _esc(qq.list_name) + '">' +
        '<div class="cdx-bank-result-set">' + _esc(qq.list_name) + '</div>' +
        '<div class="cdx-q-text">' + _esc(qq.question) + '</div>' +
        '<div class="cdx-q-foot">' + _typeBadge(qq.type) +
          '<button class="cdx-btn cdx-btn-sm" data-act="goto" data-set="' + _esc(qq.list_name) + '" type="button">' + t('questions.bank_goto_set') + '</button>' +
        '</div></div>').join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_no_results') + '</div>';
  body.innerHTML = header + '<div class="cdx-bank-qlist">' + list + '</div>';
}

function _toggleSearchClear(show) {
  const btn = _q('.cdx-bank-search-clear');
  if (btn) btn.hidden = !show;
}

function _clearSearch() {
  const input = _q('.cdx-bank-search-input');
  if (input) input.value = '';
  _searching = false;
  _toggleSearchClear(false);
  if (_currentSet) _loadQuestions();
  else { const body = _q('#cdx-bank-body'); if (body) body.innerHTML = '<div class="cdx-bank-empty">' + t('questions.bank_pick_set') + '</div>'; }
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _currentSet = null; _banks = []; _questions = []; _editingOriginal = null;
  _newSetActive = false; _renaming = false; _confirmDelSet = false; _confirmDelQ = null; _searching = false;
  _editBank = false; _selected = new Set(); _dragId = null; _bulkItems = [];
  _hubTab = 'export'; _exportFormat = 'json'; _exportScope = 'current'; _exportChosen = new Set(); _exportCache = {}; _hubExportText = '';
  _importMode = 'text'; _importItems = []; _importTarget = '';

  viewEl.innerHTML =
    '<div class="cdx-bank">' +
      '<aside class="cdx-bank-sets">' +
        '<div class="cdx-bank-sets-header">' +
          '<span>' + t('questions.bank_sets_header') + '</span>' +
          '<div class="cdx-bank-sets-header-actions">' +
            '<button class="cdx-bank-iconbtn" data-act="audiences" type="button" title="' + _esc(t('questions.bank_audiences')) + '" aria-label="' + _esc(t('questions.bank_audiences')) + '">⊞</button>' +
            '<button class="cdx-bank-iconbtn" data-act="hub" type="button" title="' + _esc(t('questions.bank_hub')) + '" aria-label="' + _esc(t('questions.bank_hub')) + '">⇅</button>' +
            '<button class="cdx-btn cdx-btn-sm" data-act="new-set" type="button">' + t('questions.bank_new_set_btn') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-bank-setlist" id="cdx-bank-setlist"></div>' +
      '</aside>' +
      '<section class="cdx-bank-main">' +
        '<div class="cdx-bank-search-bar">' +
          '<input class="cdx-input cdx-bank-search-input" type="search" placeholder="' + _esc(t('questions.bank_search_top_placeholder')) + '" autocomplete="off">' +
          '<button class="cdx-btn cdx-btn-sm cdx-bank-search-clear" data-act="search-clear" type="button" hidden aria-label="x">✗</button>' +
        '</div>' +
        '<div class="cdx-bank-body" id="cdx-bank-body"></div>' +
      '</section>' +
    '</div>' +
    '<div class="cdx-modal-backdrop cdx-bank-modal" id="cdx-bank-modal" hidden>' +
      '<div class="cdx-modal">' +
        '<div class="cdx-modal-title cdx-bank-modal-title"></div>' +
        '<div id="cdx-bank-composer"></div>' +
        '<p class="cdx-bank-modal-err"></p>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" data-act="cancel-q" type="button">' + t('questions.bank_cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="save-q" type="button">' + t('questions.bank_save') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-modal-backdrop cdx-bank-modal" id="cdx-bank-bulk" hidden>' +
      '<div class="cdx-modal cdx-bank-bulk-card">' +
        '<div class="cdx-modal-title">' + t('questions.bank_bulk_title') + '</div>' +
        '<div id="cdx-bank-bulk-config">' +
          '<div class="cdx-bank-bulk-row">' +
            '<label class="cdx-comp-field cdx-bank-bulk-type-field"><span class="cdx-comp-label">' + t('questions.bank_type') + '</span>' +
              '<select class="cdx-select cdx-bank-bulk-type">' +
                _BULK_TYPES.map((ty) => '<option value="' + ty + '">' + t('questions.type_' + ty) + '</option>').join('') +
              '</select></label>' +
            '<label class="cdx-comp-field cdx-bank-bulk-count-field"><span class="cdx-comp-label">' + t('questions.bank_bulk_count') + '</span>' +
              '<input type="number" class="cdx-input cdx-bank-bulk-count" min="2" max="20" value="5"></label>' +
          '</div>' +
          '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_bulk_theme') + '</span>' +
            '<textarea class="cdx-input cdx-bank-bulk-theme" rows="3"></textarea></label>' +
        '</div>' +
        '<div id="cdx-bank-bulk-review" hidden>' +
          '<p class="cdx-bank-bulk-hint">' + t('questions.bank_bulk_review_hint') + '</p>' +
          '<div class="cdx-bank-bulk-list" id="cdx-bank-bulk-list"></div>' +
        '</div>' +
        '<p class="cdx-bank-modal-err cdx-bank-bulk-err"></p>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" data-act="bulk-cancel" type="button">' + t('questions.bank_cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="bulk-generate" type="button">' + t('questions.bank_bulk_generate_btn') + '</button>' +
          '<button class="cdx-btn" data-act="bulk-discard" type="button" hidden>' + t('questions.bank_bulk_discard') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="bulk-save" type="button" hidden>' + t('questions.bank_bulk_save') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-modal-backdrop cdx-bank-modal" id="cdx-bank-hub" hidden>' +
      '<div class="cdx-modal cdx-bank-hub-card">' +
        '<div class="cdx-modal-title cdx-bank-hub-title"></div>' +
        '<div class="cdx-bank-tabs cdx-bank-hub-tabs">' +
          '<button class="cdx-bank-hub-tab active" data-hub="export" type="button">' + t('questions.bank_export') + '</button>' +
          '<button class="cdx-bank-hub-tab" data-hub="import" type="button">' + t('questions.bank_import') + '</button>' +
        '</div>' +
        '<div id="cdx-bank-hub-export">' +
          '<div class="cdx-bank-hub-scope">' +
            '<span class="cdx-comp-label">' + t('questions.bank_scope') + '</span>' +
            '<div class="cdx-bank-tabs">' +
              '<button class="cdx-bank-scope-btn active" data-scope="current" type="button">' + t('questions.bank_scope_current') + '</button>' +
              '<button class="cdx-bank-scope-btn" data-scope="all" type="button">' + t('questions.bank_scope_all') + '</button>' +
              '<button class="cdx-bank-scope-btn" data-scope="choose" type="button">' + t('questions.bank_scope_choose') + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="cdx-bank-hub-checklist" hidden></div>' +
          '<div class="cdx-bank-tabs">' +
            '<button class="cdx-bank-export-tab active" data-fmt="json" type="button">JSON</button>' +
            '<button class="cdx-bank-export-tab" data-fmt="md" type="button">Markdown</button>' +
            '<button class="cdx-bank-export-tab" data-fmt="csv" type="button">CSV</button>' +
          '</div>' +
          '<textarea class="cdx-input cdx-bank-export-out" readonly rows="11"></textarea>' +
          '<div class="cdx-modal-actions">' +
            '<button class="cdx-btn" data-act="hub-close" type="button">' + t('questions.bank_close') + '</button>' +
            '<button class="cdx-btn" data-act="export-download" type="button">' + t('questions.bank_download') + '</button>' +
            '<button class="cdx-btn cdx-btn-primary" data-act="export-copy" type="button">' + t('questions.bank_copy') + '</button>' +
          '</div>' +
        '</div>' +
        '<div id="cdx-bank-hub-import" hidden>' +
          '<div id="cdx-bank-import-config">' +
            '<div class="cdx-bank-tabs">' +
              '<button class="cdx-bank-import-tab active" data-mode="text" type="button">' + t('questions.bank_import_tab_text') + '</button>' +
              '<button class="cdx-bank-import-tab" data-mode="json" type="button">' + t('questions.bank_import_tab_json') + '</button>' +
            '</div>' +
            '<label class="cdx-comp-field cdx-bank-import-target-row"><span class="cdx-comp-label">' + t('questions.bank_target') + '</span>' +
              '<input class="cdx-input cdx-bank-import-target" list="cdx-bank-target-list" autocomplete="off">' +
              '<datalist id="cdx-bank-target-list"></datalist>' +
            '</label>' +
            '<textarea class="cdx-input cdx-bank-import-in" rows="7"></textarea>' +
          '</div>' +
          '<div id="cdx-bank-import-review" hidden>' +
            '<p class="cdx-bank-bulk-hint">' + t('questions.bank_bulk_review_hint') + '</p>' +
            '<div class="cdx-bank-bulk-list" id="cdx-bank-import-list"></div>' +
          '</div>' +
          '<p class="cdx-bank-modal-err cdx-bank-import-err"></p>' +
          '<div class="cdx-modal-actions">' +
            '<button class="cdx-btn" data-act="hub-close" type="button">' + t('questions.bank_close') + '</button>' +
            '<button class="cdx-btn cdx-btn-primary" data-act="import-process" type="button">' + t('questions.bank_import_organize') + '</button>' +
            '<button class="cdx-btn" data-act="import-discard" type="button" hidden>' + t('questions.bank_bulk_discard') + '</button>' +
            '<button class="cdx-btn cdx-btn-primary" data-act="import-save" type="button" hidden>' + t('questions.bank_bulk_save') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-modal-backdrop cdx-bank-modal" id="cdx-bank-aud" hidden>' +
      '<div class="cdx-modal cdx-bank-aud-card">' +
        '<div class="cdx-modal-title">' + t('questions.bank_audiences') + '</div>' +
        '<div class="cdx-bank-tabs">' +
          '<button class="cdx-bank-aud-tab active" data-audtab="audiences" type="button">' + t('questions.aud_tab_audiences') + '</button>' +
          '<button class="cdx-bank-aud-tab" data-audtab="variables" type="button">' + t('questions.aud_tab_variables') + '</button>' +
        '</div>' +
        '<div id="cdx-bank-aud-content"></div>' +
        '<p class="cdx-bank-modal-err cdx-bank-aud-err"></p>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" data-act="aud-close" type="button">' + t('questions.bank_close') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="aud-save" type="button">' + t('questions.bank_save') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const search = viewEl.querySelector('.cdx-bank-search-input');
  _on(search, 'input', () => {
    if (_searchTimer) clearTimeout(_searchTimer);
    const v = search.value;
    _searchTimer = setTimeout(() => _runSearch(v), 250);
  });
  _cleanup.push(() => { if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; } });

  // Sets sidebar (delegated)
  _on(viewEl.querySelector('#cdx-bank-setlist'), 'click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'pick') { _selectSet(btn.getAttribute('data-set')); }
    else if (act === 'newset-ok') { _submitNewSet(); }
    else if (act === 'newset-cancel') { _newSetActive = false; _renderSets(); }
  });
  _on(viewEl.querySelector('#cdx-bank-setlist'), 'keydown', (e) => {
    if (!e.target.classList.contains('cdx-bank-newset-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); _submitNewSet(); }
    if (e.key === 'Escape') { _newSetActive = false; _renderSets(); }
  });

  // Sets header
  _on(viewEl.querySelector('.cdx-bank-sets-header'), 'click', (e) => {
    if (e.target.closest('[data-act="new-set"]')) { _newSetActive = true; _confirmDelSet = false; _renaming = false; _renderSets(); }
    else if (e.target.closest('[data-act="hub"]')) { _openHub(); }
    else if (e.target.closest('[data-act="audiences"]')) { _openAudiences(); }
  });

  // Audience matrix manager (delegated: tabs + add/remove + cell edits + save).
  const audModal = viewEl.querySelector('#cdx-bank-aud');
  _on(audModal, 'click', (e) => {
    if (e.target === audModal) { _closeAudiences(); return; }
    const tab = e.target.closest('[data-audtab]');
    if (tab) { _audTab = tab.getAttribute('data-audtab'); _renderAudContent(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'aud-close') _closeAudiences();
    else if (act === 'aud-save') _saveAudiences();
    else if (act === 'aud-add') _addAudience();
    else if (act === 'aud-ai') _aiCreateAudience();
    else if (act === 'aud-del') _delAudience(btn.getAttribute('data-aud'));
    else if (act === 'var-add') _addVariable();
    else if (act === 'var-del') _delVariable(btn.getAttribute('data-var'));
  });
  // Cell edits mutate the in-memory config without a re-render (keep focus).
  _on(audModal, 'input', (e) => {
    const lbl = e.target.closest('.cdx-aud-label');
    if (lbl) { const k = lbl.getAttribute('data-aud-label'); if (_audienceConfig.audiences[k]) _audienceConfig.audiences[k].label = lbl.value; return; }
    const txt = e.target.closest('.cdx-var-text');
    if (txt) { _ensureCell(txt.getAttribute('data-aud'), txt.getAttribute('data-var')).text = txt.value; }
  });
  _on(audModal, 'change', (e) => {
    const g = e.target.closest('.cdx-var-g');
    if (g) { _ensureCell(g.getAttribute('data-aud'), g.getAttribute('data-var')).g = g.value; return; }
    const n = e.target.closest('.cdx-var-n');
    if (n) { _ensureCell(n.getAttribute('data-aud'), n.getAttribute('data-var')).n = n.value; }
  });

  // Search clear
  _on(viewEl.querySelector('.cdx-bank-search-bar'), 'click', (e) => {
    if (e.target.closest('[data-act="search-clear"]')) _clearSearch();
  });

  // Question area (delegated click)
  _on(viewEl.querySelector('#cdx-bank-body'), 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'addq') { _confirmDelQ = null; _openModal(null); }
    else if (act === 'bulk') { _openBulk(); }
    else if (act === 'edit-bank') { _toggleEditBank(); }
    else if (act === 'select') {
      const qid = btn.getAttribute('data-qid');
      if (_selected.has(qid)) _selected.delete(qid); else _selected.add(qid);
      _renderConjunto();
    }
    else if (act === 'move-do') { await _moveSelected(); }
    else if (act === 'move-cancel') { _selected.clear(); _renderConjunto(); }
    else if (act === 'edit') {
      const qid = btn.getAttribute('data-qid');
      const qq = _questions.find((x) => String(x.id) === String(qid));
      if (qq) _openModal(_composerInitial(qq));
    }
    else if (act === 'delq') { _confirmDelQ = btn.getAttribute('data-qid'); _renderConjunto(); }
    else if (act === 'delq-no') { _confirmDelQ = null; _renderConjunto(); }
    else if (act === 'delq-yes') {
      const qid = btn.getAttribute('data-qid');
      const qq = _questions.find((x) => String(x.id) === String(qid));
      _confirmDelQ = null;
      if (qq) { try { await api.deleteQuestion({ list_name: _currentSet, question: qq.question }); } catch (err) { notice.internal(err); } }
      await _loadQuestions();
      _loadSets();
    }
    else if (act === 'rename') { _renaming = true; _confirmDelSet = false; _renderConjunto(); }
    else if (act === 'rename-cancel') { _renaming = false; _renderConjunto(); }
    else if (act === 'rename-save') {
      const inp = _q('.cdx-bank-rename-input');
      const newName = inp ? inp.value.trim() : '';
      _renaming = false;
      if (newName && newName !== _currentSet) {
        let res; try { res = await api.updateSet({ original_name: _currentSet, new_name: newName }); } catch (err) { notice.internal(err); res = null; }
        if (res && res.error) notice.warn(t('questions.bank_rename_error'));
        else _currentSet = newName;
      }
      await _loadSets();
      if (_currentSet) _loadQuestions();
    }
    else if (act === 'delset') { _confirmDelSet = true; _renaming = false; _renderConjunto(); }
    else if (act === 'delset-no') { _confirmDelSet = false; _renderConjunto(); }
    else if (act === 'delset-yes') {
      _confirmDelSet = false;
      const target = _currentSet;
      try { await api.deleteSet({ list_name: target }); } catch (err) { notice.internal(err); }
      _currentSet = null;
      await _loadSets();
      _loadQuestions();
    }
    else if (act === 'goto') { const set = btn.getAttribute('data-set'); _clearSearch(); _selectSet(set); }
  });

  // Drag to reorder (delegated; only active in edit-bank mode).
  const bodyEl = viewEl.querySelector('#cdx-bank-body');
  _on(bodyEl, 'dragstart', (e) => {
    if (!_editBank) return;
    const card = e.target.closest('.cdx-q'); if (!card) return;
    _dragId = card.getAttribute('data-qid');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  _on(bodyEl, 'dragover', (e) => {
    if (!_editBank || _dragId == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  _on(bodyEl, 'drop', async (e) => {
    if (!_editBank || _dragId == null) return;
    e.preventDefault();
    const card = e.target.closest('.cdx-q');
    const tgtId = card ? card.getAttribute('data-qid') : null;
    const dragId = _dragId; _dragId = null;
    if (!tgtId || tgtId === dragId) return;
    const ids = _questions.map((q) => String(q.id));
    const from = ids.indexOf(String(dragId));
    const to = ids.indexOf(String(tgtId));
    if (from === -1 || to === -1) return;
    const moved = _questions.splice(from, 1)[0];
    _questions.splice(to, 0, moved);
    _renderConjunto();
    try { await api.reorder({ list_name: _currentSet, ordered_ids: _questions.map((q) => q.id) }); } catch (err) { notice.internal(err); }
  });

  // Editor modal (delegated)
  _on(viewEl.querySelector('#cdx-bank-modal'), 'click', (e) => {
    if (e.target === viewEl.querySelector('#cdx-bank-modal')) { _closeModal(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel-q') _closeModal();
    else if (act === 'save-q') _saveQuestion();
  });

  // Bulk modal (delegated)
  _on(viewEl.querySelector('#cdx-bank-bulk'), 'click', (e) => {
    if (e.target === viewEl.querySelector('#cdx-bank-bulk')) { _closeBulk(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'bulk-cancel' || act === 'bulk-discard') _closeBulk();
    else if (act === 'bulk-generate') _bulkGenerate();
    else if (act === 'bulk-save') _bulkSave();
  });

  // Import / Export hub (delegated): tab + scope + format + checklist + copy/
  // download + import process/save.
  _on(viewEl.querySelector('#cdx-bank-hub'), 'click', (e) => {
    const root = viewEl.querySelector('#cdx-bank-hub');
    if (e.target === root) { _closeHub(); return; }
    if (e.target.matches && e.target.matches('.cdx-bank-hub-checklist input[type="checkbox"]')) {
      const set = e.target.getAttribute('data-set');
      if (e.target.checked) _exportChosen.add(set); else _exportChosen.delete(set);
      _renderHubExport();
      return;
    }
    const btn = e.target.closest('[data-act], [data-hub], [data-scope], [data-fmt], [data-mode]');
    if (!btn) return;
    const hub = btn.getAttribute('data-hub');
    if (hub) { _hubTab = hub; _renderHubTabs(); if (hub === 'export') _renderHubExport(); return; }
    const scope = btn.getAttribute('data-scope');
    if (scope) { _exportScope = scope; _renderHubExport(); return; }
    const fmt = btn.getAttribute('data-fmt');
    if (fmt) { _exportFormat = fmt; _renderHubExport(); return; }
    const mode = btn.getAttribute('data-mode');
    if (mode) { _importMode = mode; const err = _q('.cdx-bank-import-err'); if (err) err.textContent = ''; _syncImportTabs(); return; }
    const act = btn.getAttribute('data-act');
    if (act === 'hub-close') _closeHub();
    else if (act === 'export-copy') {
      const b = btn; const orig = b.textContent;
      _copy(_hubExportText).then(() => { b.textContent = t('questions.bank_copied'); setTimeout(() => { b.textContent = orig; }, 1500); });
    }
    else if (act === 'export-download') _exportDownload();
    else if (act === 'import-process') _importProcess();
    else if (act === 'import-discard') _closeHub();
    else if (act === 'import-save') _importSave();
  });

  // Escape closes whichever modal is open (when not mid-typing in a field).
  _on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    const hub = _q('#cdx-bank-hub');
    if (hub && !hub.hidden) { _closeHub(); return; }
    const bulk = _q('#cdx-bank-bulk');
    if (bulk && !bulk.hidden) { _closeBulk(); return; }
    const modal = _q('#cdx-bank-modal');
    if (modal && !modal.hidden) { _closeModal(); return; }
    const aud = _q('#cdx-bank-aud');
    if (aud && !aud.hidden) { _closeAudiences(); return; }
    if (_editBank) { _editBank = false; _selected.clear(); _renderConjunto(); }
  });

  _loadSets();
  _loadQuestions();
  _loadAudienceConfig();
}

function _submitNewSet() {
  const inp = _q('.cdx-bank-newset-input');
  const name = inp ? inp.value.trim() : '';
  if (!name) { _newSetActive = false; _renderSets(); return; }
  if (_banks.some((b) => b.list_name === name)) { _newSetActive = false; _selectSet(name); return; }
  // The set persists server-side once its first question is saved (add_question
  // creates the list). Mark it active locally and open an empty question list.
  _newSetActive = false;
  _banks = [{ list_name: name, count: 0 }].concat(_banks);
  _currentSet = name; _questions = [];
  _editBank = false; _selected.clear();
  _renderSets();
  _renderConjunto();
}

export function unmount() {
  _destroyComposer();
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  _viewEl = null; _currentSet = null; _banks = []; _questions = [];
  _newSetActive = false; _renaming = false; _confirmDelSet = false; _confirmDelQ = null; _searching = false;
  _editBank = false; _selected = new Set(); _dragId = null; _bulkItems = [];
  _hubTab = 'export'; _exportFormat = 'json'; _exportScope = 'current'; _exportChosen = new Set(); _exportCache = {}; _hubExportText = '';
  _importMode = 'text'; _importItems = []; _importTarget = '';
  _audienceConfig = null; _audTab = 'audiences'; setAudienceConfig(null);
}
