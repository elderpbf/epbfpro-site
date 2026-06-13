// codex/js/preset-loader.js
// Codex-owned preset loader. ES-module port of the ONLY part of the legacy
// window.CVPresetsUI that Codex still uses: mountPresetLoader, the compact
// "Carregar preset" select for the Lessons sidebar. The legacy list + editor
// (mountPresetsList / mountPresetEditor, the latter depending on the removed
// CVItemPicker) are not ported: Content's Presets sub-tab is a native cdx- port
// (content/presets.js). The legacy backstage global stays live for ClassVault.
//
// mountPresetLoader(container, { presets, currentPresetId?, onSelect, onReset })
//   -> { setPresets(next), getCurrentId(), destroy() }
// Renders the .cv-preset-loader-* markup the Lessons sidebar already styles
// (lessons.css, scoped under .cdx-lessons-sidebar-head); onSelect(preset) /
// onReset() drive the sidebar filtering.

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _resolveHost(container) {
  var host = (typeof container === 'string')
    ? document.querySelector(container) : container;
  if (!host) throw new Error('preset-loader: container not found');
  return host;
}

export function mountPresetLoader(container, opts) {
  var host = _resolveHost(container);
  var presets   = Array.isArray(opts && opts.presets) ? opts.presets.slice() : [];
  var currentId = (opts && opts.currentPresetId) != null ? opts.currentPresetId : null;
  var onSelect  = (opts && opts.onSelect) || function () {};
  var onReset   = (opts && opts.onReset)  || function () {};

  var selectEl = null;
  var resetEl  = null;

  function _renderInner() {
    if (!presets.length) return '';
    var options = ['<option value="">- Carregar preset -</option>'].concat(
      presets.map(function (p) {
        var sel = String(p.id) === String(currentId) ? ' selected' : '';
        var count = (p && p.item_ids && p.item_ids.length) || 0;
        return '<option value="' + _esc(p.id) + '"' + sel + '>' +
                 _esc((p && p.name) || '(sem nome)') + ' (' + count + ')' +
               '</option>';
      })
    ).join('');
    return '<select class="cv-preset-loader-select" aria-label="Carregar preset">' + options + '</select>' +
      (currentId ? '<button type="button" class="cv-preset-loader-reset" title="Mostrar tudo">Mostrar tudo</button>' : '');
  }

  function _wire() {
    selectEl = host.querySelector('.cv-preset-loader-select');
    resetEl  = host.querySelector('.cv-preset-loader-reset');
    if (selectEl) selectEl.addEventListener('change', _onSelectChange);
    if (resetEl)  resetEl.addEventListener('click', _onResetClick);
  }
  function _unwire() {
    if (selectEl) selectEl.removeEventListener('change', _onSelectChange);
    if (resetEl)  resetEl.removeEventListener('click', _onResetClick);
    selectEl = null;
    resetEl = null;
  }
  function _redraw() {
    _unwire();
    host.innerHTML = _renderInner();
    _wire();
  }
  function _onSelectChange(e) {
    var raw = e.target.value;
    if (!raw) { _onResetClick(); return; }
    var id = Number(raw);
    var preset = presets.find(function (p) { return p.id === id; });
    if (!preset) return;
    currentId = id;
    _redraw();
    onSelect(preset);
  }
  function _onResetClick() {
    currentId = null;
    _redraw();
    onReset();
  }

  host.innerHTML = _renderInner();
  _wire();

  return {
    setPresets: function (next) {
      presets = Array.isArray(next) ? next.slice() : [];
      _redraw();
    },
    getCurrentId: function () { return currentId; },
    destroy: function () {
      _unwire();
      host.innerHTML = '';
    }
  };
}
