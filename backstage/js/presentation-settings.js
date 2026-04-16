'use strict';

// ============================================================
// Presentation Settings (shared module)
// Builds SettingsDrawer sections for presentation contexts.
// Engine-agnostic: delegates to ThemeRegistry for grid + creator.
// Assumed globals: ThemeRegistry, PanelsTheme (for panels engine)
// Usage: PresentationSettings.buildSections({ engine, onThemeChange, slug? })
// ============================================================

window.PresentationSettings = (function() {

  function _buildSection(engine, opts) {
    var prefix = 'ps-' + engine + '-';
    var gridId = prefix + 'grid';
    var creatorId = prefix + 'creator';

    function _showCreator() {
      var el = document.getElementById(creatorId);
      if (el) el.hidden = false;
    }

    function _hideCreator() {
      var el = document.getElementById(creatorId);
      if (el) el.hidden = true;
    }

    function _triggerThumbCapture() {
      if (typeof window._captureThumbnail === 'function') {
        setTimeout(window._captureThumbnail, 500);
      }
    }

    function _onThemeApplied(name) {
      if (opts.slug) {
        try { localStorage.setItem('bs_theme_' + opts.slug, name); } catch (e) {}
      } else {
        ThemeRegistry.setActiveTheme(name);
      }
      ThemeRegistry.applyTheme(name, engine);
      // Sync Panels per-slug persistence
      if (engine === 'panels' && opts.slug && typeof PanelsTheme !== 'undefined') {
        try { localStorage.setItem('bs_pn_theme_' + opts.slug, name); } catch (e) {}
      }
      if (opts.onThemeChange) opts.onThemeChange(name);
    }

    function renderGrid() {
      var container = document.getElementById(gridId);
      if (!container) return;
      ThemeRegistry.renderThemeGrid(container, {
        onSelect: function(name) {
          _onThemeApplied(name);
          renderGrid();
          if (typeof showToast === 'function') {
            showToast('Tema "' + name + '" selecionado.');
          }
        },
        onEdit: function(name) {
          _showCreator();
          ThemeRegistry.renderCreator(document.getElementById(creatorId), {
            prefix: prefix,
            editingName: name,
            onSave: function(theme) {
              _onThemeApplied(theme.name);
              _triggerThumbCapture();
              renderGrid();
              _hideCreator();
            }
          });
        },
        onCreate: function() {
          _showCreator();
          renderCreator();
        }
      });
    }

    function renderCreator() {
      var container = document.getElementById(creatorId);
      if (!container) return;
      ThemeRegistry.renderCreator(container, {
        prefix: prefix,
        onSave: function(theme) {
          _onThemeApplied(theme.name);
          _triggerThumbCapture();
          renderGrid();
          _hideCreator();
        }
      });
    }

    var thumbBtnId = prefix + 'thumb-btn';

    var themeSection = {
      id: 'ps-theme-' + engine,
      title: 'Tema',
      content:
        '<p class="bs-hint" style="margin-bottom:0.75rem">Selecione ou crie um tema para a apresentação.</p>' +
        '<div id="' + gridId + '" class="cf-theme-grid"></div>' +
        '<div id="' + creatorId + '" style="margin-top:1.25rem" hidden></div>',
      onOpen: function() {
        renderGrid();
        _hideCreator();
      },
      onInit: function() {}
    };

    var thumbSection = {
      id: 'ps-thumb-' + engine,
      title: 'Thumbnail',
      content:
        '<p class="bs-hint" style="margin-bottom:0.75rem">Captura o primeiro slide como imagem para o card na galeria.</p>' +
        '<button class="bs-save-btn" id="' + thumbBtnId + '">Atualizar Thumbnail</button>',
      onOpen: function() {},
      onInit: function() {
        var btn = document.getElementById(thumbBtnId);
        if (btn) btn.addEventListener('click', function() {
          btn.disabled = true;
          btn.textContent = 'Capturando...';
          _triggerThumbCapture();
          setTimeout(function() {
            btn.disabled = false;
            btn.textContent = 'Atualizar Thumbnail';
          }, 3000);
        });
      }
    };

    return [themeSection, thumbSection];
  }

  function buildSections(opts) {
    opts = opts || {};
    var engine = opts.engine || 'reveal';
    return _buildSection(engine, opts);
  }

  return { buildSections: buildSections };

})();
