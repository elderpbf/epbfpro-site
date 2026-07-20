// content/tarefa-eval-view.js
// track-45 Fatia 1: dev-only preview of "AI evaluation of tarefa responses".
// A projectable synthesis screen: one button, a loading state, and the result
// as three clearly labeled groups (aderente / ponto relevante / divergiu),
// each showing ONLY the anonymous response excerpt (+ a short note when the
// model gave one), never a name, never a submission id. Mounted inside a
// modal opened from content/tarefas.js (._openTevalModal), gated behind the
// bs_debug flag; never wired into the real answers flow.
//
// Module contract mirrors questions/questions.js: mount(viewEl, ctx) + unmount().
import { t } from '../js/i18n.js';
import { esc as _esc } from '../js/dom.js';
import * as toast from '../js/toast.js';

let _viewEl = null;
let _evalFn = null;
let _statement = '';
let _responses = [];
let _idByIndex = {};        // index -> real submission id, so a click can find it in the answers pane
let _onOpenResponse = null; // (index) => void, opens the real answer in the list; null in the seed/demo case
let _status = 'idle';   // 'idle' | 'loading' | 'done' | 'error'
let _result = null;     // { groups, notes? }
let _errorCode = null;
let _onClick = null;

function _log(msg) {
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') window.bsLog(msg, 'error');
}

function _responseText(idx) {
  const r = (_responses || []).find((x) => Number(x.index) === Number(idx));
  return r ? (r.text || '') : '';
}

function _errorMessage() {
  return _errorCode === 'rate_limited' ? t('tarefas.eval_rate_limited') : t('tarefas.eval_error');
}

// Each item is a clickable comment, never a name: the header line identifies WHICH
// response this is (by index only), the excerpt starts clamped (CSS) and expands in
// place on click, and, when the caller wired a real answer list behind it
// (onOpenResponse), a small button jumps straight to that answer's card.
function _groupColHtml(key, label, indices, notes) {
  const items = (indices || []).map((idx) => {
    const note = notes ? (notes[idx] != null ? notes[idx] : notes[String(idx)]) : null;
    const openBtn = typeof _onOpenResponse === 'function'
      ? '<button class="cdx-btn cdx-btn-sm cdx-btn-vazado cdx-teval-item-open" data-act="open" data-idx="' + idx + '" type="button">' +
          _esc(t('tarefas.eval_open_in_list')) +
        '</button>'
      : '';
    return '<li class="cdx-teval-item" data-act="toggle" data-idx="' + idx + '">' +
      '<div class="cdx-teval-item-head">' + _esc(t('tarefas.eval_item_label')) + ' ' + idx + '</div>' +
      '<div class="cdx-teval-item-text">' + _esc(_responseText(idx)) + '</div>' +
      (note ? '<div class="cdx-teval-item-note">' + _esc(note) + '</div>' : '') +
      (openBtn ? '<div class="cdx-teval-item-actions">' + openBtn + '</div>' : '') +
    '</li>';
  }).join('');
  return '<div class="cdx-teval-col cdx-teval-col--' + key + '">' +
    '<div class="cdx-teval-col-head">' + _esc(label) + ' <span class="cdx-teval-col-count">' + (indices || []).length + '</span></div>' +
    '<ul class="cdx-teval-col-list">' + (items || '<li class="cdx-teval-col-empty">' + _esc(t('tarefas.eval_col_empty')) + '</li>') + '</ul>' +
  '</div>';
}

function _groupsHtml() {
  const g = (_result && _result.groups) || { adherent: [], point: [], diverged: [] };
  const notes = (_result && _result.notes) || {};
  const total = (g.adherent || []).length + (g.point || []).length + (g.diverged || []).length;
  if (!total) return '<div class="cdx-teval-empty">' + _esc(t('tarefas.eval_empty')) + '</div>';
  return '<div class="cdx-teval-groups">' +
    _groupColHtml('adherent', t('tarefas.eval_group_adherent'), g.adherent, notes) +
    _groupColHtml('point', t('tarefas.eval_group_point'), g.point, notes) +
    _groupColHtml('diverged', t('tarefas.eval_group_diverged'), g.diverged, notes) +
  '</div>';
}

function _bodyHtml() {
  if (_status === 'loading') return '<div class="cdx-teval-loading">' + _esc(t('tarefas.eval_loading')) + '</div>';
  if (_status === 'error') return '<div class="cdx-teval-error">' + _esc(_errorMessage()) + '</div>';
  if (_status === 'done') return _groupsHtml();
  return '<div class="cdx-teval-empty">' + _esc(t('tarefas.eval_idle')) + '</div>';
}

function _render() {
  if (!_viewEl) return;
  const busy = _status === 'loading';
  _viewEl.innerHTML =
    '<div class="cdx-teval">' +
      '<div class="cdx-teval-toolbar">' +
        '<button class="cdx-btn cdx-btn-primary cdx-teval-run" data-act="run" type="button"' + (busy ? ' disabled' : '') + '>' +
          _esc(busy ? t('tarefas.eval_loading') : t('tarefas.eval_run')) +
        '</button>' +
      '</div>' +
      _bodyHtml() +
    '</div>';
}

function _run() {
  if (_status === 'loading' || typeof _evalFn !== 'function') return;
  _status = 'loading';
  _render();
  Promise.resolve(_evalFn({ statement: _statement, responses: _responses })).then((res) => {
    if (!_viewEl) return; // unmounted meanwhile
    if (res && res.error) {
      _status = 'error';
      _errorCode = res.error;
      _log('tarefa-eval-view: ' + res.error);
      toast.err(_errorMessage());
    } else {
      _status = 'done';
      _result = res;
    }
    _render();
  }).catch((e) => {
    if (!_viewEl) return;
    _status = 'error';
    _errorCode = (e && e.message) || String(e);
    _log('tarefa-eval-view: ' + _errorCode);
    toast.err(_errorMessage());
    _render();
  });
}

export function mount(viewEl, ctx) {
  ctx = ctx || {};
  _viewEl = viewEl;
  _evalFn = ctx.evalFn;
  _statement = ctx.statement || '';
  _responses = ctx.responses || [];
  _idByIndex = ctx.idByIndex || {};
  _onOpenResponse = typeof ctx.onOpenResponse === 'function' ? ctx.onOpenResponse : null;
  _status = 'idle';
  _result = null;
  _errorCode = null;
  _render();
  _onClick = (e) => {
    if (e.target.closest('[data-act="run"]')) { e.preventDefault(); _run(); return; }
    // Check "open" BEFORE "toggle": both live on the same li (a single delegated
    // listener sees both selectors match on the same click), and opening the real
    // answer must never also flip the excerpt's expand state.
    const openBtn = e.target.closest('[data-act="open"]');
    if (openBtn) {
      e.preventDefault();
      if (_onOpenResponse) _onOpenResponse(Number(openBtn.dataset.idx));
      return;
    }
    const li = e.target.closest('[data-act="toggle"]');
    if (li) { li.classList.toggle('is-expanded'); }
  };
  viewEl.addEventListener('click', _onClick);
}

export function unmount() {
  if (_viewEl && _onClick) _viewEl.removeEventListener('click', _onClick);
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _evalFn = null;
  _statement = '';
  _responses = [];
  _idByIndex = {};
  _onOpenResponse = null;
  _status = 'idle';
  _result = null;
  _errorCode = null;
  _onClick = null;
}
