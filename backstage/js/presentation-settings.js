'use strict';

// ============================================================
// Presentation Settings (shared module)
// Builds SettingsDrawer sections for presentation contexts.
// Engine-agnostic: delegates to ThemeRegistry for grid + creator.
// Assumed globals: ThemeRegistry, PanelsTheme (for panels engine)
// Usage: PresentationSettings.buildSections({ engine, onThemeChange })
// ============================================================

window.PresentationSettings = (function() {

  function _buildSection(engine, opts) {
    var prefix = 'ps-' + engine + '-';
    var gridId = prefix + 'grid';
    var creatorId = prefix + 'creator';

    function renderGrid() {
      var container = document.getElementById(gridId);
      if (!container) return;
      ThemeRegistry.renderThemeGrid(container, {
        onSelect: function(name) {
          ThemeRegistry.setActiveTheme(name);
          ThemeRegistry.applyTheme(name, engine);
          if (opts.onThemeChange) opts.onThemeChange(name);
          renderGrid();
          if (typeof showToast === 'function') {
            showToast('Tema "' + name + '" selecionado.');
          }
        },
        onEdit: function(name) {
          ThemeRegistry.renderCreator(document.getElementById(creatorId), {
            prefix: prefix,
            editingName: name,
            onSave: function(theme) {
              ThemeRegistry.setActiveTheme(theme.name);
              ThemeRegistry.applyTheme(theme.name, engine);
              if (opts.onThemeChange) opts.onThemeChange(theme.name);
              renderGrid();
              renderCreator();
            }
          });
        }
      });
    }

    function renderCreator() {
      var container = document.getElementById(creatorId);
      if (!container) return;
      ThemeRegistry.renderCreator(container, {
        prefix: prefix,
        onSave: function(theme) {
          ThemeRegistry.setActiveTheme(theme.name);
          ThemeRegistry.applyTheme(theme.name, engine);
          if (opts.onThemeChange) opts.onThemeChange(theme.name);
          renderGrid();
          renderCreator();
        }
      });
    }

    return {
      id: 'ps-theme-' + engine,
      title: 'Tema',
      content:
        '<p class="bs-hint" style="margin-bottom:0.75rem">Selecione ou crie um tema para a apresentação.</p>' +
        '<div id="' + gridId + '" class="cf-theme-grid"></div>' +
        '<div id="' + creatorId + '" style="margin-top:1.25rem"></div>',
      onOpen: renderGrid,
      onInit: renderCreator
    };
  }

  function buildSections(opts) {
    opts = opts || {};
    var engine = opts.engine || 'reveal';
    return [_buildSection(engine, opts)];
  }

  return { buildSections: buildSections };

})();
