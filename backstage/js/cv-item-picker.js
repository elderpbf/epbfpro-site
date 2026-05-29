'use strict';

// CVItemPicker - reusable multi-select picker for ct_items rows + synthetic
// items (Labs, future Drive). Visual layout mirrors the Liberacoes composer
// pattern: type-grouped sections, native checkbox rows, single search box.
//
// Mount: CVItemPicker.mount(container, { items, selectedIds, onChange })
//   container:   DOM element OR CSS selector string
//   items:       Array<{ id, title, type, set_id?, ... }>
//                  Items are grouped by inferred section:
//                    apostila  = set_id != null
//                    tarefa    = type === 'tarefa'
//                    llm       = type === 'llm'
//                    external  = type === 'popup_url'
//                    lab       = type === 'lab' (or id starting with 'lab:')
//                    drive     = type === 'drive_file' (Bundle I drive caching;
//                                  empty until that lands)
//                    outros    = everything else
//   selectedIds: Array<string|number> initial selection (coerced to string)
//   onChange:    function(selectedIds: string[]) fired on every toggle
//
// Returns: { getSelected: () => string[], setItems: (items) => void,
//            destroy: () => void }
//
// Implementation notes:
//   - The bug fixed here (only one item ever saved despite multi-select) was
//     a click race: <label> wrapping <input type="checkbox"> caused real
//     browsers to fire TWO click events (one on the label, one synthetic on
//     the forwarded checkbox), both bubbling to our delegated list handler.
//     My handler toggled state twice -> net no change. Fix: call
//     e.preventDefault() UNCONDITIONALLY on the click event, which cancels
//     the label-to-checkbox default action and the checkbox's own toggle
//     default. State + checkbox.checked are managed entirely by our code.
//   - Used by cv-presets-ui.js mountPresetEditor; available for any future
//     consumer that needs "pick items from a list" (lesson plans, shares,
//     multi-filters, etc.).

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // A type's icon comes from the type itself (item.type_icon: a "glyph:<key>"
  // resolved to an inline SVG by the Codex glyph library, or a legacy emoji),
  // rendered through the window.CdxGlyphs global so the picker paints the same
  // glyph for the same type as every other surface. 'lab' is a synthetic
  // picker-only type (no real ct_types slug), so it keeps a fixed glyph.
  function _typeIconHtml(item) {
    var t = item && item.type;
    var icon = (t === 'lab') ? 'glyph:flask' : (item && item.type_icon) || '';
    if (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function' && icon) {
      return window.CdxGlyphs.iconHtml(icon, { size: 16 });
    }
    return _esc(icon || '•');
  }

  // Order matters: items are placed in the FIRST matching group. Apostila is
  // a set membership check (set_id), so it must come before any type check.
  var GROUPS = [
    { key: 'apostila', label: 'Conteudo do curso', match: function (it) { return it && it.set_id != null; } },
    { key: 'tarefa',   label: 'Tarefas',           match: function (it) { return it && it.type === 'tarefa'; } },
    { key: 'llm',      label: 'LLMs',              match: function (it) { return it && it.type === 'llm'; } },
    { key: 'external', label: 'Links externos',    match: function (it) { return it && it.type === 'popup_url'; } },
    { key: 'lab',      label: 'Labs',              match: function (it) { return it && (it.type === 'lab' || (typeof it.id === 'string' && it.id.indexOf('lab:') === 0)); } },
    { key: 'drive',    label: 'Drive',             match: function (it) { return it && it.type === 'drive_file'; } },
    { key: 'outros',   label: 'Outros itens',      match: function () { return true; } }
  ];

  function _resolveHost(container) {
    var host = (typeof container === 'string')
      ? document.querySelector(container) : container;
    if (!host) throw new Error('CVItemPicker.mount: container not found');
    return host;
  }

  function mount(container, opts) {
    var host = _resolveHost(container);
    var items = Array.isArray(opts && opts.items) ? opts.items.slice() : [];
    var onChange = (opts && opts.onChange) || function () {};

    var selected = new Set();
    var initial = (opts && opts.selectedIds) || [];
    for (var i = 0; i < initial.length; i++) {
      var v = initial[i];
      if (v != null) selected.add(String(v));
    }

    var query = '';

    host.innerHTML =
      '<div class="cv-item-picker">' +
        '<div class="cv-item-picker-toolbar">' +
          '<input type="search" class="cv-item-picker-search" placeholder="Buscar itens..." autocomplete="off" spellcheck="false">' +
          '<span class="cv-item-picker-count" data-cv-picker-count>0 selecionado(s)</span>' +
        '</div>' +
        '<div class="cv-item-picker-list" data-cv-picker-list></div>' +
      '</div>';

    var listEl   = host.querySelector('[data-cv-picker-list]');
    var countEl  = host.querySelector('[data-cv-picker-count]');
    var searchEl = host.querySelector('.cv-item-picker-search');

    function _currentSelectedIds() {
      var out = [];
      selected.forEach(function (v) { out.push(v); });
      return out;
    }

    function _groupItems(itemList) {
      var groups = {};
      for (var gi = 0; gi < GROUPS.length; gi++) groups[GROUPS[gi].key] = [];
      for (var i = 0; i < itemList.length; i++) {
        var it = itemList[i];
        for (var j = 0; j < GROUPS.length; j++) {
          if (GROUPS[j].match(it)) { groups[GROUPS[j].key].push(it); break; }
        }
      }
      return groups;
    }

    function _renderRow(item) {
      var idStr = String(item.id);
      var isSel = selected.has(idStr);
      return '<label class="cv-item-picker-row' + (isSel ? ' is-selected' : '') +
               '" data-id="' + _esc(idStr) + '">' +
        '<input type="checkbox" class="cv-item-picker-check"' + (isSel ? ' checked' : '') + '>' +
        '<span class="cv-item-picker-icon">' + _typeIconHtml(item) + '</span>' +
        '<span class="cv-item-picker-title">' + _esc((item && item.title) || '(sem titulo)') + '</span>' +
      '</label>';
    }

    function _renderList() {
      var q = query.trim().toLowerCase();
      var filtered = items.filter(function (it) {
        if (!q) return true;
        var title = String((it && it.title) || '').toLowerCase();
        return title.indexOf(q) !== -1;
      });
      if (!filtered.length) {
        listEl.innerHTML = '<div class="cv-item-picker-empty">Nenhum item encontrado.</div>';
        return;
      }
      var groups = _groupItems(filtered);
      var parts = [];
      for (var i = 0; i < GROUPS.length; i++) {
        var g = GROUPS[i];
        var rows = groups[g.key];
        if (!rows.length) continue;
        parts.push(
          '<div class="cv-item-picker-group" data-group="' + g.key + '">' +
            '<div class="cv-item-picker-group-label">' + _esc(g.label) + ' (' + rows.length + ')</div>' +
            '<div class="cv-item-picker-group-rows">' + rows.map(_renderRow).join('') + '</div>' +
          '</div>'
        );
      }
      listEl.innerHTML = parts.join('') || '<div class="cv-item-picker-empty">Nenhum item encontrado.</div>';
    }

    function _renderCount() {
      countEl.textContent = selected.size + ' selecionado(s)';
    }

    function _onListClick(e) {
      var row = e.target.closest('.cv-item-picker-row');
      if (!row) return;
      // Unconditional preventDefault stops both (a) the <label>'s default
      // action of forwarding the click to the contained checkbox, and (b)
      // the checkbox's own default action of toggling its checked state.
      // Without this, real browsers fired TWO click events per user
      // interaction (the click race), making multi-select toggle twice and
      // net to no change.
      e.preventDefault();
      var id = row.getAttribute('data-id');
      if (!id) return;
      if (selected.has(id)) selected.delete(id);
      else                  selected.add(id);
      row.classList.toggle('is-selected', selected.has(id));
      var checkbox = row.querySelector('.cv-item-picker-check');
      if (checkbox) checkbox.checked = selected.has(id);
      _renderCount();
      onChange(_currentSelectedIds());
    }

    function _onSearch(e) {
      query = (e.target && e.target.value) || '';
      _renderList();
    }

    listEl.addEventListener('click', _onListClick);
    searchEl.addEventListener('input', _onSearch);

    _renderList();
    _renderCount();

    return {
      getSelected: _currentSelectedIds,
      setItems: function (next) {
        items = Array.isArray(next) ? next.slice() : [];
        _renderList();
      },
      destroy: function () {
        listEl.removeEventListener('click', _onListClick);
        searchEl.removeEventListener('input', _onSearch);
        host.innerHTML = '';
      }
    };
  }

  global.CVItemPicker = { mount: mount };
}(window));
