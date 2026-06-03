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
// What stays a shared global (deliberately, not debt):
//   window.CVLabs       (../backstage/classvault/js/cv-labs.js)  the registry
//   window.CVLabViewer  (../backstage/js/cv-lab-viewer.js)       fullscreen preview
// CVLabs is the lab registry consumed by Presets + Lessons too; CVLabViewer is a
// reusable fullscreen iframe modal. This module owns only the PANEL UI.
//
// On/off state lives in localStorage 'cv_labs_enabled' with the EXACT contract
// CVLabs.isLabEnabled reads (a map keyed by lab key; missing/true = enabled,
// false = hidden everywhere). Toggling here is therefore instantly reflected in
// the Aula list, Trilha, and the Presets picker. Filtering stays read-time in
// every consumer, so disabling is instant and reversible.
import { t } from '../js/i18n.js';

const LS_KEY = 'cv_labs_enabled';

let _viewEl = null;
let _selectedKey = null;
let _onClick = null;
let _onChange = null;
let _onResize = null;

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

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
  return (window.CVLabs && Array.isArray(window.CVLabs.LABS)) ? window.CVLabs.LABS : null;
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

function _rowHtml(lab) {
  const on = _isEnabled(lab.key);
  const active = String(lab.key) === String(_selectedKey);
  return '<div class="cdx-item-row' + (active ? ' is-active' : '') + (on ? '' : ' is-off') +
      '" data-lab-key="' + _esc(lab.key) + '">' +
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
          ' src="/backstage/labs/' + encodeURIComponent(lab.key) + '/"></iframe>' +
      '</div>' +
    '</div>';
}

function _renderList() {
  const list = _viewEl.querySelector('#cdx-labs-list');
  const labs = _labs();
  if (!list) return;
  list.innerHTML = (labs || []).map(_rowHtml).join('');
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
  const availW = Math.max(0, body.clientWidth - padX);
  const scale = availW > 0 ? availW / vw : 1;
  frame.style.width = vw + 'px';
  frame.style.height = vh + 'px';
  frame.style.transform = 'scale(' + scale + ')';
  wrap.style.width = availW + 'px';
  wrap.style.height = (vh * scale) + 'px';
}

function _select(key) {
  _selectedKey = key;
  // Re-highlight rows without rebuilding them (keeps the iframe load to the pane).
  _viewEl.querySelectorAll('.cdx-item-row').forEach((r) => {
    r.classList.toggle('is-active', String(r.dataset.labKey) === String(key));
  });
  _renderPreview();
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
  _renderList();
  _renderPreview();
}

function _openFullscreen(key) {
  const lab = _labByKey(key);
  if (window.CVLabViewer && typeof window.CVLabViewer.openModal === 'function') {
    window.CVLabViewer.openModal({ key, title: lab && lab.title });
  } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open('/backstage/labs/' + encodeURIComponent(key) + '/', '_blank');
  }
}

export function mount(viewEl) {
  _viewEl = viewEl;
  _render();

  _onClick = (e) => {
    if (e.target.closest('.cdx-lab-switch')) return; // toggles are handled by change, not selection
    if (e.target.closest('[data-action="fullscreen"]')) { e.preventDefault(); if (_selectedKey) _openFullscreen(_selectedKey); return; }
    const row = e.target.closest('.cdx-item-row');
    if (row && row.dataset.labKey) _select(row.dataset.labKey);
  };
  _onChange = (e) => {
    const input = e.target.closest('.cdx-lab-switch-input');
    if (!input) return;
    // The switch can live in a row (data-lab-key on the row) or in the preview
    // head (no row; it targets the selected lab).
    const row = input.closest('.cdx-item-row');
    const key = row ? row.dataset.labKey : _selectedKey;
    if (!key) return;
    _setEnabled(key, input.checked);
    if (row) row.classList.toggle('is-off', !input.checked);
    // Keep the row switch and the preview head switch in sync for the same lab.
    if (String(key) === String(_selectedKey)) {
      _viewEl.querySelectorAll('.cdx-lab-switch-input').forEach((sw) => { sw.checked = input.checked; });
      const r = _viewEl.querySelector('.cdx-item-row[data-lab-key="' + key + '"]');
      if (r) r.classList.toggle('is-off', !input.checked);
    }
  };
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('change', _onChange);
  _onResize = () => _scalePreview();
  window.addEventListener('resize', _onResize);
}

export function unmount() {
  if (_onResize && typeof window !== 'undefined') window.removeEventListener('resize', _onResize);
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
