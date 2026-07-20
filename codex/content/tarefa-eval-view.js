// content/tarefa-eval-view.js
// track-45 Fatia 1: dev-only preview of "AI evaluation of tarefa responses".
// A projectable synthesis screen: one button, a loading state, and the result
// as three clearly labeled groups (aderente / ponto relevante / divergiu),
// each showing ONLY the anonymous response excerpt (+ a short note when the
// model gave one), never a name, never a submission id. Mounted inside a
// modal opened from content/tarefas.js (._openTevalModal), gated behind the
// bs_debug flag, and run on the REAL submissions for the item (never a
// seed/demo fallback: with zero real answers, mount() renders the no-answers
// message and no run button at all, see _noAnswers below).
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
let _onOpenResponse = null; // (index) => void, opens the real answer in the list; null when the caller has none to jump to
let _status = 'idle';   // 'idle' | 'loading' | 'done' | 'error'
let _result = null;     // { groups, notes?, missing?, total?, fallback? }
let _errorCode = null;
let _errorDetail = null;
let _onClick = null;
let _noAnswers = false; // true when ctx.responses is empty: no run button renders, the AI is structurally uncallable
let _onResult = null;   // (result) => void, so the caller can persist a fresh synthesis
let _synthesizedAt = null; // epoch ms of the synthesis on screen (from cache or from this run)
let _fromCache = false;    // true while what is shown was restored, not just computed

function _log(msg) {
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') window.bsLog(msg, 'error');
}

function _responseText(idx) {
  const r = (_responses || []).find((x) => Number(x.index) === Number(idx));
  return r ? (r.text || '') : '';
}

function _errorMessage() {
  if (_errorCode === 'rate_limited') return t('tarefas.eval_rate_limited');
  if (_errorCode === 'payload_too_large') {
    // Never silently truncate: say the cohort is too big for one pass and let the
    // instructor decide, rather than shipping a synthesis that quietly lost content.
    return t('tarefas.eval_too_large')
      .replace('{chars}', String((_errorDetail && _errorDetail.chars) || '?'))
      .replace('{limit}', String((_errorDetail && _errorDetail.limit) || '?'));
  }
  return t('tarefas.eval_error');
}

function _clock(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

// The discreet provenance line, so a restored synthesis is never mistaken for a
// fresh one. Also carries the two honesty warnings: answers the model failed to
// classify, and a run that had to fall back off the chosen model.
function _metaHtml() {
  if (_status !== 'done' || !_result) return '';
  const bits = [];
  if (_synthesizedAt) {
    bits.push(_esc((_fromCache ? t('tarefas.eval_meta_cached') : t('tarefas.eval_meta_fresh')).replace('{time}', _clock(_synthesizedAt))));
  }
  if (_result.total) bits.push(_esc(t('tarefas.eval_meta_count').replace('{n}', String(_result.total))));
  let html = '<div class="cdx-teval-meta">' + bits.join(' · ') + '</div>';
  if (_result.missing && _result.missing.length) {
    html += '<div class="cdx-teval-warn">' +
      _esc(t('tarefas.eval_missing').replace('{n}', String(_result.missing.length))) +
    '</div>';
  }
  if (_result.fallback) {
    html += '<div class="cdx-teval-warn">' + _esc(t('tarefas.eval_fallback_used')) + '</div>';
  }
  return html;
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

// Élder's rule (verbatim intent, track-45 fix): "Essa opção de teste só pode
// existir enquanto a gente estiver aqui. Em produção não pode existir. Ele só vai
// dizer que não houve respostas e não vai fazer." So with zero real answers the
// AI must be STRUCTURALLY uncallable: no toolbar, no run button at all (not a
// disabled one), just the no-answers message. No seed/demo fallback is used here
// or anywhere in this module.
function _render() {
  if (!_viewEl) return;
  if (_noAnswers) {
    _viewEl.innerHTML =
      '<div class="cdx-teval">' +
        '<div class="cdx-teval-empty">' + _esc(t('tarefas.eval_no_answers')) + '</div>' +
      '</div>';
    return;
  }
  const busy = _status === 'loading';
  // No "sintetizar" button: opening IS the trigger (mount auto-runs unless a valid
  // cached synthesis was handed in). The only button left is the explicit escape
  // hatch, which always ignores the cache and recomputes from scratch.
  _viewEl.innerHTML =
    '<div class="cdx-teval">' +
      '<div class="cdx-teval-toolbar">' +
        _metaHtml() +
        '<button class="cdx-btn cdx-btn-vazado cdx-teval-redo" data-act="redo" type="button"' +
          ' title="' + _esc(t('tarefas.eval_redo_hint')) + '"' + (busy ? ' disabled' : '') + '>' +
          _esc(t('tarefas.eval_redo')) +
        '</button>' +
      '</div>' +
      _bodyHtml() +
    '</div>';
}

function _run() {
  if (_noAnswers || _status === 'loading' || typeof _evalFn !== 'function') return;
  _status = 'loading';
  _errorCode = null;
  _errorDetail = null;
  _render();
  Promise.resolve(_evalFn({ statement: _statement, responses: _responses })).then((res) => {
    if (!_viewEl) return; // unmounted meanwhile
    if (res && res.error) {
      _status = 'error';
      _errorCode = res.error;
      _errorDetail = res;
      _log('tarefa-eval-view: ' + res.error);
      toast.err(_errorMessage());
    } else {
      _status = 'done';
      _result = res;
      _fromCache = false;
      _synthesizedAt = Date.now();
      if (typeof _onResult === 'function') {
        try { _onResult(res); } catch (e) { _log('tarefa-eval-view: onResult failed: ' + ((e && e.message) || e)); }
      }
    }
    _render();
  }).catch((e) => {
    if (!_viewEl) return;
    _status = 'error';
    _errorCode = (e && e.message) || String(e);
    _errorDetail = null;
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
  _onResult = typeof ctx.onResult === 'function' ? ctx.onResult : null;
  _status = 'idle';
  _result = null;
  _errorCode = null;
  _errorDetail = null;
  _noAnswers = _responses.length === 0;
  _fromCache = false;
  _synthesizedAt = null;
  // A previously saved synthesis for this exact cohort+enunciado, already translated
  // back into the CURRENT index space by the caller. When present, show it instantly
  // and do NOT call the AI: that is what makes auto-run-on-open safe, since without
  // the cache gate every reopen would fire a fresh call.
  if (!_noAnswers && ctx.initialResult) {
    _status = 'done';
    _result = ctx.initialResult;
    _fromCache = true;
    _synthesizedAt = ctx.initialAt || null;
  }
  _render();
  if (!_noAnswers && _status === 'idle') _run();
  _onClick = (e) => {
    // "Refazer análise": always from zero, cache ignored (the caller clears it).
    if (e.target.closest('[data-act="redo"]')) { e.preventDefault(); _run(); return; }
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
  _errorDetail = null;
  _onClick = null;
  _noAnswers = false;
  _onResult = null;
  _synthesizedAt = null;
  _fromCache = false;
}
