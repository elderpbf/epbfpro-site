'use strict';

// ============================================================
// Theme Registry (shared module)
// Unified theme system: all themes editable, canonical colors,
// engine adapters for Reveal.js and Panels.
// Assumed globals: AIClient (for AI generation), PanelsTheme (for panels apply)
// Usage: ThemeRegistry.renderThemeGrid(container, opts)
//        ThemeRegistry.renderCreator(container, opts)
//        ThemeRegistry.initTheme(name, engine)
// ============================================================

window.ThemeRegistry = (function() {

  // ── Default themes (seeded on first load) ──────────────────

  var DEFAULT_THEMES = [
    { name: 'black',     base: 'black',     colors: { bg: '#191919', text: '#ffffff', heading: '#ffffff', accent: '#42affa' } },
    { name: 'white',     base: 'white',     colors: { bg: '#ffffff', text: '#222222', heading: '#222222', accent: '#2a76dd' } },
    { name: 'league',    base: 'league',    colors: { bg: '#1a1a2e', text: '#eeeeee', heading: '#eeeeee', accent: '#f6c90e' } },
    { name: 'beige',     base: 'beige',     colors: { bg: '#f7f2d3', text: '#333333', heading: '#333333', accent: '#8b743d' } },
    { name: 'night',     base: 'night',     colors: { bg: '#1c1e20', text: '#eeeeee', heading: '#eeeeee', accent: '#e7ad52' } },
    { name: 'serif',     base: 'serif',     colors: { bg: '#f0ede0', text: '#383d3d', heading: '#383d3d', accent: '#8b4513' } },
    { name: 'simple',    base: 'simple',    colors: { bg: '#ffffff', text: '#444444', heading: '#333333', accent: '#333333' } },
    { name: 'solarized', base: 'solarized', colors: { bg: '#002b36', text: '#657b83', heading: '#93a1a1', accent: '#268bd2' } },
    { name: 'moon',      base: 'moon',      colors: { bg: '#002b36', text: '#839496', heading: '#93a1a1', accent: '#00bcd4' } },
    { name: 'dracula',   base: 'dracula',   colors: { bg: '#282a36', text: '#f8f8f2', heading: '#f8f8f2', accent: '#bd93f9' } },
    { name: 'sky',       base: 'sky',       colors: { bg: '#add9e4', text: '#003b4f', heading: '#003b4f', accent: '#007da3' } },
    { name: 'blood',     base: 'blood',     colors: { bg: '#2a0000', text: '#eeeeee', heading: '#eeeeee', accent: '#aa2233' } },
    { name: 'Original',  colors: { bg: '#0e1e30', text: '#e8edf2', heading: '#ffffff', accent: '#c8a84b' } },
    { name: 'Claro',     colors: { bg: '#f8fafc', text: '#1e293b', heading: '#0f172a', accent: '#f59e0b' } },
    { name: 'Oceano',    colors: { bg: '#0c1a2e', text: '#e0f2fe', heading: '#ffffff', accent: '#22d3ee' } },
    { name: 'Neutro',    colors: { bg: '#1e1e1e', text: '#d4d4d8', heading: '#fafafa', accent: '#a1a1aa' } }
  ];

  // ── Storage ───────────────────────────────────────────────

  function _migrateTheme(t) {
    if (t.overrides && !t.colors) {
      t.colors = {
        bg:      t.overrides['--r-background-color'] || '#191919',
        text:    t.overrides['--r-main-color']       || '#ffffff',
        heading: t.overrides['--r-heading-color']    || '#ffffff',
        accent:  t.overrides['--r-link-color']       || '#42affa'
      };
      delete t.overrides;
    }
    if (t.name && t.name.indexOf('custom:') === 0) {
      t.name = t.name.slice(7);
    }
    return t;
  }

  function getThemes() {
    var raw = localStorage.getItem('bs_custom_themes');
    if (!raw) {
      var seed = DEFAULT_THEMES.map(function(t) { return JSON.parse(JSON.stringify(t)); });
      saveThemes(seed);
      return seed;
    }
    var list = JSON.parse(raw);
    var migrated = false;
    for (var i = 0; i < list.length; i++) {
      var before = JSON.stringify(list[i]);
      list[i] = _migrateTheme(list[i]);
      if (JSON.stringify(list[i]) !== before) migrated = true;
    }
    if (migrated) saveThemes(list);
    return list;
  }

  function saveThemes(list) {
    localStorage.setItem('bs_custom_themes', JSON.stringify(list));
  }

  function getActiveTheme() {
    var name = localStorage.getItem('bs_reveal_theme') || 'black';
    if (name.indexOf('custom:') === 0) name = name.slice(7);
    return name;
  }

  function setActiveTheme(name) {
    localStorage.setItem('bs_reveal_theme', name);
  }

  // ── CRUD ──────────────────────────────────────────────────

  function getThemeByName(name) {
    var list = getThemes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i];
    }
    return null;
  }

  function createTheme(theme) {
    var list = getThemes();
    list.push(theme);
    saveThemes(list);
    return list;
  }

  function updateTheme(name, theme) {
    var list = getThemes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) {
        list[i] = theme;
        if (getActiveTheme() === name && theme.name !== name) {
          setActiveTheme(theme.name);
        }
        saveThemes(list);
        return list;
      }
    }
    return list;
  }

  function deleteTheme(name) {
    var list = getThemes();
    list = list.filter(function(t) { return t.name !== name; });
    saveThemes(list);
    if (getActiveTheme() === name) {
      setActiveTheme(list.length ? list[0].name : 'black');
    }
    return list;
  }

  // ── Engine adapters ───────────────────────────────────────

  function _toRevealVars(colors) {
    return {
      '--r-background-color': colors.bg,
      '--r-main-color':       colors.text,
      '--r-heading-color':    colors.heading,
      '--r-link-color':       colors.accent
    };
  }

  function _toPanelsVars(colors) {
    return {
      '--pn-bg':      colors.bg,
      '--pn-text':    colors.text,
      '--pn-heading': colors.heading,
      '--pn-accent':  colors.accent
    };
  }

  // ── Color helpers ─────────────────────────────────────────

  function _parseColorInput(value) {
    if (!value) return null;
    value = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (/^[0-9a-f]{6}$/i.test(value)) return '#' + value.toLowerCase();
    if (/^#?[0-9a-f]{3}$/i.test(value)) {
      var h = value.replace('#', '');
      return '#' + h[0]+h[0] + h[1]+h[1] + h[2]+h[2];
    }
    var m = value.match(/(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/);
    if (m) {
      var r = Math.min(255, parseInt(m[1]));
      var g = Math.min(255, parseInt(m[2]));
      var b = Math.min(255, parseInt(m[3]));
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    return null;
  }

  // ── Rendering: Theme Grid ─────────────────────────────────

  function renderThemeGrid(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var active = getActiveTheme();
    var themes = getThemes();

    function rerender() { renderThemeGrid(container, opts); }

    for (var i = 0; i < themes.length; i++) {
      (function(theme) {
        var c = theme.colors || {};
        var bg = c.bg || '#222222';
        var heading = c.heading || '#ffffff';
        var accent = c.accent || '#aaaaaa';
        var text = c.text || '#cccccc';

        var card = document.createElement('div');
        card.className = 'cf-theme-card' + (active === theme.name ? ' cf-selected' : '');
        card.dataset.value = theme.name;
        card.innerHTML =
          '<div class="cf-theme-card-preview" style="background:' + bg + '">' +
            '<div class="cf-theme-card-heading" style="color:' + heading + '">Aa</div>' +
            '<div class="cf-theme-card-bar" style="background:' + accent + '"></div>' +
            '<div class="cf-theme-card-lines">' +
              '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
              '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
            '</div>' +
          '</div>' +
          '<div class="cf-theme-card-label" style="background:' + bg + ';color:' + text + '">' + theme.name + '</div>';

        var edit = document.createElement('button');
        edit.className = 'cf-theme-card-edit';
        edit.textContent = '\u270e';
        edit.title = 'Editar tema';
        edit.onclick = function(e) {
          e.stopPropagation();
          if (opts.onEdit) opts.onEdit(theme.name);
        };
        card.appendChild(edit);

        var del = document.createElement('button');
        del.className = 'cf-theme-card-delete';
        del.textContent = '\u00d7';
        del.title = 'Excluir tema';
        del.onclick = function(e) {
          e.stopPropagation();
          deleteTheme(theme.name);
          rerender();
        };
        card.appendChild(del);

        container.appendChild(card);
        card.addEventListener('click', function() {
          if (opts.onSelect) opts.onSelect(theme.name);
        });
      })(themes[i]);
    }

    // "+" card for creating new themes
    var addCard = document.createElement('div');
    addCard.className = 'cf-theme-card cf-theme-card-add';
    addCard.innerHTML =
      '<div class="cf-theme-card-preview" style="background:var(--surface,#2a2a2a);display:flex;align-items:center;justify-content:center">' +
        '<span style="font-size:2rem;color:var(--text-secondary,#888)">+</span>' +
      '</div>' +
      '<div class="cf-theme-card-label" style="background:var(--surface,#2a2a2a);color:var(--text-secondary,#888)">Novo tema</div>';
    addCard.addEventListener('click', function() {
      if (opts.onCreate) opts.onCreate();
    });
    container.appendChild(addCard);
  }

  // ── Rendering: Creator ────────────────────────────────────

  function _colorRowHtml(prefix, key, label, val) {
    return (
      '<div class="cf-color-row">' +
        '<label>' + label + '</label>' +
        '<input type="color" id="' + prefix + 'color-' + key + '" value="' + (val || '#000000') + '">' +
        '<input type="text" id="' + prefix + 'text-' + key + '" value="' + (val || '#000000') + '" placeholder="#000000 ou 255, 0, 0">' +
      '</div>'
    );
  }

  function renderCreator(container, opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'tc-';
    var editName = opts.editingName || null;
    var existing = editName ? getThemeByName(editName) : null;
    var ec = existing ? existing.colors : null;

    var html =
      '<div class="cf-creator-tabs">' +
        '<button class="cf-creator-tab active" data-tab="manual">Manual</button>' +
        '<button class="cf-creator-tab" data-tab="ai">IA</button>' +
      '</div>' +
      '<div id="' + prefix + 'panel-manual">' +
        '<div class="bs-field" style="margin-bottom:0.75rem">' +
          '<label>Nome do tema</label>' +
          '<input id="' + prefix + 'name" type="text" placeholder="Ex: Meu tema escuro" value="' + (existing ? existing.name : '') + '">' +
        '</div>' +
        _colorRowHtml(prefix, 'bg',      'Fundo',    ec ? ec.bg      : '#191919') +
        _colorRowHtml(prefix, 'text',    'Texto',    ec ? ec.text    : '#ffffff') +
        _colorRowHtml(prefix, 'heading', 'Titulo',   ec ? ec.heading : '#ffffff') +
        _colorRowHtml(prefix, 'accent',  'Destaque', ec ? ec.accent  : '#42affa') +
        '<p class="bs-form-error" id="' + prefix + 'manual-error"></p>' +
        '<button class="bs-save-btn" id="' + prefix + 'manual-save">' + (editName ? 'Atualizar tema' : 'Salvar tema') + '</button>' +
      '</div>' +
      '<div id="' + prefix + 'panel-ai" hidden>' +
        '<div class="bs-field">' +
          '<label>Descreva o tema</label>' +
          '<textarea id="' + prefix + 'ai-desc" class="bs-textarea" placeholder="Ex: Tema escuro e elegante com tons de azul oceano..."></textarea>' +
        '</div>' +
        '<p class="bs-form-error" id="' + prefix + 'ai-error"></p>' +
        '<button class="bs-save-btn" id="' + prefix + 'ai-gen">Gerar com Gemini</button>' +
        '<div id="' + prefix + 'ai-preview" hidden style="margin-top:1rem;padding:0.75rem;border-radius:8px;border:1px solid rgba(20,184,166,.3)">' +
          '<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.5rem">' +
            'Pré-visualização</p>' +
          '<div id="' + prefix + 'ai-swatches" style="display:flex;gap:6px;margin-bottom:0.75rem"></div>' +
          '<p id="' + prefix + 'ai-name" style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin-bottom:0.75rem"></p>' +
          '<button class="bs-save-btn" id="' + prefix + 'ai-save">Salvar tema</button>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;

    // Tab switching
    var tabs = container.querySelectorAll('.cf-creator-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function() {
        var tabName = this.dataset.tab;
        for (var j = 0; j < tabs.length; j++) {
          tabs[j].classList.toggle('active', tabs[j].dataset.tab === tabName);
        }
        document.getElementById(prefix + 'panel-manual').hidden = (tabName !== 'manual');
        document.getElementById(prefix + 'panel-ai').hidden = (tabName !== 'ai');
      });
    }

    // Color input sync
    container.querySelectorAll('.cf-color-row').forEach(function(row) {
      var picker = row.querySelector('input[type="color"]');
      var text = row.querySelector('input[type="text"]');
      if (!picker || !text) return;
      picker.addEventListener('input', function() { text.value = picker.value; });
      text.addEventListener('input', function() {
        var parsed = _parseColorInput(text.value);
        if (parsed) picker.value = parsed;
      });
    });

    // Manual save
    document.getElementById(prefix + 'manual-save').addEventListener('click', function() {
      var name = document.getElementById(prefix + 'name').value.trim();
      var errEl = document.getElementById(prefix + 'manual-error');
      errEl.textContent = '';
      if (!name) { errEl.textContent = 'Escolha um nome para o tema.'; return; }

      var theme = {
        name: name,
        colors: {
          bg:      document.getElementById(prefix + 'color-bg').value,
          text:    document.getElementById(prefix + 'color-text').value,
          heading: document.getElementById(prefix + 'color-heading').value,
          accent:  document.getElementById(prefix + 'color-accent').value
        }
      };

      if (editName) {
        updateTheme(editName, theme);
      } else if (getThemeByName(name)) {
        updateTheme(name, theme);
      } else {
        createTheme(theme);
      }
      if (opts.onSave) opts.onSave(theme);
    });

    // AI generation
    var pendingTheme = null;

    document.getElementById(prefix + 'ai-gen').addEventListener('click', async function() {
      var desc = document.getElementById(prefix + 'ai-desc').value.trim();
      var errEl = document.getElementById(prefix + 'ai-error');
      var preview = document.getElementById(prefix + 'ai-preview');
      errEl.textContent = '';
      preview.hidden = true;
      pendingTheme = null;

      if (!desc) { errEl.textContent = 'Descreva o tema antes de gerar.'; return; }

      var btn = this;
      btn.textContent = 'Gerando...';
      btn.disabled = true;
      try {
        var resp = await AIClient.generate({ action: 'ai_theme', description: desc });
        if (!resp || !resp.theme || !resp.theme.overrides) {
          if (typeof showToastError === 'function') {
            showToastError('IA indisponível ou resposta inválida. Tente novamente.');
          }
          return;
        }
        var ov = resp.theme.overrides;
        pendingTheme = {
          name: resp.theme.name || desc.slice(0, 30),
          base: resp.theme.base || 'black',
          colors: {
            bg:      ov['--r-background-color'] || '#191919',
            text:    ov['--r-main-color']       || '#ffffff',
            heading: ov['--r-heading-color']    || '#ffffff',
            accent:  ov['--r-link-color']       || '#42affa'
          }
        };
        var swatches = document.getElementById(prefix + 'ai-swatches');
        swatches.innerHTML = '';
        var sc = [pendingTheme.colors.bg, pendingTheme.colors.text,
                  pendingTheme.colors.heading, pendingTheme.colors.accent];
        for (var i = 0; i < sc.length; i++) {
          var s = document.createElement('div');
          s.style.cssText = 'width:28px;height:28px;border-radius:6px;background:' +
            sc[i] + ';border:1px solid rgba(0,0,0,.2)';
          swatches.appendChild(s);
        }
        document.getElementById(prefix + 'ai-name').textContent = pendingTheme.name;
        preview.hidden = false;
      } catch (err) {
        if (typeof dbg === 'function') dbg('error', 'ai_theme: ' + err.message);
        if (typeof showToastError === 'function') {
          showToastError('Erro ao gerar tema. Tente novamente.');
        }
      } finally {
        btn.textContent = 'Gerar com Gemini';
        btn.disabled = false;
      }
    });

    document.getElementById(prefix + 'ai-save').addEventListener('click', function() {
      if (!pendingTheme) return;
      if (getThemeByName(pendingTheme.name)) {
        updateTheme(pendingTheme.name, pendingTheme);
      } else {
        createTheme(pendingTheme);
      }
      document.getElementById(prefix + 'ai-preview').hidden = true;
      document.getElementById(prefix + 'ai-desc').value = '';
      if (opts.onSave) opts.onSave(pendingTheme);
      pendingTheme = null;
    });
  }

  // ── Reveal.js theme application ───────────────────────────

  function themeUrl(name) {
    return 'https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/' + name + '.css';
  }

  function setTheme(name) {
    var el = document.getElementById('reveal-theme');
    if (el) el.href = themeUrl(name);
  }

  function applyTheme(name, engine) {
    engine = engine || 'reveal';
    var theme = getThemeByName(name);
    if (!theme) return;

    if (engine === 'reveal') {
      setTheme(theme.base || 'black');
      var vars = _toRevealVars(theme.colors);
      var el = document.getElementById('cf-theme-overrides');
      if (!el) {
        el = document.createElement('style');
        el.id = 'cf-theme-overrides';
        document.head.appendChild(el);
      }
      var css = Object.keys(vars).map(function(k) {
        return k + ':' + vars[k];
      }).join(';');
      el.textContent = '.reveal{' + css + '}';
    } else if (engine === 'panels') {
      if (typeof PanelsTheme !== 'undefined' && PanelsTheme.applyVars) {
        PanelsTheme.applyVars(_toPanelsVars(theme.colors));
      }
    }
  }

  function initTheme(name, engine) {
    applyTheme(name || 'black', engine);
  }

  function resolveTheme(lessonTheme) {
    var params = new URLSearchParams(location.search);
    return params.get('theme') || getActiveTheme() || lessonTheme || 'black';
  }

  return {
    DEFAULT_THEMES: DEFAULT_THEMES,
    getThemes: getThemes,
    saveThemes: saveThemes,
    getActiveTheme: getActiveTheme,
    setActiveTheme: setActiveTheme,
    getThemeByName: getThemeByName,
    createTheme: createTheme,
    updateTheme: updateTheme,
    deleteTheme: deleteTheme,
    renderThemeGrid: renderThemeGrid,
    renderCreator: renderCreator,
    themeUrl: themeUrl,
    setTheme: setTheme,
    applyTheme: applyTheme,
    initTheme: initTheme,
    resolveTheme: resolveTheme
  };

})();
