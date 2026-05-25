'use strict';

// CVDriveSyncUI - Drive panel orchestrator for the Conteúdo · Drive sub-tab.
// Composes CVDriveFoldersAPI, CVDriveFoldersUI, CVDriveCache, and drives sync.
//
// Depends on globals: callWorker, BS_GOOGLE, CVDriveFoldersAPI, CVDriveFoldersUI, CVDriveCache.

(function (global) {
  function _fmtRelTime(ts) {
    if (!ts) return 'Nunca sincronizado.';
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)   return 'Última sincronização: há ' + diff + 's';
    if (diff < 3600) return 'Última sincronização: há ' + Math.floor(diff / 60) + 'min';
    if (diff < 86400) return 'Última sincronização: há ' + Math.floor(diff / 3600) + 'h';
    return 'Última sincronização: há ' + Math.floor(diff / 86400) + ' dia(s)';
  }

  function mount(container, opts) {
    container.innerHTML =
      '<div class="cv-drive-toolbar">' +
        '<h2>Drive</h2>' +
        '<button type="button" class="cv-drive-sync-btn ct-btn ct-btn-primary">Sincronizar agora</button>' +
      '</div>' +
      '<div class="cv-drive-meta">' +
        '<div class="cv-drive-status"></div>' +
        '<div class="cv-drive-last-sync"></div>' +
      '</div>' +
      '<div class="cv-drive-folders-section">' +
        '<div class="cv-drive-folders-section-header">' +
          '<h3>Pastas configuradas</h3>' +
          '<button type="button" class="cv-drive-add-folder-btn">+ Adicionar pasta</button>' +
        '</div>' +
        '<div class="cv-drive-folders-list"></div>' +
        '<div class="cv-drive-folder-editor-host" hidden></div>' +
      '</div>' +
      '<div class="cv-drive-files-section">' +
        '<h3>Arquivos cacheados</h3>' +
        '<div class="cv-drive-files-list"></div>' +
      '</div>';

    var syncBtn      = container.querySelector('.cv-drive-sync-btn');
    var statusEl     = container.querySelector('.cv-drive-status');
    var lastSyncEl   = container.querySelector('.cv-drive-last-sync');
    var foldersListEl  = container.querySelector('.cv-drive-folders-list');
    var editorHostEl   = container.querySelector('.cv-drive-folder-editor-host');
    var addFolderBtn   = container.querySelector('.cv-drive-add-folder-btn');
    var filesListEl    = container.querySelector('.cv-drive-files-list');

    var _listInst    = null;
    var _editorInst  = null;

    // ---- status chip ----
    function _updateStatus() {
      var bs = global.BS_GOOGLE;
      if (bs && bs.isAuthed && bs.isAuthed()) {
        var email = (bs.getEmail && bs.getEmail()) || '';
        statusEl.textContent = 'Conectado' + (email ? ' como ' + email : '');
        statusEl.classList.add('is-ok');
        statusEl.classList.remove('is-warn');
      } else {
        statusEl.textContent = 'Não conectado ao Google. Conecte para sincronizar.';
        statusEl.classList.add('is-warn');
        statusEl.classList.remove('is-ok');
      }
    }

    // ---- folders list ----
    function _loadFolders() {
      return global.CVDriveFoldersAPI.list({ _silent: true }).then(function (folders) {
        if (_listInst) { _listInst.destroy(); _listInst = null; }
        _listInst = global.CVDriveFoldersUI.mountFoldersList(foldersListEl, {
          folders: folders,
          onEdit:   _onEditFolder,
          onDelete: _onDeleteFolder
        });
      });
    }

    function _reloadFolders() {
      return global.CVDriveFoldersAPI.list({ _silent: true }).then(function (folders) {
        if (_listInst) _listInst.setFolders(folders);
      });
    }

    // ---- editor ----
    function _openEditor(folder) {
      editorHostEl.hidden = false;
      foldersListEl.style.display = 'none';
      if (_editorInst) { _editorInst.destroy(); _editorInst = null; }
      _editorInst = global.CVDriveFoldersUI.mountFolderEditor(editorHostEl, {
        folder: folder || null,
        onSave:   _onEditorSave,
        onCancel: _closeEditor
      });
    }

    function _closeEditor() {
      if (_editorInst) { _editorInst.destroy(); _editorInst = null; }
      editorHostEl.hidden = true;
      foldersListEl.style.display = '';
    }

    function _onEditorSave(payload) {
      var p;
      if (payload.id !== undefined) {
        p = global.CVDriveFoldersAPI.update(payload.id, { name: payload.name, folder_id: payload.folder_id });
      } else {
        p = global.CVDriveFoldersAPI.create({ name: payload.name, folder_id: payload.folder_id });
      }
      p.then(function () {
        _closeEditor();
        _reloadFolders();
      });
    }

    function _onEditFolder(folder) {
      _openEditor(folder);
    }

    function _onDeleteFolder(folder) {
      if (!global.confirm('Excluir pasta "' + folder.name + '"?')) return;
      global.CVDriveFoldersAPI.remove(folder.id).then(function () {
        _reloadFolders();
      });
    }

    // ---- files list ----
    function _renderFiles(items) {
      var grouped = global.CVDriveCache.groupByFolder(items || []);
      if (!grouped.groups.length) {
        filesListEl.innerHTML = '<div class="cv-drive-empty">Nenhum arquivo cacheado.</div>';
        return;
      }
      filesListEl.innerHTML = grouped.groups.map(function (g) {
        var rows = g.items.map(function (it) {
          var meta = it.meta_json || {};
          return '<div class="cv-drive-row">' +
            '<span class="cv-drive-name">' + _esc(it.title || '') + '</span>' +
            '<span class="cv-drive-mime">' + _esc(meta.mimeType || '') + '</span>' +
          '</div>';
        }).join('');
        return '<div class="cv-drive-group">' +
          '<div class="cv-drive-group-head"><span class="ct-drive-group-head">' + _esc(g.name) + '</span> <span class="cv-drive-count">' + g.items.length + '</span></div>' +
          rows +
        '</div>';
      }).join('');
    }

    function _esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _loadFiles() {
      return callWorker({ action: 'cv_list_drive_items', _silent: true }).then(function (data) {
        _renderFiles(data && data.items);
        var ts = data && data.last_sync;
        lastSyncEl.textContent = ts ? _fmtRelTime(ts) : 'Nunca sincronizado.';
      });
    }

    // ---- sync button ----
    function _onSyncClick() {
      var bs = global.BS_GOOGLE;
      if (!bs) {
        if (global.BSToast) global.BSToast.show('Drive indisponível: BS_GOOGLE não carregado.');
        return;
      }
      syncBtn.disabled = true;
      syncBtn.textContent = 'Sincronizando...';

      var authP = (bs.isAuthed && bs.isAuthed())
        ? Promise.resolve()
        : bs.requestToken({ prompt: 'consent' });

      authP.then(function () {
        return global.CVDriveFoldersAPI.list({ _silent: true });
      }).then(function (folders) {
        // For each configured folder: fetch its contents + one level deep.
        var fetches = folders.map(function (folder) {
          return bs.drive.listFolder(folder.folder_id).then(function (rootFiles) {
            var subfolders = rootFiles.filter(function (f) {
              return f.mimeType === 'application/vnd.google-apps.folder';
            });
            var rootOnlyFiles = rootFiles.filter(function (f) {
              return f.mimeType !== 'application/vnd.google-apps.folder';
            });

            var items = rootOnlyFiles.map(function (f) {
              return { file_id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: '', folder_name: folder.name };
            });

            return Promise.all(subfolders.map(function (sf) {
              return bs.drive.listFolder(sf.id).then(function (subFiles) {
                return subFiles
                  .filter(function (f) { return f.mimeType !== 'application/vnd.google-apps.folder'; })
                  .map(function (f) {
                    return { file_id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: '', folder_name: sf.name };
                  });
              }).catch(function () { return []; });
            })).then(function (subArrays) {
              subArrays.forEach(function (arr) { arr.forEach(function (it) { items.push(it); }); });
              return items;
            });
          }).catch(function () { return []; });
        });

        return Promise.all(fetches).then(function (allArrays) {
          var flat = [];
          allArrays.forEach(function (arr) { arr.forEach(function (it) { flat.push(it); }); });
          return flat;
        });
      }).then(function (flat) {
        return callWorker({ action: 'cv_sync_drive_items', items: flat });
      }).then(function () {
        return _loadFiles();
      }).then(function () {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar agora';
      }).catch(function (err) {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar agora';
        if (global.BSToast) global.BSToast.show('Erro ao sincronizar: ' + (err && err.message ? err.message : String(err)));
      });
    }

    syncBtn.addEventListener('click', _onSyncClick);
    addFolderBtn.addEventListener('click', function () { _openEditor(null); });

    // ---- init ----
    _updateStatus();
    _loadFolders();
    _loadFiles();

    return {
      destroy: function () {
        syncBtn.removeEventListener('click', _onSyncClick);
        if (_listInst)   { _listInst.destroy();   _listInst   = null; }
        if (_editorInst) { _editorInst.destroy();  _editorInst = null; }
        container.innerHTML = '';
      }
    };
  }

  global.CVDriveSyncUI = {
    mount: mount
  };
}(window));
