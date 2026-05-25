'use strict';

// CVDriveCache - pure-function accessors for type='drive_file' rows.
// No DOM. No worker calls. Shared by ct-admin and classvault.

(function (global) {
  function filterDriveFiles(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(function (it) { return it && it.type === 'drive_file'; });
  }

  function groupByFolder(items) {
    var driveItems = filterDriveFiles(items);
    var map = {};
    var order = [];

    for (var i = 0; i < driveItems.length; i++) {
      var it = driveItems[i];
      var meta = it.meta_json || {};
      var key = (meta.folder_name && String(meta.folder_name).trim()) || '(raiz)';
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        map[key] = [];
        order.push(key);
      }
      map[key].push(it);
    }

    var groups = order.map(function (name) {
      return { name: name, items: map[name] };
    });

    groups.sort(function (a, b) {
      if (a.name === '(raiz)') return -1;
      if (b.name === '(raiz)') return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return { groups: groups, totalCount: driveItems.length };
  }

  global.CVDriveCache = {
    filterDriveFiles: filterDriveFiles,
    groupByFolder:    groupByFolder
  };
}(window));
