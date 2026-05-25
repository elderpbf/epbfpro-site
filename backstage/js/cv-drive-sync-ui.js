'use strict';

// CVDriveSyncUI: Conteúdo > Drive sub-tab orchestrator. Renders one card per
// configured Drive root folder (Liberações-style: header click expands the
// body showing the files inside that root). Add/edit/delete a folder triggers
// an auto-sync so the card immediately reflects fresh contents. Clicking a
// file opens it in a modal via CVDriveViewer.
//
// Depends on globals: callWorker, BS_GOOGLE, BSToast (optional),
// CVDriveFoldersAPI, CVDriveFoldersUI, CVDriveCache, CVDriveViewer.

(function (global) {
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtRelTime(ts) {
    if (!ts) return 'Nunca sincronizado.';
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)    return 'Última sincronização: há ' + diff + 's';
    if (diff < 3600)  return 'Última sincronização: há ' + Math.floor(diff / 60) + 'min';
    if (diff < 86400) return 'Última sincronização: há ' + Math.floor(diff / 3600) + 'h';
    return 'Última sincronização: há ' + Math.floor(diff / 86400) + ' dia(s)';
  }

  // Group files for a specific configured root folder. Files whose
  // meta_json.root_folder_id matches the root's folder_id belong here.
  // Pre-root_folder_id rows (from earlier syncs) fall back to the FIRST
  // configured folder so the user does not have to hunt them down before the
  // next sync re-tags everything.
  function _filesForRoot(allFiles, root, isFirstRoot) {
    return allFiles.filter(function (it) {
      var meta = it.meta_json || {};
      if (meta.root_folder_id) return meta.root_folder_id === root.folder_id;
      return isFirstRoot;
    });
  }

  // Within a card, sub-group by folder_name so subfolders surface as headers.
  // Files whose folder_name equals the root's own name (root-level files in
  // that Drive folder) land in a "(raiz)" group pinned first.
  function _subgroupForCard(files, root) {
    var map = new Map();
    var raiz = [];
    files.forEach(function (it) {
      var meta = it.meta_json || {};
      var fn = (meta.folder_name && String(meta.folder_name).trim()) || '';
      if (!fn || fn === root.name) {
        raiz.push(it);
      } else {
        if (!map.has(fn)) map.set(fn, []);
        map.get(fn).push(it);
      }
    });
    var groups = [];
    if (raiz.length) groups.push({ name: '(raiz)', items: raiz });
    var subNames = Array.from(map.keys()).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR');
    });
    subNames.forEach(function (n) { groups.push({ name: n, items: map.get(n) }); });
    return groups;
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
        '<div class="cv-drive-folder-editor-host" hidden></div>' +
        '<div class="cv-drive-folders-list"></div>' +
      '</div>';

    var syncBtn        = container.querySelector('.cv-drive-sync-btn');
    var statusEl       = container.querySelector('.cv-drive-status');
    var lastSyncEl     = container.querySelector('.cv-drive-last-sync');
    var foldersListEl  = container.querySelector('.cv-drive-folders-list');
    var editorHostEl   = container.querySelector('.cv-drive-folder-editor-host');
    var addFolderBtn   = container.querySelector('.cv-drive-add-folder-btn');

    var _folders     = [];
    var _files       = [];
    var _lastSync    = null;
    var _editorInst  = null;
    var _openedRoot  = null;

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

    function _updateLastSync() {
      lastSyncEl.textContent = _lastSync ? _fmtRelTime(_lastSync) : 'Nunca sincronizado.';
    }

    function _renderCards() {
      if (!_folders.length) {
        foldersListEl.innerHTML = '<div class="cv-drive-folder-empty">Nenhuma pasta configurada. Clique "+ Adicionar pasta".</div>';
        return;
      }
      var html = _folders.map(function (root, idx) {
        var files = _filesForRoot(_files, root, idx === 0);
        var count = files.length;
        var openCls = _openedRoot === root.id ? ' open' : '';
        return (
          '<div class="cv-drive-folder-card" data-folder-id="' + _esc(root.id) + '">' +
            '<div class="cv-drive-folder-card-header' + openCls + '">' +
              '<div class="cv-drive-folder-card-info">' +
                '<span class="cv-drive-folder-name">' + _esc(root.name || '') + '</span>' +
                '<code class="cv-drive-folder-id">' + _esc(root.folder_id || '') + '</code>' +
              '</div>' +
              '<div class="cv-drive-folder-card-meta">' +
                '<span class="cv-drive-folder-card-count">' + count + ' arquivo' + (count === 1 ? '' : 's') + '</span>' +
                '<button type="button" class="cv-drive-folder-edit" data-action="edit">Editar</button>' +
                '<button type="button" class="cv-drive-folder-delete" data-action="delete">Excluir</button>' +
                '<span class="cv-drive-folder-card-chevron" aria-hidden="true">&#8250;</span>' +
              '</div>' +
            '</div>' +
            '<div class="cv-drive-folder-card-body"' + (_openedRoot === root.id ? '' : ' hidden') + '>' +
              (_openedRoot === root.id ? _renderCardBody(files, root) : '') +
            '</div>' +
          '</div>'
        );
      }).join('');
      foldersListEl.innerHTML = html;
    }

    function _renderCardBody(files, root) {
      if (!files.length) {
        return '<div class="cv-drive-card-empty">Nenhum arquivo nesta pasta. Clique "Sincronizar agora" no topo para popular.</div>';
      }
      var groups = _subgroupForCard(files, root);
      return groups.map(function (g) {
        var rows = g.items.map(function (it) {
          var meta = it.meta_json || {};
          var icon = meta.icon || '◆';
          var label = meta.label || '';
          return (
            '<button type="button" class="cv-drive-file" data-file-id="' + _esc(it.id) + '">' +
              '<span class="cv-drive-file-icon">' + _esc(icon) + '</span>' +
              '<span class="cv-drive-file-name">' + _esc(it.title || '') + '</span>' +
              (label ? '<span class="cv-drive-file-label">' + _esc(label) + '</span>' : '') +
            '</button>'
          );
        }).join('');
        return (
          '<div class="cv-drive-subfolder">' +
            '<div class="cv-drive-subfolder-head">' + _esc(g.name) + ' <span class="cv-drive-count">' + g.items.length + '</span></div>' +
            '<div class="cv-drive-subfolder-files">' + rows + '</div>' +
          '</div>'
        );
      }).join('');
    }

    function _onListClick(e) {
      var actionBtn = e.target.closest('[data-action]');
      var fileBtn   = e.target.closest('.cv-drive-file');
      var header    = e.target.closest('.cv-drive-folder-card-header');

      if (actionBtn) {
        e.stopPropagation();
        var card = actionBtn.closest('.cv-drive-folder-card');
        if (!card) return;
        var id = Number(card.getAttribute('data-folder-id'));
        var folder = _folders.find(function (f) { return f.id === id; });
        if (!folder) return;
        var action = actionBtn.getAttribute('data-action');
        if (action === 'edit')   _onEditFolder(folder);
        if (action === 'delete') _onDeleteFolder(folder);
        return;
      }

      if (fileBtn) {
        var fid = Number(fileBtn.getAttribute('data-file-id'));
        var item = _files.find(function (f) { return Number(f.id) === fid; });
        if (item && global.CVDriveViewer) global.CVDriveViewer.openModal(item);
        return;
      }

      if (header) {
        var hCard = header.closest('.cv-drive-folder-card');
        if (!hCard) return;
        var hid = Number(hCard.getAttribute('data-folder-id'));
        _openedRoot = (_openedRoot === hid) ? null : hid;
        _renderCards();
      }
    }
    foldersListEl.addEventListener('click', _onListClick);

    function _openEditor(folder) {
      editorHostEl.hidden = false;
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
    }

    function _onEditorSave(payload) {
      var p;
      if (payload.id !== undefined) {
        p = global.CVDriveFoldersAPI.update(payload.id, { name: payload.name, folder_id: payload.folder_id });
      } else {
        p = global.CVDriveFoldersAPI.create({ name: payload.name, folder_id: payload.folder_id });
      }
      p.then(function (folder) {
        _closeEditor();
        return _reloadFolders().then(function () {
          if (folder && folder.id) _openedRoot = folder.id;
          _renderCards();
          return _autoSync();
        });
      }).catch(function (err) {
        if (global.BSToast) global.BSToast.show('Erro ao salvar pasta: ' + (err && err.message ? err.message : String(err)));
      });
    }

    function _onEditFolder(folder) {
      _openEditor(folder);
    }

    function _onDeleteFolder(folder) {
      if (!global.confirm('Excluir pasta "' + folder.name + '"?')) return;
      global.CVDriveFoldersAPI.remove(folder.id).then(function () {
        if (_openedRoot === folder.id) _openedRoot = null;
        return _reloadFolders().then(function () {
          _renderCards();
          return _autoSync();
        });
      });
    }

    function _reloadFolders() {
      return global.CVDriveFoldersAPI.list({ _silent: true }).then(function (folders) {
        _folders = folders || [];
      });
    }

    function _loadFiles() {
      return callWorker({ action: 'cv_list_drive_items', _silent: true }).then(function (data) {
        if (!data || !data.ok) return;
        _files    = data.items    || [];
        _lastSync = data.last_sync || null;
      });
    }

    // Click-driven sync. Triggers the consent popup when needed; toast on
    // error. Quietly skips when BS_GOOGLE is missing entirely.
    function _runSync(opts) {
      opts = opts || {};
      var bs = global.BS_GOOGLE;
      if (!bs) {
        if (global.BSToast) global.BSToast.show('Drive indisponível: BS_GOOGLE não carregado.');
        return Promise.resolve(false);
      }
      syncBtn.disabled = true;
      syncBtn.textContent = 'Sincronizando...';

      var authP = (bs.isAuthed && bs.isAuthed())
        ? Promise.resolve()
        : bs.requestToken({ prompt: opts.silent ? '' : 'consent' });

      return authP.then(function () {
        return global.CVDriveFoldersAPI.list({ _silent: true });
      }).then(function (folders) {
        var fetches = folders.map(function (folder) {
          return bs.drive.listFolder(folder.folder_id).then(function (rootFiles) {
            var subfolders = rootFiles.filter(function (f) {
              return f.mimeType === 'application/vnd.google-apps.folder';
            });
            var rootOnlyFiles = rootFiles.filter(function (f) {
              return f.mimeType !== 'application/vnd.google-apps.folder';
            });
            var items = rootOnlyFiles.map(function (f) {
              return { file_id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime || '', folder_name: folder.name, root_folder_id: folder.folder_id };
            });
            return Promise.all(subfolders.map(function (sf) {
              return bs.drive.listFolder(sf.id).then(function (subFiles) {
                return subFiles
                  .filter(function (f) { return f.mimeType !== 'application/vnd.google-apps.folder'; })
                  .map(function (f) {
                    return { file_id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime || '', folder_name: sf.name, root_folder_id: folder.folder_id };
                  });
              }).catch(function () { return []; });
            })).then(function (subArrays) {
              subArrays.forEach(function (arr) { arr.forEach(function (it) { items.push(it); }); });
              return items;
            });
          }).catch(function () { return []; });
        });
        return Promise.all(fetches).then(function (all) {
          var flat = [];
          all.forEach(function (arr) { arr.forEach(function (it) { flat.push(it); }); });
          return flat;
        });
      }).then(function (flat) {
        return callWorker({ action: 'cv_sync_drive_items', items: flat });
      }).then(function () {
        return _loadFiles();
      }).then(function () {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar agora';
        _updateStatus();
        _updateLastSync();
        _renderCards();
        return true;
      }).catch(function (err) {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar agora';
        if (global.BSToast) global.BSToast.show('Erro ao sincronizar: ' + (err && err.message ? err.message : String(err)));
        return false;
      });
    }

    // Quiet sync triggered after a CRUD op so the card body refreshes without
    // forcing the teacher to click again. Skips if there is no Google session
    // (don't pop a consent dialog the user didn't ask for here).
    function _autoSync() {
      var bs = global.BS_GOOGLE;
      if (!bs || !bs.isAuthed || !bs.isAuthed()) return Promise.resolve(false);
      return _runSync({ silent: true });
    }

    syncBtn.addEventListener('click', function () { _runSync(); });
    addFolderBtn.addEventListener('click', function () { _openEditor(null); });

    _updateStatus();
    Promise.all([_reloadFolders(), _loadFiles()]).then(function () {
      _updateLastSync();
      _renderCards();
    });

    return {
      destroy: function () {
        foldersListEl.removeEventListener('click', _onListClick);
        if (_editorInst) { _editorInst.destroy(); _editorInst = null; }
        container.innerHTML = '';
      }
    };
  }

  global.CVDriveSyncUI = {
    mount: mount
  };
}(window));
