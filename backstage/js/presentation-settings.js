'use strict';

// ============================================================
// Presentation Settings (shared module)
// Builds SettingsDrawer sections for presentation contexts.
// Engine-agnostic: 'reveal' uses ThemeRegistry, 'panels' uses PanelsTheme.
// Assumed globals: ThemeRegistry (reveal), PanelsTheme (panels), AIClient (reveal AI)
// Usage: PresentationSettings.buildSections({ engine, onThemeChange, slug? })
// ============================================================

window.PresentationSettings = (function() {

  // ── Reveal engine ────────────────────────────────────────

  function _revealSectionHtml() {
    return (
      '<p class="bs-hint" style="margin-bottom:0.75rem">Selecione um tema para aplicar à apresentação.</p>' +
      '<div id="ps-theme-grid" class="cf-theme-grid"></div>' +
      '<div style="margin-top:1.25rem">' +
        '<button class="bs-toggle-btn" id="ps-show-gen-btn">+ Criar tema com IA</button>' +
        '<div id="ps-gen-form" hidden style="margin-top:1rem">' +
          '<div class="bs-field">' +
            '<label>Descreva o tema</label>' +
            '<textarea id="ps-desc-input" class="bs-textarea" placeholder="Ex: Tema escuro e elegante com tons de azul oceano..."></textarea>' +
          '</div>' +
          '<p class="bs-form-error" id="ps-gen-error"></p>' +
          '<button class="bs-save-btn" id="ps-gen-btn">Gerar com Gemini</button>' +
          '<div id="ps-gen-preview" hidden style="margin-top:1rem;padding:0.75rem;border-radius:8px;border:1px solid rgba(20,184,166,.3)">' +
            '<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.5rem">Pré-visualização</p>' +
            '<div id="ps-preview-swatches" style="display:flex;gap:6px;margin-bottom:0.75rem"></div>' +
            '<p id="ps-preview-name" style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin-bottom:0.75rem"></p>' +
            '<button class="bs-save-btn" id="ps-save-btn">Salvar tema</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _buildRevealSection(opts) {
    var pendingTheme = null;

    function renderGrid() {
      var container = document.getElementById('ps-theme-grid');
      if (!container) return;
      ThemeRegistry.renderThemeGrid(container, {
        onSelect: function(name) {
          ThemeRegistry.setActiveTheme(name);
          if (opts.onThemeChange) opts.onThemeChange(name);
          renderGrid();
          if (typeof showToast === 'function') {
            showToast('Tema "' + name.replace('custom:', '') + '" selecionado.');
          }
        }
      });
    }

    return {
      id: 'ps-theme',
      title: 'Tema',
      content: _revealSectionHtml(),
      onOpen: renderGrid,
      onInit: function() {
        // Toggle AI form
        document.getElementById('ps-show-gen-btn').addEventListener('click', function() {
          var form = document.getElementById('ps-gen-form');
          form.hidden = !form.hidden;
        });

        // Generate theme
        document.getElementById('ps-gen-btn').addEventListener('click', async function() {
          var desc = document.getElementById('ps-desc-input').value.trim();
          var errEl = document.getElementById('ps-gen-error');
          var preview = document.getElementById('ps-gen-preview');
          errEl.textContent = '';
          preview.hidden = true;
          pendingTheme = null;

          if (!desc) { errEl.textContent = 'Descreva o tema antes de gerar.'; return; }

          var btn = this;
          btn.textContent = 'Gerando...';
          btn.disabled = true;
          try {
            var theme = await ThemeRegistry.generateTheme(desc);
            if (!theme) {
              if (typeof showToastError === 'function') showToastError('IA indisponível ou resposta inválida. Tente novamente.');
              return;
            }
            pendingTheme = theme;
            var swatches = document.getElementById('ps-preview-swatches');
            swatches.innerHTML = '';
            var colors = [
              theme.overrides['--r-background-color'],
              theme.overrides['--r-main-color'],
              theme.overrides['--r-heading-color'],
              theme.overrides['--r-link-color']
            ];
            for (var i = 0; i < colors.length; i++) {
              if (!colors[i]) continue;
              var s = document.createElement('div');
              s.style.cssText = 'width:28px;height:28px;border-radius:6px;background:' + colors[i] + ';border:1px solid rgba(0,0,0,.2)';
              swatches.appendChild(s);
            }
            document.getElementById('ps-preview-name').textContent = theme.name;
            preview.hidden = false;
          } catch (err) {
            if (typeof dbg === 'function') dbg('error', 'ai_theme: ' + err.message);
            if (typeof showToastError === 'function') showToastError('Erro ao gerar tema. Tente novamente.');
          } finally {
            btn.textContent = 'Gerar com Gemini';
            btn.disabled = false;
          }
        });

        // Save generated theme
        document.getElementById('ps-save-btn').addEventListener('click', function() {
          if (!pendingTheme) return;
          ThemeRegistry.createCustomTheme(pendingTheme);
          var themeName = 'custom:' + pendingTheme.name;
          ThemeRegistry.setActiveTheme(themeName);
          if (opts.onThemeChange) opts.onThemeChange(themeName);
          document.getElementById('ps-gen-preview').hidden = true;
          document.getElementById('ps-desc-input').value = '';
          pendingTheme = null;
          renderGrid();
        });
      }
    };
  }

  // ── Panels engine ────────────────────────────────────────

  function _buildPanelsSection(opts) {

    function renderGrid() {
      var container = document.getElementById('ps-panels-grid');
      if (!container) return;
      container.innerHTML = '';
      var current = PanelsTheme.getCurrent();
      var presets = PanelsTheme.getPresets();

      for (var i = 0; i < presets.length; i++) {
        (function(preset) {
          var vars = preset.vars || {};
          var bg = vars['--pn-bg'] || '#0e1e30';
          var heading = vars['--pn-heading'] || '#ffffff';
          var accent = vars['--pn-accent'] || '#c8a84b';
          var text = vars['--pn-text'] || '#e8edf2';

          var card = document.createElement('div');
          card.className = 'cf-theme-card' + (current === preset.name ? ' cf-selected' : '');
          card.dataset.value = preset.name;
          card.innerHTML =
            '<div class="cf-theme-card-preview" style="background:' + bg + '">' +
              '<div class="cf-theme-card-heading" style="color:' + heading + '">Aa</div>' +
              '<div class="cf-theme-card-bar" style="background:' + accent + '"></div>' +
              '<div class="cf-theme-card-lines">' +
                '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
                '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
              '</div>' +
            '</div>' +
            '<div class="cf-theme-card-label" style="background:' + bg + ';color:' + text + '">' + preset.label + '</div>';

          container.appendChild(card);
          card.addEventListener('click', function() {
            PanelsTheme.apply(preset.name);
            if (opts.onThemeChange) opts.onThemeChange(preset.name);
            renderGrid();
            if (typeof showToast === 'function') {
              showToast('Tema "' + preset.label + '" selecionado.');
            }
          });
        })(presets[i]);
      }
    }

    return {
      id: 'ps-panels-theme',
      title: 'Tema',
      content:
        '<p class="bs-hint" style="margin-bottom:0.75rem">Selecione um tema para aplicar à apresentação.</p>' +
        '<div id="ps-panels-grid" class="cf-theme-grid"></div>',
      onOpen: renderGrid
    };
  }

  // ── Public API ───────────────────────────────────────────

  function buildSections(opts) {
    opts = opts || {};
    var engine = opts.engine || 'reveal';

    if (engine === 'panels') {
      return [_buildPanelsSection(opts)];
    }
    return [_buildRevealSection(opts)];
  }

  return { buildSections: buildSections };

})();
