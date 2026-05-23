'use strict';

// Content-type registry for ClassVault / PensoCodex.
//
// Each entry declares the type-specific *actions* that should appear in the
// bottom action bar when an item of that type is active. Renderers stay in
// classvault.js for now (per Bundle D scope); the registry is a thin lookup
// for buttons.
//
// Shape:
//   CVTypes.register('slide', {
//     actions: [{ id, label, title?, handler(item) }]   // static, or
//     actions: function(item) { return [...] }          // dynamic
//   });
//
// Lookups:
//   CVTypes.actionsFor(item)            → array of {id, label, title}
//   CVTypes.handlerFor(item, actionId)  → handler function or null
//   CVTypes.supportsTextResize(item)    → boolean (Bundle F +A/-A controls)
//
// Body-markdown fallback: any item with a non-empty body_md automatically
// gains the "Copiar" action even when its type isn't explicitly registered.
// Explicit type entries can return [] to opt out.
// textResize defaults to true for items rendered by the markdown card (any
// type with body_md AND no explicit entry, OR an entry whose def sets it
// explicitly). Iframe-based types (slide / drive_file / embed / video / lab)
// register textResize:false because the embedded chrome controls its own font.

window.CVTypes = (function() {

  var _registry = {};

  function register(type, def) {
    _registry[type] = def || {};
  }

  function _resolveActions(item) {
    var def = _registry[item.type];
    if (def && def.actions) {
      var arr = typeof def.actions === 'function' ? def.actions(item) : def.actions;
      return Array.isArray(arr) ? arr : [];
    }
    return null; // signal "no explicit entry"
  }

  function actionsFor(item) {
    var actions = _resolveActions(item);
    if (actions == null) {
      // Fallback: any item with body_md gets Copiar.
      actions = [];
      if (item && item.body_md) actions.push(_copyAction());
    }
    return actions.map(function(a) {
      return { id: a.id, label: a.label, title: a.title || '' };
    });
  }

  function handlerFor(item, actionId) {
    var actions = _resolveActions(item);
    if (actions == null && item && item.body_md) actions = [_copyAction()];
    if (!actions) return null;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i].id === actionId) return actions[i].handler || null;
    }
    return null;
  }

  function _copyAction() {
    return {
      id: 'copy',
      label: '📋 Copiar',
      title: 'Copiar conteúdo do item',
      handler: function(item) {
        var text = item.body_md || '';
        if (!text) return;
        var done = function() {
          if (window.BSToast) BSToast.show('Copiado.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(_fallbackCopy.bind(null, text, done));
        } else {
          _fallbackCopy(text, done);
        }
      }
    };
  }

  function _fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  function supportsTextResize(item) {
    if (!item) return false;
    var def = _registry[item.type];
    if (def && typeof def.textResize === 'boolean') return def.textResize;
    // Default: any item with body_md is resizable (rendered by the markdown
    // fallback card, whose font-size honours the CSS scale variable).
    return !!(item.body_md && String(item.body_md).trim());
  }

  return {
    register: register,
    actionsFor: actionsFor,
    handlerFor: handlerFor,
    supportsTextResize: supportsTextResize
  };

})();

// ── Built-in type entries ─────────────────────────────────────

// Google Slides published embed: surface the popup-window launcher in the bar.
CVTypes.register('slide', {
  textResize: false,
  actions: function(item) {
    var url = (item.meta_json && item.meta_json.url) || '';
    if (!url) return [];
    return [{
      id: 'popup',
      label: '↗ Janela',
      title: 'Abrir em janela',
      handler: function() { _cvtOpenPopup(url); }
    }];
  }
});

// Drive iframe-embedded files (drive_file type, stored in ct_items, not the
// synthetic Drive-list items which have their own breadcrumb path).
CVTypes.register('drive_file', {
  textResize: false,
  actions: function(item) {
    var url = (item.meta_json && item.meta_json.url) || '';
    if (!url) return [];
    return [{
      id: 'popup',
      label: '↗ Janela',
      title: 'Abrir em janela',
      handler: function() { _cvtOpenPopup(url); }
    }];
  }
});

// External-launcher types (LLM / popup_url card): the in-card "Abrir em janela"
// button is the primary call to action, no duplicate in the bar.
CVTypes.register('popup_url', { actions: [] });
CVTypes.register('llm', { actions: [] });

// Embedded iframe (full chrome) and lab launchers have no extra bar actions.
// textResize:false because the embedded chrome controls its own font sizing.
CVTypes.register('embed',         { actions: [], textResize: false });
CVTypes.register('lab',           { actions: [], textResize: false });
CVTypes.register('video',         { actions: [], textResize: false });
CVTypes.register('drive_folder',  { actions: [], textResize: false });

// Renamed from `_openPopup` to avoid clobbering classvault.js's identically
// named helper. They served the same role; keeping a private name here means
// future divergence in either copy can't silently break the other.
function _cvtOpenPopup(url) {
  var w = Math.max(800, Math.floor((window.outerWidth || window.innerWidth) - 80));
  var h = Math.max(600, Math.floor((window.outerHeight || window.innerHeight) - 80));
  var left = (typeof window.screenX === 'number' ? window.screenX : 0) + 40;
  var top = (typeof window.screenY === 'number' ? window.screenY : 0) + 40;
  var features = [
    'popup=yes', 'width=' + w, 'height=' + h, 'left=' + left, 'top=' + top,
    'toolbar=no', 'menubar=no', 'location=yes', 'resizable=yes', 'scrollbars=yes'
  ].join(',');
  var popup = window.open(url, '_blank', features);
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}
