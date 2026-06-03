// content/labs.js
// Codex Content tab, Labs sub-tab. NATIVE cdx- module (full nativization of the
// legacy CTLabsPanel grid; the tracked debt in manifest/FUTURE.md, now done).
// Renders the lab on/off grid with native cdx- classes and t() strings, and a
// proper mount/unmount that tears its own listeners down.
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
let _onClick = null;
let _onChange = null;

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

function _cardHtml(lab) {
  const on = _isEnabled(lab.key);
  return '<div class="cdx-lab-card' + (on ? '' : ' is-off') + '" data-lab-key="' + _esc(lab.key) + '">' +
      '<div class="cdx-lab-row">' +
        '<span class="cdx-lab-key">' + _esc(t('labs.lab_prefix')) + ' · ' + _esc(String(lab.key).toUpperCase()) + '</span>' +
        '<label class="cdx-lab-switch" title="' + _esc(t('labs.toggle')) + '">' +
          '<input type="checkbox" class="cdx-lab-switch-input"' + (on ? ' checked' : '') + '>' +
          '<span class="cdx-lab-switch-track"><span class="cdx-lab-switch-thumb"></span></span>' +
        '</label>' +
      '</div>' +
      '<h3 class="cdx-lab-title">' + _esc(lab.title) + '</h3>' +
      (lab.summary ? '<p class="cdx-lab-summary">' + _esc(lab.summary) + '</p>' : '') +
      '<div class="cdx-lab-actions">' +
        '<button type="button" class="cdx-lab-preview" data-action="preview">' + _esc(t('labs.preview')) + '</button>' +
      '</div>' +
    '</div>';
}

function _render() {
  const labs = _labs();
  if (!labs) {
    _viewEl.innerHTML = '<div class="cdx-empty">' + _esc(t('labs.unavailable')) + '</div>';
    return;
  }
  _viewEl.innerHTML =
    '<div class="cdx-labs">' +
      '<div class="cdx-labs-head">' +
        '<h2 class="cdx-labs-title">' + _esc(t('labs.title')) + '</h2>' +
        '<div class="cdx-labs-hint">' + _esc(t('labs.hint')) + '</div>' +
      '</div>' +
      '<div class="cdx-labs-grid">' + labs.map(_cardHtml).join('') + '</div>' +
    '</div>';
}

function _preview(key) {
  const labs = _labs();
  const lab = labs && labs.find((l) => l.key === key);
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
    const card = e.target.closest('.cdx-lab-card');
    if (!card) return;
    const key = card.getAttribute('data-lab-key');
    if (!key) return;
    if (e.target.closest('[data-action="preview"]')) { e.preventDefault(); _preview(key); }
  };
  _onChange = (e) => {
    const input = e.target.closest('.cdx-lab-switch-input');
    if (!input) return;
    const card = input.closest('.cdx-lab-card');
    if (!card) return;
    const key = card.getAttribute('data-lab-key');
    if (!key) return;
    _setEnabled(key, input.checked);
    card.classList.toggle('is-off', !input.checked);
  };
  viewEl.addEventListener('click', _onClick);
  viewEl.addEventListener('change', _onChange);
}

export function unmount() {
  if (_viewEl) {
    if (_onClick) _viewEl.removeEventListener('click', _onClick);
    if (_onChange) _viewEl.removeEventListener('change', _onChange);
    _viewEl.innerHTML = '';
  }
  _viewEl = null;
  _onClick = null;
  _onChange = null;
}
