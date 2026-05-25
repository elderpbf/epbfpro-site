'use strict';

// CVDriveFoldersUI - shared UI primitives for Drive folder management.
//
//   mountFoldersList(container, { folders, onEdit, onDelete })
//     CRUD list of configured Drive folders; each row has Editar + Excluir.
//     Returns { setFolders(next), destroy() }.
//
//   mountFolderEditor(container, { folder?, onSave, onCancel })
//     Form with name + folder_id inputs.
//     onSave({ id?, name, folder_id }) called on valid submit.
//     Returns { destroy() }.

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- mountFoldersList ------------------------------------------------

  function mountFoldersList(container, opts) {
    var host = container;
    var folders  = Array.isArray(opts && opts.folders) ? opts.folders.slice() : [];
    var onEdit   = (opts && opts.onEdit)   || function () {};
    var onDelete = (opts && opts.onDelete) || function () {};

    function _renderRows() {
      if (!folders.length) {
        return '<div class="cv-drive-folder-empty">Nenhuma pasta configurada. Clique &quot;+ Adicionar pasta&quot;.</div>';
      }
      return folders.map(function (f) {
        return '<div class="cv-drive-folder-row" data-id="' + _esc(f.id) + '">' +
          '<span class="cv-drive-folder-name">' + _esc((f && f.name) || '') + '</span>' +
          '<code class="cv-drive-folder-id">' + _esc((f && f.folder_id) || '') + '</code>' +
          '<div class="cv-drive-folder-row-actions">' +
            '<button type="button" class="cv-drive-folder-edit" data-action="edit">Editar</button>' +
            '<button type="button" class="cv-drive-folder-delete" data-action="delete">Excluir</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    host.innerHTML = _renderRows();

    function _onClick(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var row = btn.closest('.cv-drive-folder-row');
      if (!row) return;
      var id = Number(row.getAttribute('data-id'));
      var folder = folders.find(function (f) { return f.id === id; });
      if (!folder) return;
      var action = btn.getAttribute('data-action');
      if (action === 'edit')   onEdit(folder);
      if (action === 'delete') onDelete(folder);
    }
    host.addEventListener('click', _onClick);

    return {
      setFolders: function (next) {
        folders = Array.isArray(next) ? next.slice() : [];
        host.innerHTML = _renderRows();
      },
      destroy: function () {
        host.removeEventListener('click', _onClick);
        host.innerHTML = '';
      }
    };
  }

  // ---- mountFolderEditor -----------------------------------------------

  function mountFolderEditor(container, opts) {
    var host     = container;
    var folder   = (opts && opts.folder) || null;
    var onSave   = (opts && opts.onSave)   || function () {};
    var onCancel = (opts && opts.onCancel) || function () {};

    var initialName     = (folder && folder.name)      || '';
    var initialFolderId = (folder && folder.folder_id) || '';
    var isNew = !folder || !folder.id;

    host.innerHTML =
      '<form class="cv-drive-folder-editor" novalidate>' +
        '<label>Nome <input class="cv-drive-folder-editor-name" required value="' + _esc(initialName) + '"></label>' +
        '<label>ID da pasta no Drive <input class="cv-drive-folder-editor-folder-id" required value="' + _esc(initialFolderId) + '"></label>' +
        '<div class="cv-drive-folder-editor-error"><span data-cv-folder-error role="alert" aria-live="polite"></span></div>' +
        '<div class="cv-drive-folder-editor-actions">' +
          '<button type="button" class="cv-drive-folder-editor-cancel">Cancelar</button>' +
          '<button type="submit" class="cv-drive-folder-editor-save">' + (isNew ? 'Adicionar' : 'Salvar') + '</button>' +
        '</div>' +
      '</form>';

    var formEl    = host.querySelector('.cv-drive-folder-editor');
    var nameEl    = host.querySelector('.cv-drive-folder-editor-name');
    var folderEl  = host.querySelector('.cv-drive-folder-editor-folder-id');
    var errorEl   = host.querySelector('[data-cv-folder-error]');
    var cancelEl  = host.querySelector('.cv-drive-folder-editor-cancel');

    function _clearErrors() {
      if (errorEl) errorEl.textContent = '';
      if (nameEl)   nameEl.classList.remove('is-invalid');
      if (folderEl) folderEl.classList.remove('is-invalid');
    }

    function _onSubmit(e) {
      e.preventDefault();
      _clearErrors();
      var name     = ((nameEl   && nameEl.value)   || '').trim();
      var folderId = ((folderEl && folderEl.value) || '').trim();

      if (!name) {
        if (errorEl)  errorEl.textContent = 'Nome é obrigatório.';
        if (nameEl)   nameEl.classList.add('is-invalid');
        return;
      }
      if (!folderId) {
        if (errorEl)  errorEl.textContent = 'ID da pasta é obrigatório.';
        if (folderEl) folderEl.classList.add('is-invalid');
        return;
      }

      onSave({ id: folder ? folder.id : undefined, name: name, folder_id: folderId });
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
        host.innerHTML = '';
      }
    };
  }

  global.CVDriveFoldersUI = {
    mountFoldersList:  mountFoldersList,
    mountFolderEditor: mountFolderEditor
  };
}(window));
