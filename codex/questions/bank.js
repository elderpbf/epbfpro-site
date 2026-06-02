// questions/bank.js
// Codex Questions -> Bank sub-tab (native, host/admin). A faithful re-port of the
// legacy ClassPulse cp-banks-layout: a Conjuntos sidebar (pick, create inline,
// rename inline, delete) on the left; a question area on the right whose top
// carries a cross-set search bar, then the conjunto header
// [Editar banco | Editar nome | Excluir conjunto], then the "Questoes" header
// [+ Gerar em Lote | + Nova questao], then the question list. Question cards
// preview their options (A/B/C/D, correct highlighted). Add/edit happen in a
// native modal that reuses the shared question-composer plus AI generate/improve.
// All backend access goes through the facade (questions + ai); all strings
// through t(); destructive actions use an inline confirm (no native confirm).
// No polling, so unmount drops listeners, the search timer and the composer.
//
// Deploy 1 scope: everything above EXCEPT the "Editar banco" reorder/move mode
// and the "Gerar em Lote" bulk modal, which render as disabled buttons (faithful
// layout) and activate in Deploy 2.
import { questions as api, ai } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import { mountComposer } from './question-composer.js';

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

// Pure: move an item up/down, immutable, clamped at the ends. (Used by the
// Deploy 2 reorder mode; kept here as the pure seam its tests already cover.)
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

const _LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Parse a stored question's options into a string array (mc/tf/poll). rating /
// numeric carry an {min,max} object instead, which has no A/B/C/D preview.
function _optionList(q) {
  let opts = q.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts || '[]'); } catch (_) { opts = []; } }
  return Array.isArray(opts) ? opts : [];
}

// The correct-answer field is a scalar index, a JSON array string (multi), or ''.
function _correctSet(q) {
  const raw = q.correct_answer;
  if (raw === null || raw === undefined || raw === '') return new Set();
  if (typeof raw === 'number') return new Set([raw]);
  const s = String(raw).trim();
  if (s[0] === '[') { try { const a = JSON.parse(s); return new Set((a || []).map(Number)); } catch (_) { return new Set(); } }
  const n = parseInt(s, 10);
  return new Set(Number.isInteger(n) ? [n] : []);
}

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
  const confirming = _confirmDelQ != null && String(_confirmDelQ) === String(q.id);
  const foot = confirming
    ? '<div class="cdx-q-foot">' + _typeBadge(q.type) +
        '<span class="cdx-q-confirm">' + t('questions.bank_delete_q') + '</span>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-act="delq-yes" data-qid="' + _esc(q.id) + '" type="button">' + t('questions.bank_yes') + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-act="delq-no" type="button">' + t('questions.bank_no') + '</button>' +
      '</div>'
    : '<div class="cdx-q-foot">' + _typeBadge(q.type) +
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
      '<button class="cdx-btn cdx-btn-sm" data-act="edit-bank" type="button" disabled title="Deploy 2">' + t('questions.bank_edit_bank') + '</button>' +
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
      '<button class="cdx-btn cdx-btn-sm" data-act="bulk" type="button" disabled title="Deploy 2">' + t('questions.bank_bulk_generate') + '</button>' +
      '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" data-act="addq" type="button">' + t('questions.bank_new_question') + '</button>' +
    '</div>' +
  '</div>';
}

function _renderConjunto() {
  const body = _q('#cdx-bank-body');
  if (!body) return;
  const list = _questions.length
    ? _questions.map(_qCard).join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_empty_questions') + '</div>';
  body.innerHTML = _conjuntoHeader() + _renameRow() + _qHeader() + '<div class="cdx-bank-qlist">' + list + '</div>';
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
  _renderSets();
  _loadQuestions();
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

function _remountComposer(initial) {
  const host = _q('#cdx-bank-composer');
  if (!host) return;
  _destroyComposer();
  _editingOriginal = (initial && initial._original != null) ? initial._original : _editingOriginal;
  _composer = mountComposer(host, initial);
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

// AI: reads the composer, calls ai.question (generate from prompt, or improve an
// existing question), then re-mounts the composer pre-filled with the result.
async function _aiFill(kind) {
  if (!_composer) return;
  const cur = _composer.read();
  const text = String(cur.question || '').trim();
  const errEl = _q('.cdx-bank-modal-err');
  if (errEl) errEl.textContent = '';
  if (!text) { if (errEl) errEl.textContent = t(kind === 'improve' ? 'questions.bank_ai_improve_empty' : 'questions.bank_ai_empty'); return; }
  const type = cur.type || 'mc';
  const maxSel = (cur.max_select == null) ? 1 : cur.max_select;
  const params = (kind === 'improve')
    ? { improve_from: text, type: type, max_select: maxSel }
    : { prompt: text, type: type, max_select: maxSel };
  let res; try { res = await ai.question(params); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  if (!res) { if (errEl) errEl.textContent = t('questions.bank_ai_error'); return; }
  const out = res.ai || res;
  const correct = Array.isArray(out.correct) ? out.correct.map(Number)
    : (typeof out.correct === 'number' ? [out.correct] : []);
  _remountComposer({
    _original: _editingOriginal,
    type: type,
    question: out.question || '',
    options: Array.isArray(out.options) ? out.options : [],
    correct: correct,
    correct_answers: correct,
    max_select: maxSel,
  });
}

// ---- Cross-set search ----
async function _runSearch(query) {
  const body = _q('#cdx-bank-body');
  if (!body) return;
  const term = (query || '').trim();
  if (term.length < 2) { _searching = false; _toggleSearchClear(false); _loadQuestions(); return; }
  _searching = true;
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

  viewEl.innerHTML =
    '<div class="cdx-bank">' +
      '<aside class="cdx-bank-sets">' +
        '<div class="cdx-bank-sets-header">' +
          '<span>' + t('questions.bank_sets_header') + '</span>' +
          '<button class="cdx-btn cdx-btn-sm" data-act="new-set" type="button">' + t('questions.bank_new_set_btn') + '</button>' +
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
        '<div class="cdx-bank-ai-row">' +
          '<button class="cdx-btn cdx-btn-sm" data-act="ai-generate" type="button">' + t('questions.bank_generate') + '</button>' +
          '<button class="cdx-btn cdx-btn-sm" data-act="ai-improve" type="button">' + t('questions.bank_improve') + '</button>' +
        '</div>' +
        '<p class="cdx-bank-modal-err"></p>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" data-act="cancel-q" type="button">' + t('questions.bank_cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" data-act="save-q" type="button">' + t('questions.bank_save') + '</button>' +
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
  });

  // Search clear
  _on(viewEl.querySelector('.cdx-bank-search-bar'), 'click', (e) => {
    if (e.target.closest('[data-act="search-clear"]')) _clearSearch();
  });

  // Question area (delegated)
  _on(viewEl.querySelector('#cdx-bank-body'), 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'addq') { _confirmDelQ = null; _openModal(null); }
    else if (act === 'edit') {
      const qid = btn.getAttribute('data-qid');
      const qq = _questions.find((x) => String(x.id) === String(qid));
      if (qq) _openModal(qq);
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

  // Modal (delegated)
  _on(viewEl.querySelector('#cdx-bank-modal'), 'click', (e) => {
    if (e.target === viewEl.querySelector('#cdx-bank-modal')) { _closeModal(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel-q') _closeModal();
    else if (act === 'save-q') _saveQuestion();
    else if (act === 'ai-generate') _aiFill('generate');
    else if (act === 'ai-improve') _aiFill('improve');
  });

  // Escape closes the modal (when not typing) before anything else.
  _on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = _q('#cdx-bank-modal');
    if (modal && !modal.hidden) { _closeModal(); }
  });

  _loadSets();
  _loadQuestions();
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
}
