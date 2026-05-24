'use strict';

// CVPresetsUI - shared UI primitives for the Lesson Presets feature.
//
//   mountPresetsList(container, { presets, onEdit, onDelete })
//     CRUD-style list of presets; each row has Editar + Excluir.
//
//   mountPresetEditor(container, { preset?, items, onSave, onCancel })
//     Form with name input + embedded CVItemPicker.
//     onSave({ id?, name, item_ids: string[] }) called on submit.
//
//   mountPresetLoader(container, { presets, currentPresetId?, onSelect, onReset })
//     Compact select for the Aula sidebar; onSelect(preset), onReset().
//
// Every mount returns an instance with at least { destroy: () => void }.
// Consumers wire callbacks for behavior; this module owns rendering.
//
// Depends on: window.CVItemPicker (cv-item-picker.js).

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _resolveHost(container) {
    var host = (typeof container === 'string')
      ? document.querySelector(container) : container;
    if (!host) throw new Error('CVPresetsUI: container not found');
    return host;
  }

  // ---- mountPresetsList ------------------------------------------------

  function mountPresetsList(container, opts) {
    var host = _resolveHost(container);
    var presets  = Array.isArray(opts && opts.presets) ? opts.presets.slice() : [];
    var onEdit   = (opts && opts.onEdit)   || function () {};
    var onDelete = (opts && opts.onDelete) || function () {};

    function _renderRows() {
      if (!presets.length) {
        return '<div class="cv-preset-empty">Nenhum preset salvo. Clique "+ Novo preset" para criar.</div>';
      }
      return '<div class="cv-preset-list">' + presets.map(function (p) {
        var count = (p && p.item_ids && p.item_ids.length) || 0;
        return '<div class="cv-preset-row" data-id="' + _esc(p.id) + '">' +
          '<span class="cv-preset-name">' + _esc((p && p.name) || '(sem nome)') + '</span>' +
          '<span class="cv-preset-count">' + count + ' item(s)</span>' +
          '<div class="cv-preset-row-actions">' +
            '<button type="button" class="cv-preset-edit" data-action="edit">Editar</button>' +
            '<button type="button" class="cv-preset-delete" data-action="delete">Excluir</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    host.innerHTML = _renderRows();

    function _onClick(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var row = btn.closest('.cv-preset-row');
      if (!row) return;
      var id = Number(row.getAttribute('data-id'));
      var preset = presets.find(function (p) { return p.id === id; });
      if (!preset) return;
      var action = btn.getAttribute('data-action');
      if (action === 'edit')   onEdit(preset);
      if (action === 'delete') onDelete(preset);
    }
    host.addEventListener('click', _onClick);

    return {
      setPresets: function (next) {
        presets = Array.isArray(next) ? next.slice() : [];
        host.innerHTML = _renderRows();
      },
      destroy: function () {
        host.removeEventListener('click', _onClick);
        host.innerHTML = '';
      }
    };
  }

  // ---- mountPresetEditor ----------------------------------------------

  function mountPresetEditor(container, opts) {
    var host = _resolveHost(container);
    var preset   = (opts && opts.preset) || null;
    var items    = (opts && opts.items)  || [];
    var onSave   = (opts && opts.onSave)   || function () {};
    var onCancel = (opts && opts.onCancel) || function () {};

    var isNew = !preset || !preset.id;
    var initialName = (preset && preset.name) || '';
    var initialItemIds = (preset && preset.item_ids) || [];

    host.innerHTML =
      '<form class="cv-preset-editor" novalidate>' +
        '<div class="cv-preset-editor-field">' +
          '<label class="cv-preset-editor-label" for="cv-preset-name">Nome do preset</label>' +
          '<input id="cv-preset-name" type="text" class="cv-preset-editor-name" maxlength="120" required value="' + _esc(initialName) + '">' +
          '<div class="cv-preset-editor-error" data-cv-preset-error role="alert" aria-live="polite"></div>' +
        '</div>' +
        '<div class="cv-preset-editor-field cv-preset-editor-field--picker">' +
          '<label class="cv-preset-editor-label">Itens incluidos</label>' +
          '<div class="cv-preset-editor-picker" data-cv-preset-picker></div>' +
        '</div>' +
        '<div class="cv-preset-editor-actions">' +
          '<button type="button" class="cv-preset-editor-cancel">Cancelar</button>' +
          '<button type="submit" class="cv-preset-editor-save">' + (isNew ? 'Criar preset' : 'Salvar') + '</button>' +
        '</div>' +
      '</form>';

    var formEl   = host.querySelector('.cv-preset-editor');
    var nameEl   = host.querySelector('.cv-preset-editor-name');
    var errorEl  = host.querySelector('[data-cv-preset-error]');
    var pickerEl = host.querySelector('[data-cv-preset-picker]');
    var cancelEl = host.querySelector('.cv-preset-editor-cancel');

    function _clearError() {
      if (errorEl) errorEl.textContent = '';
      if (nameEl)  nameEl.classList.remove('is-invalid');
    }
    function _showError(msg) {
      if (errorEl) errorEl.textContent = msg;
      if (nameEl)  nameEl.classList.add('is-invalid');
    }
    if (nameEl) nameEl.addEventListener('input', _clearError);

    if (!global.CVItemPicker) {
      throw new Error('CVPresetsUI.mountPresetEditor: CVItemPicker not loaded');
    }
    var picker = global.CVItemPicker.mount(pickerEl, {
      items: items,
      selectedIds: initialItemIds,
      onChange: function () { /* count surfaced by picker itself */ }
    });

    function _onSubmit(e) {
      e.preventDefault();
      _clearError();
      var name = ((nameEl && nameEl.value) || '').trim();
      if (!name) {
        // Visible feedback so the user understands why the form didn't submit.
        // Previously only focused the field, which left users (per Elder's
        // staging feedback 2026-05-24) staring at an unresponsive button.
        _showError('Digite um nome para o preset.');
        if (nameEl) nameEl.focus();
        return;
      }
      // id is intentionally undefined (not null) for new presets so consumers
      // can use `payload.id === undefined` as a clean create-vs-update signal.
      onSave({
        id: preset ? preset.id : undefined,
        name: name,
        item_ids: picker.getSelected()
      });
    }
    function _onCancelClick(e) {
      e.preventDefault();
      onCancel();
    }

    formEl.addEventListener('submit', _onSubmit);
    cancelEl.addEventListener('click', _onCancelClick);

    setTimeout(function () { if (nameEl) nameEl.focus(); }, 0);

    return {
      destroy: function () {
        formEl.removeEventListener('submit', _onSubmit);
        cancelEl.removeEventListener('click', _onCancelClick);
        if (picker && picker.destroy) picker.destroy();
        host.innerHTML = '';
      }
    };
  }

  // ---- mountPresetLoader ----------------------------------------------

  function mountPresetLoader(container, opts) {
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

  global.CVPresetsUI = {
    mountPresetsList:  mountPresetsList,
    mountPresetEditor: mountPresetEditor,
    mountPresetLoader: mountPresetLoader
  };
}(window));
