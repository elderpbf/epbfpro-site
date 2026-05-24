'use strict';

// CVPresetsAPI - thin client for the 5 cv_*_preset Worker actions.
// Both ClassTrail admin (Conteudo / Presets sub-tab CRUD) and ClassVault
// (Aula sidebar "Carregar preset" dropdown) consume this. One module, one
// request shape, one response shape. No DOM dependencies.
//
// All methods return Promises. Success resolves to the relevant payload
// (presets[] or single preset or { ok:true }). Errors throw with err.data
// carrying the structured response from callWorker.
//
// Depends on global callWorker() defined in api-client.js.

(function (global) {
  function _list(opts) {
    var params = { action: 'cv_list_presets' };
    if (opts && opts._silent) params._silent = true;
    return callWorker(params).then(function (data) {
      return Array.isArray(data && data.presets) ? data.presets : [];
    });
  }

  function _get(id, opts) {
    var params = { action: 'cv_get_preset', id: id };
    if (opts && opts._silent) params._silent = true;
    return callWorker(params).then(function (data) {
      return (data && data.preset) || null;
    });
  }

  function _create(payload) {
    return callWorker({
      action: 'cv_create_preset',
      name: payload && payload.name,
      item_ids: (payload && payload.item_ids) || []
    }).then(function (data) {
      return (data && data.preset) || null;
    });
  }

  function _update(id, patch) {
    var params = { action: 'cv_update_preset', id: id };
    if (patch && typeof patch.name === 'string') params.name = patch.name;
    if (patch && Array.isArray(patch.item_ids)) params.item_ids = patch.item_ids;
    return callWorker(params).then(function (data) {
      return (data && data.preset) || null;
    });
  }

  function _remove(id) {
    return callWorker({ action: 'cv_delete_preset', id: id })
      .then(function (data) { return { ok: !!(data && data.ok) }; });
  }

  global.CVPresetsAPI = {
    list:   _list,
    get:    _get,
    create: _create,
    update: _update,
    remove: _remove
  };
}(window));
