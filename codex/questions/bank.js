// questions/bank.js
// Codex Questions -> Bank sub-tab (native, host/admin). A two-pane manager for
// the question bank: sets on the left (pick, create, rename, delete), the
// selected set's questions on the right (add, edit, delete, reorder), plus a
// cross-set search. Add/edit use the shared question-composer. All data through
// the facade; strings through t(); destructive actions use an inline confirm
// (no native confirm/prompt). No polling, so unmount drops listeners + timer.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import { mountComposer } from './question-composer.js';

let _viewEl = null;
let _cleanup = [];
let _composer = null;
let _currentSet = null;
let _banks = [];
let _questions = [];
let _editingSet = null;
let _confirmDelSet = null;
let _editingOriginal = null;
let _searchTimer = null;

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

// Sets sidebar
function _setRow(b) {
  const name = b.list_name;
  if (_editingSet === name) {
    return '<div class="cdx-bank-set cdx-bank-set--edit">' +
      '<input class="cdx-input cdx-bank-rename-input" value="' + _esc(name) + '">' +
      '<button class="cdx-bank-iconbtn" data-act="rename-save" data-set="' + _esc(name) + '" type="button">✓</button>' +
      '<button class="cdx-bank-iconbtn" data-act="rename-cancel" type="button">✗</button>' +
    '</div>';
  }
  if (_confirmDelSet === name) {
    return '<div class="cdx-bank-set cdx-bank-set--confirm">' +
      '<span class="cdx-bank-confirm-text">' + _esc(t('questions.bank_delete_set')) + '?</span>' +
      '<button class="cdx-bank-iconbtn" data-act="delset-yes" data-set="' + _esc(name) + '" type="button">' + t('questions.bank_yes') + '</button>' +
      '<button class="cdx-bank-iconbtn" data-act="delset-no" type="button">' + t('questions.bank_no') + '</button>' +
    '</div>';
  }
  return '<div class="cdx-bank-set' + (name === _currentSet ? ' active' : '') + '">' +
    '<button class="cdx-bank-set-pick" data-act="pick" data-set="' + _esc(name) + '" type="button">' +
      '<span class="cdx-bank-set-name">' + _esc(name) + '</span>' +
      '<span class="cdx-bank-set-count">' + (b.count || 0) + '</span>' +
    '</button>' +
    '<button class="cdx-bank-iconbtn" data-act="rename" data-set="' + _esc(name) + '" type="button" title="' + _esc(t('questions.bank_rename_set')) + '">✎</button>' +
    '<button class="cdx-bank-iconbtn" data-act="delset" data-set="' + _esc(name) + '" type="button" title="' + _esc(t('questions.bank_delete_set')) + '">🗑</button>' +
  '</div>';
}

function _renderSets() {
  const listEl = _q('#cdx-bank-setlist');
  if (!listEl) return;
  listEl.innerHTML = _banks.length
    ? _banks.map(_setRow).join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_empty_sets') + '</div>';
}

async function _loadSets() {
  let res; try { res = await api.listSets(); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  _banks = (res && res.banks) || [];
  _renderSets();
}

// Questions main
function _qRow(q, i, total) {
  return '<div class="cdx-q">' +
    '<div class="cdx-q-order">' +
      '<button class="cdx-bank-iconbtn" data-act="up" data-i="' + i + '" type="button"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="cdx-bank-iconbtn" data-act="down" data-i="' + i + '" type="button"' + (i === total - 1 ? ' disabled' : '') + '>↓</button>' +
    '</div>' +
    '<div class="cdx-q-body"><div class="cdx-q-text">' + _esc(q.question) + '</div>' + _typeBadge(q.type) + '</div>' +
    '<div class="cdx-q-actions">' +
      '<button class="cdx-btn cdx-btn--ghost" data-act="edit" data-qid="' + _esc(q.id) + '" type="button">' + t('questions.bank_edit') + '</button>' +
      '<button class="cdx-btn cdx-btn--danger" data-act="delq" data-q="' + _esc(q.question) + '" type="button">' + t('questions.bank_delete') + '</button>' +
    '</div>' +
  '</div>';
}

async function _loadQuestions() {
  const main = _q('#cdx-bank-main');
  if (!main) return;
  if (!_currentSet) { main.innerHTML = '<div class="cdx-bank-empty">' + t('questions.bank_pick_set') + '</div>'; return; }
  main.innerHTML = '<div class="cdx-bank-loading">' + t('questions.bank_loading') + '</div>';
  let res; try { res = await api.getQuestions({ list_name: _currentSet }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl || !_currentSet) return;
  _questions = (res && res.questions) || [];
  const header = '<div class="cdx-bank-main-header"><h2 class="cdx-bank-main-title">' + _esc(_currentSet) + '</h2>' +
    '<button class="cdx-btn" data-act="addq" type="button">' + t('questions.bank_add_question') + '</button></div>';
  const body = _questions.length
    ? _questions.map((q, i) => _qRow(q, i, _questions.length)).join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_empty_questions') + '</div>';
  main.innerHTML = header + '<div class="cdx-bank-qlist">' + body + '</div>';
}

function _openComposer(initial) {
  const main = _q('#cdx-bank-main');
  if (!main) return;
  main.innerHTML = '<div class="cdx-bank-composer" id="cdx-bank-composer"></div>' +
    '<div class="cdx-bank-composer-actions">' +
      '<button class="cdx-btn" data-act="save-q" type="button">' + t('questions.bank_save') + '</button>' +
      '<button class="cdx-btn cdx-btn--ghost" data-act="cancel-q" type="button">' + t('questions.bank_cancel') + '</button>' +
    '</div>';
  _destroyComposer();
  _editingOriginal = initial ? initial.question : null;
  _composer = mountComposer(main.querySelector('#cdx-bank-composer'), initial);
}

async function _saveQuestion() {
  if (!_composer || !_currentSet) return;
  const payload = _composer.read();
  if (!payload.question) { notice.warn(t('questions.bank_question_text')); return; }
  let res;
  try {
    res = (_editingOriginal != null)
      ? await api.updateQuestion(Object.assign({ list_name: _currentSet, original_question: _editingOriginal }, payload))
      : await api.addQuestion(Object.assign({ list_name: _currentSet }, payload));
  } catch (e) { notice.internal(e); res = null; }
  if (res && res.error) { notice.error(t('questions.bank_save_error')); return; }
  _destroyComposer();
  await _loadQuestions();
  _loadSets();
}

// Cross-set search
async function _runSearch(query) {
  const main = _q('#cdx-bank-main');
  if (!main) return;
  if (!query || query.trim().length < 2) { _loadQuestions(); return; }
  main.innerHTML = '<div class="cdx-bank-loading">' + t('questions.bank_loading') + '</div>';
  let res; try { res = await api.search({ q: query.trim() }); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl) return;
  const found = (res && res.questions) || [];
  const header = '<div class="cdx-bank-main-header"><h2 class="cdx-bank-main-title">' + t('questions.bank_search_results') + '</h2></div>';
  const body = found.length
    ? found.map((q) => '<div class="cdx-q"><div class="cdx-q-body"><div class="cdx-q-text">' + _esc(q.question) + '</div>' +
        _typeBadge(q.type) + '<span class="cdx-q-inset">' + t('questions.bank_in_set') + ' ' + _esc(q.list_name) + '</span></div></div>').join('')
    : '<div class="cdx-bank-empty">' + t('questions.bank_empty_questions') + '</div>';
  main.innerHTML = header + '<div class="cdx-bank-qlist">' + body + '</div>';
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _currentSet = null; _banks = []; _questions = []; _editingSet = null; _confirmDelSet = null; _editingOriginal = null;
  viewEl.innerHTML =
    '<div class="cdx-bank">' +
      '<aside class="cdx-bank-sets">' +
        '<input class="cdx-input cdx-bank-search" type="search" placeholder="' + _esc(t('questions.bank_search_placeholder')) + '">' +
        '<form class="cdx-bank-newset" id="cdx-bank-newset">' +
          '<input class="cdx-input cdx-bank-newset-name" type="text" maxlength="80" placeholder="' + _esc(t('questions.bank_new_set')) + '">' +
          '<button class="cdx-btn" type="submit">' + t('questions.bank_create_set') + '</button>' +
        '</form>' +
        '<div class="cdx-bank-setlist" id="cdx-bank-setlist"></div>' +
      '</aside>' +
      '<section class="cdx-bank-main" id="cdx-bank-main"></section>' +
    '</div>';

  const search = viewEl.querySelector('.cdx-bank-search');
  _on(search, 'input', () => {
    if (_searchTimer) clearTimeout(_searchTimer);
    const v = search.value;
    _searchTimer = setTimeout(() => _runSearch(v), 250);
  });
  _cleanup.push(() => { if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; } });

  _on(viewEl.querySelector('#cdx-bank-newset'), 'submit', (e) => {
    e.preventDefault();
    const input = viewEl.querySelector('.cdx-bank-newset-name');
    const name = input.value.trim();
    if (!name) return;
    _currentSet = name; input.value = '';
    _renderSets();
    _openComposer(null); // the set persists once its first question is saved
  });

  // Sets sidebar (delegated; no inline handlers)
  _on(viewEl.querySelector('#cdx-bank-setlist'), 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const set = btn.getAttribute('data-set');
    if (act === 'pick') { _currentSet = set; _editingSet = null; _confirmDelSet = null; _renderSets(); _loadQuestions(); }
    else if (act === 'rename') { _editingSet = set; _confirmDelSet = null; _renderSets(); }
    else if (act === 'rename-cancel') { _editingSet = null; _renderSets(); }
    else if (act === 'rename-save') {
      const row = btn.closest('.cdx-bank-set');
      const inp = row && row.querySelector('.cdx-bank-rename-input');
      const newName = inp ? inp.value.trim() : '';
      _editingSet = null;
      if (newName && newName !== set) {
        let res; try { res = await api.updateSet({ original_name: set, new_name: newName }); } catch (err) { notice.internal(err); res = null; }
        if (res && res.error) notice.warn(t('questions.bank_rename_error'));
        else if (_currentSet === set) _currentSet = newName;
      }
      await _loadSets();
      if (_currentSet) _loadQuestions();
    }
    else if (act === 'delset') { _confirmDelSet = set; _editingSet = null; _renderSets(); }
    else if (act === 'delset-no') { _confirmDelSet = null; _renderSets(); }
    else if (act === 'delset-yes') {
      _confirmDelSet = null;
      try { await api.deleteSet({ list_name: set }); } catch (err) { notice.internal(err); }
      if (_currentSet === set) { _currentSet = null; _loadQuestions(); }
      _loadSets();
    }
  });

  // Questions / composer (delegated)
  _on(viewEl.querySelector('#cdx-bank-main'), 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'addq') { _openComposer(null); }
    else if (act === 'cancel-q') { _destroyComposer(); _loadQuestions(); }
    else if (act === 'save-q') { _saveQuestion(); }
    else if (act === 'edit') {
      const qid = btn.getAttribute('data-qid');
      const q = _questions.find((x) => String(x.id) === String(qid));
      if (q) _openComposer(q);
    }
    else if (act === 'delq') {
      const qtext = btn.getAttribute('data-q');
      try { await api.deleteQuestion({ list_name: _currentSet, question: qtext }); } catch (err) { notice.internal(err); }
      await _loadQuestions();
      _loadSets();
    }
    else if (act === 'up' || act === 'down') {
      const i = parseInt(btn.getAttribute('data-i'), 10);
      const ids = _questions.map((x) => x.id);
      const next = moveInArray(ids, i, act);
      if (next.join('|') === ids.join('|')) return;
      try { await api.reorder({ list_name: _currentSet, ordered_ids: next }); } catch (err) { notice.internal(err); }
      await _loadQuestions();
    }
  });

  _loadSets();
  _loadQuestions();
}

export function unmount() {
  _destroyComposer();
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  _viewEl = null; _currentSet = null; _banks = []; _questions = [];
  _editingSet = null; _confirmDelSet = null;
}
