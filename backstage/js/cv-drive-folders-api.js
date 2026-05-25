'use strict';

// CVDriveFoldersAPI - thin client for the 4 cv_*_drive_folder Worker actions.
// Both ClassTrail admin (Conteúdo · Drive sub-tab CRUD) can consume this.
// No DOM dependencies. All methods return Promises.
//
// Depends on global callWorker() defined in api-client.js.

(function (global) {
  function _list(opts) {
    var params = { action: 'cv_list_drive_folders' };
    if (opts && opts._silent) params._silent = true;
    return callWorker(params).then(function (data) {
      return Array.isArray(data && data.folders) ? data.folders : [];
    });
  }

  function _create(payload) {
    return callWorker({
      action: 'cv_add_drive_folder',
      name: payload && payload.name,
      folder_id: payload && payload.folder_id
    }).then(function (data) {
      return (data && data.folder) || null;
    });
  }

  function _update(id, patch) {
    var params = { action: 'cv_update_drive_folder', id: id };
    if (patch && typeof patch.name === 'string') params.name = patch.name;
    if (patch && typeof patch.folder_id === 'string') params.folder_id = patch.folder_id;
    return callWorker(params).then(function (data) {
      return (data && data.folder) || null;
    });
  }

  function _remove(id) {
    return callWorker({ action: 'cv_delete_drive_folder', id: id })
      .then(function (data) { return { ok: !!(data && data.ok) }; });
  }

  global.CVDriveFoldersAPI = {
    list:   _list,
    create: _create,
    update: _update,
    remove: _remove
  };
}(window));
