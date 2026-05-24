'use strict';

// CVItemPicker - reusable multi-select picker for ct_items rows.
//
// Mount: CVItemPicker.mount(container, { items, selectedIds, onChange })
//   container:   DOM element OR CSS selector string
//   items:       Array<{ id, title, type, ... }> (anything with id + title)
//   selectedIds: Array<string|number> initial selection (coerced to string)
//   onChange:    function(selectedIds: string[]) fired on every toggle
//
// Returns: { getSelected: () => string[], destroy: () => void }
//
// Used by cv-presets-ui.js mountPresetEditor; available to any future
// consumer that needs "pick a subset of items from a list" (lesson plans,
// shares, multi-select filters, etc.).

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _typeLabel(item) {
    var t = item && item.type;
    if (t === 'drive_file') return 'Drive';
    if (t === 'tarefa')     return 'Tarefa';
    if (t === 'popup_url')  return 'Link';
    if (t === 'llm')        return 'LLM';
    if (t === 'iframe')     return 'Iframe';
    if (t === 'markdown')   return 'Texto';
    return t || '—';
  }

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

    function _renderList() {
      var q = query.trim().toLowerCase();
      var rows = items.filter(function (it) {
        if (!q) return true;
        var title = String((it && it.title) || '').toLowerCase();
        return title.indexOf(q) !== -1;
      });
      if (!rows.length) {
        listEl.innerHTML = '<div class="cv-item-picker-empty">Nenhum item encontrado.</div>';
        return;
      }
      var html = rows.map(function (it) {
        var idStr = String(it.id);
        var isSel = selected.has(idStr);
        return '<label class="cv-item-picker-row' + (isSel ? ' is-selected' : '') +
                 '" data-id="' + _esc(idStr) + '">' +
          '<input type="checkbox" class="cv-item-picker-check"' + (isSel ? ' checked' : '') + '>' +
          '<span class="cv-item-picker-type">' + _esc(_typeLabel(it)) + '</span>' +
          '<span class="cv-item-picker-title">' + _esc((it && it.title) || '(sem titulo)') + '</span>' +
        '</label>';
      }).join('');
      listEl.innerHTML = html;
    }

    function _renderCount() {
      countEl.textContent = selected.size + ' selecionado(s)';
    }

    function _onListClick(e) {
      var row = e.target.closest('.cv-item-picker-row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (!id) return;
      // The native <label>+<input> would toggle automatically; we override
      // to manage selection state ourselves and keep the row in sync.
      if (e.target.classList.contains('cv-item-picker-check')) {
        e.preventDefault();
      }
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
