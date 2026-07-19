// roteiro/roteiro-view.js
// Codex Cohorts, aula sub-tab "Roteiro" (track-46 fatia 1): the two-panel
// conduction plan for a single aula. LEFT = abstract summary (blocos -> pontos,
// a type-coloured dot, rótulo, time; time per bloco). RIGHT = the selected
// ponto (tipo, time, fala de chamada, anotações curtas). A time meter reads
// compat(roteiro, aula.hours) for planejado/reserva/estouro. The roteiro
// carries only order/time/short annotations, never the lesson content itself.
//
// Persistence is fully INJECTED via ctx.store ({ load(aulaId), save(aulaId, r) }):
// this view never knows HOW or WHERE a roteiro is persisted, so the seam swaps
// (dev stub -> real codex-api backend) in fatia 2 without touching this file.
//
// Globals (optional, shared Backstage debug pill): window.bsLog
import { normalizeRoteiro, emptyRoteiro, compat, fmtDur, blocoMin } from '../js/roteiro-model.js';
import { esc as _esc } from '../js/dom.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _ctx = null;          // { store, aula, t }
let _roteiro = null;      // in-memory normalized copy, edited in place then persisted
let _selected = null;     // { bi, pi } indices of the open ponto, or null

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _ctx = ctx || {};
  _roteiro = _load();
  _selected = _firstPontoRef(_roteiro);
  _ensureCss();
  _render();
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('change', _onChange);
  viewEl.addEventListener('keydown', _onKeydown);
}

export function unmount() {
  if (_viewEl) {
    _viewEl.removeEventListener('click', _onClick);
    _viewEl.removeEventListener('change', _onChange);
    _viewEl.removeEventListener('keydown', _onKeydown);
    _viewEl.innerHTML = '';
  }
  _viewEl = null;
  _ctx = null;
  _roteiro = null;
  _selected = null;
}

// ── Store seam (load/save only; no persistence detail leaks past here) ──────
function _load() {
  const aula = (_ctx && _ctx.aula) || {};
  if (_ctx && _ctx.store && typeof _ctx.store.load === 'function') {
    try { return normalizeRoteiro(_ctx.store.load(aula.id)); } catch (e) { _logErr(e); }
  }
  return emptyRoteiro();
}

function _persist() {
  if (!_ctx || !_ctx.store || typeof _ctx.store.save !== 'function') return;
  const aula = _ctx.aula || {};
  try { _ctx.store.save(aula.id, _roteiro); } catch (e) { _logErr(e); }
}

function _logErr(e) {
  const msg = 'codex: roteiro view failed: ' + ((e && e.message) || e);
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') window.bsLog(msg, 'error');
}

// Style is injected here (not <link>ed in index.html this fatia — the shell
// HTML is out of scope). Idempotent by id, so remounting never duplicates it.
// Left in <head> across unmount, same as any once-loaded stylesheet.
function _ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cdx-roteiro-css')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = 'cdx-roteiro-css';
  link.href = new URL('./roteiro.css', import.meta.url).href;
  document.head.appendChild(link);
}

function _firstPontoRef(r) {
  for (let bi = 0; bi < r.blocos.length; bi++) {
    if (r.blocos[bi].pontos.length) return { bi, pi: 0 };
  }
  return null;
}

function _currentPonto() {
  if (!_selected || !_roteiro) return null;
  const b = _roteiro.blocos[_selected.bi];
  return (b && b.pontos[_selected.pi]) || null;
}

// ── Render ───────────────────────────────────────────────────────────────
function _render() {
  if (!_viewEl) return;
  const t = (_ctx && typeof _ctx.t === 'function') ? _ctx.t : ((k) => k);
  const aula = (_ctx && _ctx.aula) || {};
  _viewEl.innerHTML =
    '<div class="cdx-roteiro">' +
      _meterHtml(t, aula) +
      '<div class="cdx-roteiro-body">' +
        '<div class="cdx-roteiro-left">' + _leftHtml(t) + '</div>' +
        '<div class="cdx-roteiro-right">' + _rightHtml(t) + '</div>' +
      '</div>' +
    '</div>';
}

function _meterHtml(t, aula) {
  const c = compat(_roteiro, aula.hours);
  const capMin = (Number(aula.hours) || 0) * 60;
  const pct = capMin > 0 ? Math.min(100, Math.round((c.planejadoMin / capMin) * 100)) : (c.planejadoMin > 0 ? 100 : 0);
  return '<div class="cdx-roteiro-meter' + (c.estouro ? ' is-over' : '') + '">' +
    '<div class="cdx-roteiro-meter-track"><div class="cdx-roteiro-meter-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="cdx-roteiro-meter-text">' +
      '<span class="cdx-roteiro-meter-item"><b>' + _esc(t('roteiro.meter_planned')) + ':</b> ' + _esc(fmtDur(c.planejadoMin)) + '</span>' +
      '<span class="cdx-roteiro-meter-item"><b>' + _esc(t('roteiro.meter_reserve')) + ':</b> ' + _esc(fmtDur(c.reservaMin)) + '</span>' +
      (c.estouro ? '<span class="cdx-roteiro-meter-warn">' + _esc(t('roteiro.meter_overflow')) + '</span>' : '') +
    '</div>' +
  '</div>';
}

function _leftHtml(t) {
  if (!_roteiro.blocos.length) return '<div class="cdx-roteiro-empty">' + _esc(t('roteiro.empty')) + '</div>';
  let html = '';
  _roteiro.blocos.forEach((b, bi) => {
    const nomeTxt = b.pausa ? t('roteiro.tipo_pausa') : (b.nome || t('roteiro.no_rotulo'));
    html += '<div class="cdx-roteiro-bloco' + (b.pausa ? ' is-pausa' : '') + '">' +
      '<div class="cdx-roteiro-bloco-head">' +
        '<span class="cdx-roteiro-bloco-nome">' + _esc(nomeTxt) + '</span>' +
        '<span class="cdx-roteiro-bloco-dur">' + _esc(fmtDur(blocoMin(b))) + '</span>' +
      '</div>' +
      '<div class="cdx-roteiro-pontos">' + b.pontos.map((p, pi) => _pontoRowHtml(p, bi, pi)).join('') + '</div>' +
    '</div>';
  });
  return html;
}

function _pontoRowHtml(p, bi, pi) {
  const isSel = !!(_selected && _selected.bi === bi && _selected.pi === pi);
  return '<div class="cdx-roteiro-ponto' + (isSel ? ' is-selected' : '') + '" data-roteiro-ponto data-bi="' + bi + '" data-pi="' + pi + '" role="button" tabindex="0">' +
    '<span class="cdx-roteiro-dot cdx-roteiro-dot--' + _esc(p.tipo) + '"></span>' +
    '<span class="cdx-roteiro-ponto-rotulo">' + _esc(p.rotulo) + '</span>' +
    '<span class="cdx-roteiro-ponto-dur">' + _esc(fmtDur(p.dur)) + '</span>' +
  '</div>';
}

function _rightHtml(t) {
  const p = _currentPonto();
  if (!p) return '<div class="cdx-roteiro-empty">' + _esc(t('roteiro.select_ponto_prompt')) + '</div>';
  return '<div class="cdx-roteiro-detail">' +
    '<div class="cdx-roteiro-detail-head">' +
      '<span class="cdx-roteiro-detail-badge cdx-roteiro-dot--' + _esc(p.tipo) + '">' + _esc(t('roteiro.tipo_' + p.tipo)) + '</span>' +
      '<span class="cdx-roteiro-detail-dur">' + _esc(fmtDur(p.dur)) + '</span>' +
    '</div>' +
    '<h4 class="cdx-roteiro-detail-title">' + _esc(p.rotulo || t('roteiro.no_rotulo')) + '</h4>' +
    '<div class="cdx-roteiro-field">' +
      '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_chamada')) + '</label>' +
      '<input type="text" class="cdx-roteiro-field-input" data-roteiro-chamada value="' + _esc(p.chamada || '') + '" placeholder="' + _esc(t('roteiro.field_chamada_placeholder')) + '">' +
    '</div>' +
    '<div class="cdx-roteiro-field">' +
      '<label class="cdx-roteiro-field-label">' + _esc(t('roteiro.field_notas')) + '</label>' +
      '<div class="cdx-roteiro-notas-list">' +
        (p.notas.length ? p.notas.map((n, ni) => _notaRowHtml(t, n, ni)).join('') : '<div class="cdx-roteiro-notas-empty">' + _esc(t('roteiro.notas_empty')) + '</div>') +
      '</div>' +
      '<div class="cdx-roteiro-notas-add">' +
        '<input type="text" class="cdx-roteiro-notas-add-input" data-roteiro-nota-input placeholder="' + _esc(t('roteiro.notas_add_placeholder')) + '">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-roteiro-nota-add>' + _esc(t('roteiro.notas_add_btn')) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _notaRowHtml(t, n, ni) {
  return '<div class="cdx-roteiro-nota">' +
    '<span class="cdx-roteiro-nota-text">' + _esc(n) + '</span>' +
    '<button type="button" class="cdx-roteiro-nota-rm" data-roteiro-nota-rm data-ni="' + ni + '" title="' + _esc(t('roteiro.nota_remove_title')) + '" aria-label="' + _esc(t('roteiro.nota_remove_title')) + '">×</button>' +
  '</div>';
}

// ── Wiring (single delegated listener per event type, attached once at mount) ─
function _onClick(e) {
  const row = e.target.closest && e.target.closest('[data-roteiro-ponto]');
  if (row) { _selected = { bi: Number(row.dataset.bi), pi: Number(row.dataset.pi) }; _render(); return; }
  const rm = e.target.closest && e.target.closest('[data-roteiro-nota-rm]');
  if (rm) {
    const p = _currentPonto();
    const ni = Number(rm.dataset.ni);
    if (p && p.notas[ni] !== undefined) { p.notas.splice(ni, 1); _persist(); _render(); }
    return;
  }
  const addBtn = e.target.closest && e.target.closest('[data-roteiro-nota-add]');
  if (addBtn) { _commitNotaAdd(); }
}

function _onChange(e) {
  const chamada = e.target.closest && e.target.closest('[data-roteiro-chamada]');
  if (chamada) {
    const p = _currentPonto();
    if (p) { p.chamada = String(chamada.value || '').trim(); _persist(); }
  }
}

function _onKeydown(e) {
  if (e.key !== 'Enter') return;
  const row = e.target.closest && e.target.closest('[data-roteiro-ponto]');
  if (row) { e.preventDefault(); _selected = { bi: Number(row.dataset.bi), pi: Number(row.dataset.pi) }; _render(); return; }
  const notaInput = e.target.closest && e.target.closest('[data-roteiro-nota-input]');
  if (notaInput) { e.preventDefault(); _commitNotaAdd(); return; }
  const chamada = e.target.closest && e.target.closest('[data-roteiro-chamada]');
  if (chamada) { chamada.blur(); } // Enter blurs -> the native 'change' handler above persists it
}

function _commitNotaAdd() {
  if (!_viewEl) return;
  const input = _viewEl.querySelector('[data-roteiro-nota-input]');
  const val = input ? String(input.value || '').trim() : '';
  if (!val) return;
  const p = _currentPonto();
  if (!p) return;
  p.notas.push(val);
  _persist();
  _render();
}
