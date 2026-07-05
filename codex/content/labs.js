// content/labs.js
// Codex Content tab, Labs sub-tab. NATIVE cdx- module (full nativization of the
// legacy CTLabsPanel grid; the tracked debt in manifest/FUTURE.md, now done).
//
// Master-detail layout, same shell as the Items sub-tab: a left list of labs
// (each with an inline on/off switch) and a right preview pane that renders the
// selected lab live in an iframe, with a fullscreen button. Reuses the Items
// split classes (cdx-items-split / cdx-items-list / cdx-item-row /
// cdx-item-preview) so there is one master-detail layout, not a per-tab copy.
//
// Shared Codex modules (the lab registry + the fullscreen viewer are now
// Codex-owned ES modules, not backstage globals):
//   js/labs-registry.js  the lab registry (LABS), consumed by Presets + Lessons too
//   js/lab-viewer.js      reusable fullscreen iframe modal
// This module owns only the PANEL UI.
//
// On/off state lives in localStorage 'cv_labs_enabled' with the EXACT contract
// labs-registry.isLabEnabled reads (a map keyed by lab key; missing/true =
// enabled, false = hidden everywhere). Toggling here is therefore instantly
// reflected in the Lessons sidebar and the Presets picker. Filtering stays
// read-time in every consumer, so disabling is instant and reversible.
import { t } from '../js/i18n.js';
import { LABS } from '../js/labs-registry.js';
import { openModal as openLabViewer } from '../js/lab-viewer.js';
import { mountRail } from '../js/list-rail.js';

const LS_KEY = 'cv_labs_enabled';

let _viewEl = null;
let _selectedKey = null;
let _rail = null;         // the left labs list is the shared list-rail (js/list-rail.js)
let _onClick = null;
let _onChange = null;
let _onResize = null;

import { esc as _esc } from '../js/dom.js';

// Default-on map (missing key = enabled), identical to CVLabs.isLabEnabled.
function _readMap() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}
function _writeMap(map) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}
function _isEnabled(key) { return _readMap()[key] !== false; }
function _setEnabled(key, on) {
  const map = _readMap();
  if (on) delete map[key]; else map[key] = false; // default-on is "key absent"
  _writeMap(map);
}

function _labs() {
  return Array.isArray(LABS) ? LABS : null;
}
function _labByKey(key) {
  const labs = _labs();
  return labs ? labs.find((l) => String(l.key) === String(key)) : null;
}

// Keep the current selection if it still exists, else fall back to the first lab.
function _resolveSelection(labs, key) {
  if (!labs || !labs.length) return null;
  return labs.some((l) => String(l.key) === String(key)) ? key : labs[0].key;
}

function _switchHtml(on) {
  return '<label class="cdx-lab-switch" title="' + _esc(t('labs.toggle')) + '">' +
      '<input type="checkbox" class="cdx-lab-switch-input"' + (on ? ' checked' : '') + '>' +
      '<span class="cdx-lab-switch-track"><span class="cdx-lab-switch-thumb"></span></span>' +
    '</label>';
}

// The left labs list adopts the shared list-rail (track-21). Select-only (no drag); the
// rail owns the row shell + selection. renderRow returns the inner content, wrapped in
// .cdx-lab-rowwrap which carries the is-off dim (the rail row itself can't take is-off).
// The on/off switch lives in the row (always visible) and is exempt from selection via
// the rail's rowSelectIgnore, so toggling it never reloads the preview iframe.
function _labRowMain(lab) {
  const on = _isEnabled(lab.key);
  return '<div class="cdx-lab-rowwrap' + (on ? '' : ' is-off') + '">' +
      '<span class="cdx-item-type-icon cdx-lab-icon">&#9672;</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + _esc(lab.title) + '</div>' +
        '<div class="cdx-item-sub">' + _esc(t('labs.lab_prefix')) + ' &middot; ' + _esc(String(lab.key).toUpperCase()) +
          (lab.summary ? ' &middot; ' + _esc(lab.summary) : '') + '</div>' +
      '</div>' +
      _switchHtml(on) +
    '</div>';
}

function _previewHtml(lab) {
  if (!lab) return '<div class="cdx-preview-empty">' + _esc(t('labs.select')) + '</div>';
  const on = _isEnabled(lab.key);
  return '<div class="cdx-lab-preview-head">' +
      '<div class="cdx-lab-preview-meta">' +
        '<div class="cdx-lab-ptitle">' + _esc(lab.title) + '</div>' +
        '<div class="cdx-lab-psub">' + _esc(t('labs.lab_prefix')) + ' &middot; ' + _esc(String(lab.key).toUpperCase()) + '</div>' +
      '</div>' +
      '<div class="cdx-lab-preview-actions">' +
        _switchHtml(on) +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-action="fullscreen">' + _esc(t('labs.preview')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-lab-preview-body" id="cdx-lab-preview-body">' +
      '<div class="cdx-lab-frame-wrap">' +
        '<iframe class="cdx-lab-frame" title="' + _esc(lab.title) + '" loading="lazy" scrolling="no"' +
          ' allow="autoplay; encrypted-media; clipboard-write; fullscreen"' +
          ' src="/codex/labs/' + encodeURIComponent(lab.key) + '/"></iframe>' +
      '</div>' +
    '</div>';
}

function _buildRail() {
  const el = _viewEl.querySelector('#cdx-labs-list');
  if (!el) return;
  _rail = mountRail(el, {
    title: '',
    items: () => _labs() || [],
    getId: (l) => l.key,
    renderRow: (lab) => ({ main: _labRowMain(lab) }),
    selectedId: () => _selectedKey,
    onSelect: (key) => { _selectedKey = key; _rail.render(); _renderPreview(); },
    rowSelectIgnore: '.cdx-lab-switch',
  });
}

function _renderList() {
  if (_rail) _rail.render();
}

function _renderPreview() {
  const pane = _viewEl.querySelector('#cdx-labs-preview');
  if (!pane) return;
  pane.innerHTML = _previewHtml(_labByKey(_selectedKey));
  _scalePreview();
}

// Render the lab at the real page (viewport) size, then transform-scale it down
// to fit the preview pane, so the small preview looks exactly like the fullscreen
// view, only smaller. The iframe is non-interactive (pointer-events off in CSS);
// only the fullscreen button gives a usable lab.
function _scalePreview() {
  if (typeof window === 'undefined') return;
  const body = _viewEl && _viewEl.querySelector('#cdx-lab-preview-body');
  if (!body) return;
  const wrap = body.querySelector('.cdx-lab-frame-wrap');
  const frame = body.querySelector('.cdx-lab-frame');
  if (!wrap || !frame) return;
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const cs = window.getComputedStyle(body);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = Math.max(0, body.clientWidth - padX);
  const availH = Math.max(0, body.clientHeight - padY);
  // CONTAIN: scale to fit BOTH width and height so the mini-preview always fits
  // the pane with no overflow (no scrollbars), responsive to any window size.
  // The wrap is sized to the scaled frame (border-box, so its white border is
  // counted in and can never push the box past the available space).
  const scale = (availW > 0 && availH > 0) ? Math.min(availW / vw, availH / vh)
    : (availW > 0 ? availW / vw : 1);
  frame.style.width = vw + 'px';
  frame.style.height = vh + 'px';
  frame.style.transform = 'scale(' + scale + ')';
  wrap.style.width = (vw * scale) + 'px';
  wrap.style.height = (vh * scale) + 'px';
}

function _render() {
  const labs = _labs();
  if (!labs) {
    _viewEl.innerHTML = '<div class="cdx-empty">' + _esc(t('labs.unavailable')) + '</div>';
    return;
  }
  _selectedKey = _resolveSelection(labs, _selectedKey);
  _viewEl.innerHTML =
    '<div class="cdx-labs">' +
      '<div class="cdx-labs-head">' +
        '<h2 class="cdx-labs-title">' + _esc(t('labs.title')) + '</h2>' +
        '<div class="cdx-labs-hint">' + _esc(t('labs.hint')) + '</div>' +
      '</div>' +
      '<div class="cdx-items-split cdx-labs-split">' +
        '<div class="cdx-items-list" id="cdx-labs-list"></div>' +
        '<div class="cdx-item-preview" id="cdx-labs-preview"></div>' +
      '</div>' +
    '</div>';
  if (_rail) { _rail.destroy(); _rail = null; }
  _buildRail();
  _renderList();
  _renderPreview();
}

function _openFullscreen(key) {
  const lab = _labByKey(key);
  openLabViewer({ key, title: lab && lab.title });
}

export function mount(viewEl) {
  _viewEl = viewEl;
  _render();

  // Row selection is the rail's job (onSelect); the on/off switch is exempt via the rail's
  // rowSelectIgnore. Only the preview's fullscreen button is wired here.
  _onClick = (e) => {
    if (e.target.closest('[data-action="fullscreen"]')) { e.preventDefault(); if (_selectedKey) _openFullscreen(_selectedKey); return; }
  };
  _onChange = (e) => {
    const input = e.target.closest('.cdx-lab-switch-input');
    if (!input) return;
    const checked = input.checked;
    // The switch lives in a rail row (data-id = lab key) or in the preview head (no row;
    // it targets the selected lab).
    const row = input.closest('.cdx-rail-row');
    const key = row ? row.getAttribute('data-id') : _selectedKey;
    if (!key) return;
    _setEnabled(key, checked);
    // Repaint the list rows (switch state + is-off dim) via the rail; do NOT re-render the
    // preview (that would reload the iframe), just sync its head switch for the same lab.
    if (_rail) _rail.render();
    if (String(key) === String(_selectedKey)) {
      _viewEl.querySelectorAll('.cdx-lab-switch-input').forEach((sw) => { sw.checked = checked; });
    }
  };
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('change', _onChange);
  _onResize = () => _scalePreview();
  window.addEventListener('resize', _onResize);
}

export function unmount() {
  if (_onResize && typeof window !== 'undefined') window.removeEventListener('resize', _onResize);
  if (_rail) { _rail.destroy(); _rail = null; }
  if (_viewEl) {
    if (_onClick) _viewEl.removeEventListener('click', _onClick);
    if (_onChange) _viewEl.removeEventListener('change', _onChange);
    _viewEl.innerHTML = '';
  }
  _viewEl = null;
  _onClick = null;
  _onChange = null;
  _onResize = null;
}
