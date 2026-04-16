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

  // ── Scale presets ────────────────────────────────────────

  var SCALE_PRESETS = {
    compact:  { base: 36, h1: 2.0, h2: 1.4, h3: 1.1, body: 0.9, small: 0.65 },
    normal:   { base: 42, h1: 2.5, h2: 1.6, h3: 1.3, body: 1.0, small: 0.7 },
    spacious: { base: 48, h1: 3.0, h2: 1.8, h3: 1.5, body: 1.1, small: 0.75 }
  };

  // ── Curated font list ───────────────────────────────────

  var FONT_LIST = [
    { name: 'Inter',             category: 'sans-serif' },
    { name: 'Poppins',           category: 'sans-serif' },
    { name: 'Roboto',            category: 'sans-serif' },
    { name: 'Lato',              category: 'sans-serif' },
    { name: 'Montserrat',        category: 'sans-serif' },
    { name: 'Open Sans',         category: 'sans-serif' },
    { name: 'Source Sans 3',     category: 'sans-serif' },
    { name: 'Nunito',            category: 'sans-serif' },
    { name: 'Fira Sans',         category: 'sans-serif' },
    { name: 'PT Sans',           category: 'sans-serif' },
    { name: 'Raleway',           category: 'sans-serif' },
    { name: 'Oswald',            category: 'sans-serif' },
    { name: 'Playfair Display',  category: 'serif' },
    { name: 'Merriweather',      category: 'serif' },
    { name: 'Libre Baskerville', category: 'serif' },
    { name: 'Fira Code',         category: 'monospace' },
    { name: 'Arial',             category: 'sans-serif', system: true },
    { name: 'Georgia',           category: 'serif',      system: true },
    { name: 'Courier New',       category: 'monospace',  system: true }
  ];

  // ── Default themes (seeded on first load) ──────────────────

  var DEFAULT_THEMES = [
    { name: 'black',     colors: { bg: '#191919', text: '#ffffff', heading: '#ffffff', accent: '#42affa' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'white',     colors: { bg: '#ffffff', text: '#222222', heading: '#222222', accent: '#2a76dd' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'league',    colors: { bg: '#1a1a2e', text: '#eeeeee', heading: '#eeeeee', accent: '#f6c90e' }, fonts: { heading: 'Oswald', body: 'Lato', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'beige',     colors: { bg: '#f7f2d3', text: '#333333', heading: '#333333', accent: '#8b743d' }, fonts: { heading: 'Playfair Display', body: 'Lato', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'night',     colors: { bg: '#1c1e20', text: '#eeeeee', heading: '#eeeeee', accent: '#e7ad52' }, fonts: { heading: 'Montserrat', body: 'Open Sans', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'serif',     colors: { bg: '#f0ede0', text: '#383d3d', heading: '#383d3d', accent: '#8b4513' }, fonts: { heading: 'Libre Baskerville', body: 'PT Sans', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'simple',    colors: { bg: '#ffffff', text: '#444444', heading: '#333333', accent: '#333333' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'solarized', colors: { bg: '#002b36', text: '#657b83', heading: '#93a1a1', accent: '#268bd2' }, fonts: { heading: 'Roboto', body: 'Roboto', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'moon',      colors: { bg: '#002b36', text: '#839496', heading: '#93a1a1', accent: '#00bcd4' }, fonts: { heading: 'Raleway', body: 'Nunito', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'dracula',   colors: { bg: '#282a36', text: '#f8f8f2', heading: '#f8f8f2', accent: '#bd93f9' }, fonts: { heading: 'Fira Sans', body: 'Fira Sans', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'sky',       colors: { bg: '#add9e4', text: '#003b4f', heading: '#003b4f', accent: '#007da3' }, fonts: { heading: 'Poppins', body: 'Source Sans 3', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'blood',     colors: { bg: '#2a0000', text: '#eeeeee', heading: '#eeeeee', accent: '#aa2233' }, fonts: { heading: 'Merriweather', body: 'Open Sans', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'Original',  colors: { bg: '#0e1e30', text: '#e8edf2', heading: '#ffffff', accent: '#c8a84b' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'Claro',     colors: { bg: '#f8fafc', text: '#1e293b', heading: '#0f172a', accent: '#f59e0b' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'Oceano',    colors: { bg: '#0c1a2e', text: '#e0f2fe', heading: '#ffffff', accent: '#22d3ee' }, fonts: { heading: 'Montserrat', body: 'Nunito', code: 'Fira Code' }, sizes: { scale: 'normal' } },
    { name: 'Neutro',    colors: { bg: '#1e1e1e', text: '#d4d4d8', heading: '#fafafa', accent: '#a1a1aa' }, fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' }, sizes: { scale: 'normal' } }
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
    if (t.base) delete t.base;
    if (!t.fonts) t.fonts = { heading: 'Inter', body: 'Inter', code: 'Fira Code' };
    if (!t.sizes) t.sizes = { scale: 'normal' };
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

  function _fontFamily(name) {
    for (var i = 0; i < FONT_LIST.length; i++) {
      if (FONT_LIST[i].name === name) return "'" + name + "', " + FONT_LIST[i].category;
    }
    return "'" + name + "', sans-serif";
  }

  function _resolveSizes(sizes) {
    var preset = SCALE_PRESETS[sizes.scale] || SCALE_PRESETS.normal;
    return {
      base:  (sizes.base  || preset.base) + 'px',
      h1:    (sizes.h1    || preset.h1)   + 'em',
      h2:    (sizes.h2    || preset.h2)   + 'em',
      h3:    (sizes.h3    || preset.h3)   + 'em',
      body:  (sizes.body  || preset.body) + 'em',
      small: (sizes.small || preset.small)+ 'em'
    };
  }

  function _toRevealVars(theme) {
    var c = theme.colors;
    var f = theme.fonts || {};
    var s = _resolveSizes(theme.sizes || {});
    return {
      '--r-background-color':      c.bg,
      '--r-main-color':            c.text,
      '--r-heading-color':         c.heading,
      '--r-link-color':            c.accent,
      '--r-link-color-hover':      c.accent,
      '--r-selection-background-color': c.accent,
      '--r-selection-color':       c.bg,
      '--r-main-font':             _fontFamily(f.body || 'Inter'),
      '--r-heading-font':          _fontFamily(f.heading || 'Inter'),
      '--r-code-font':             _fontFamily(f.code || 'Fira Code'),
      '--r-main-font-size':        s.base,
      '--r-heading1-size':         s.h1,
      '--r-heading2-size':         s.h2,
      '--r-heading3-size':         s.h3,
      '--r-heading4-size':         s.h3,
      '--r-heading-text-transform':'none',
      '--r-heading-font-weight':   '700'
    };
  }

  function _toPanelsVars(theme) {
    var c = theme.colors;
    var f = theme.fonts || {};
    return {
      '--pn-bg':      c.bg,
      '--pn-text':    c.text,
      '--pn-heading': c.heading,
      '--pn-accent':  c.accent,
      '--pn-primary': c.accent,
      '--pn-font':    _fontFamily(f.body || 'Inter')
    };
  }

  // ── Font loader ──────────────────────────────────────────

  var _loadedFonts = {};

  function _loadFont(fontName) {
    if (!fontName || _loadedFonts[fontName]) return;
    _loadedFonts[fontName] = true;
    for (var i = 0; i < FONT_LIST.length; i++) {
      if (FONT_LIST[i].name === fontName && FONT_LIST[i].system) return;
    }
    var encoded = encodeURIComponent(fontName);
    var href = 'https://fonts.googleapis.com/css2?family=' + encoded + ':wght@400;600;700&display=swap';
    var existing = document.querySelector('link[href="' + href + '"]');
    if (existing) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
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

        var ff = (theme.fonts && theme.fonts.heading) || '';
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
          '<div class="cf-theme-card-label" style="background:' + bg + ';color:' + text + '">' + theme.name +
            (ff && ff !== 'Inter' ? ' <span style="opacity:.5;font-size:.6rem">' + ff + '</span>' : '') +
          '</div>';

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

  function _fontDropdownHtml(prefix, key, label, val) {
    var opts = '';
    var groups = { 'sans-serif': [], 'serif': [], 'monospace': [] };
    for (var i = 0; i < FONT_LIST.length; i++) {
      var f = FONT_LIST[i];
      if (!groups[f.category]) groups[f.category] = [];
      groups[f.category].push(f.name);
    }
    var labels = { 'sans-serif': 'Sans-serif', 'serif': 'Serif', 'monospace': 'Monospace' };
    var cats = ['sans-serif', 'serif', 'monospace'];
    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      opts += '<optgroup label="' + labels[cat] + '">';
      for (var j = 0; j < groups[cat].length; j++) {
        var n = groups[cat][j];
        opts += '<option value="' + n + '"' + (n === val ? ' selected' : '') + '>' + n + '</option>';
      }
      opts += '</optgroup>';
    }
    return (
      '<div class="cf-color-row">' +
        '<label>' + label + '</label>' +
        '<select id="' + prefix + 'font-' + key + '" style="flex:1;font-size:0.82rem;padding:0.35rem 0.5rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-primary)">' +
          opts +
        '</select>' +
      '</div>'
    );
  }

  function _scaleRadioHtml(prefix, value, label, currentSizes) {
    var checked = (currentSizes && currentSizes.scale === value) || (!currentSizes && value === 'normal');
    return (
      '<label style="display:flex;align-items:center;gap:0.3rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer">' +
        '<input type="radio" name="' + prefix + 'scale" value="' + value + '"' + (checked ? ' checked' : '') + '>' +
        label +
      '</label>'
    );
  }

  function _sizeInputHtml(prefix, key, label, placeholder) {
    return (
      '<div class="cf-color-row" style="margin-bottom:0.35rem">' +
        '<label style="width:50px">' + label + '</label>' +
        '<input type="number" id="' + prefix + 'size-' + key + '" step="0.1" min="0.1" placeholder="' + placeholder + '" style="flex:1;font-size:0.82rem;padding:0.3rem 0.5rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-primary)">' +
      '</div>'
    );
  }

  function renderCreator(container, opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'tc-';
    var editName = opts.editingName || null;
    var existing = editName ? getThemeByName(editName) : null;
    var ec = existing ? existing.colors : null;
    var ef = existing ? existing.fonts : null;
    var es = existing ? existing.sizes : null;
    var preset = SCALE_PRESETS[(es && es.scale) || 'normal'];

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
        '<div style="margin-top:1rem;margin-bottom:0.75rem">' +
          '<label style="font-size:0.82rem;font-weight:600;color:var(--text-primary);display:block;margin-bottom:0.5rem">Fontes</label>' +
          _fontDropdownHtml(prefix, 'heading', 'Titulo', ef ? ef.heading : 'Inter') +
          _fontDropdownHtml(prefix, 'body', 'Texto', ef ? ef.body : 'Inter') +
          _fontDropdownHtml(prefix, 'code', 'Codigo', ef ? ef.code : 'Fira Code') +
        '</div>' +
        '<div style="margin-bottom:0.75rem">' +
          '<label style="font-size:0.82rem;font-weight:600;color:var(--text-primary);display:block;margin-bottom:0.5rem">Escala</label>' +
          '<div style="display:flex;gap:0.75rem;margin-bottom:0.5rem">' +
            _scaleRadioHtml(prefix, 'compact', 'Compacto', es) +
            _scaleRadioHtml(prefix, 'normal', 'Normal', es) +
            _scaleRadioHtml(prefix, 'spacious', 'Espacoso', es) +
          '</div>' +
          '<button type="button" id="' + prefix + 'adv-toggle" style="background:none;border:none;color:var(--primary);font-size:0.78rem;cursor:pointer;padding:0;font-family:inherit">Avancado &#9656;</button>' +
          '<div id="' + prefix + 'adv-sizes" hidden style="margin-top:0.5rem">' +
            _sizeInputHtml(prefix, 'h1', 'H1', preset.h1) +
            _sizeInputHtml(prefix, 'h2', 'H2', preset.h2) +
            _sizeInputHtml(prefix, 'h3', 'H3', preset.h3) +
            _sizeInputHtml(prefix, 'body', 'Body', preset.body) +
            _sizeInputHtml(prefix, 'small', 'Small', preset.small) +
          '</div>' +
        '</div>' +
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

    // Advanced toggle
    document.getElementById(prefix + 'adv-toggle').addEventListener('click', function() {
      var panel = document.getElementById(prefix + 'adv-sizes');
      panel.hidden = !panel.hidden;
      this.innerHTML = panel.hidden ? 'Avancado &#9656;' : 'Avancado &#9662;';
    });

    // Update advanced placeholders when scale changes
    var scaleRadios = container.querySelectorAll('input[name="' + prefix + 'scale"]');
    for (var r = 0; r < scaleRadios.length; r++) {
      scaleRadios[r].addEventListener('change', function() {
        var p = SCALE_PRESETS[this.value] || SCALE_PRESETS.normal;
        var keys = ['h1','h2','h3','body','small'];
        for (var k = 0; k < keys.length; k++) {
          var inp = document.getElementById(prefix + 'size-' + keys[k]);
          if (inp) { inp.placeholder = p[keys[k]]; inp.value = ''; }
        }
      });
    }

    // Manual save
    document.getElementById(prefix + 'manual-save').addEventListener('click', function() {
      var name = document.getElementById(prefix + 'name').value.trim();
      var errEl = document.getElementById(prefix + 'manual-error');
      errEl.textContent = '';
      if (!name) { errEl.textContent = 'Escolha um nome para o tema.'; return; }

      var scaleEl = container.querySelector('input[name="' + prefix + 'scale"]:checked');
      var sizes = { scale: scaleEl ? scaleEl.value : 'normal' };
      var sizeKeys = ['h1','h2','h3','body','small'];
      for (var sk = 0; sk < sizeKeys.length; sk++) {
        var v = parseFloat(document.getElementById(prefix + 'size-' + sizeKeys[sk]).value);
        if (v > 0) sizes[sizeKeys[sk]] = v;
      }

      var theme = {
        name: name,
        colors: {
          bg:      document.getElementById(prefix + 'color-bg').value,
          text:    document.getElementById(prefix + 'color-text').value,
          heading: document.getElementById(prefix + 'color-heading').value,
          accent:  document.getElementById(prefix + 'color-accent').value
        },
        fonts: {
          heading: document.getElementById(prefix + 'font-heading').value,
          body:    document.getElementById(prefix + 'font-body').value,
          code:    document.getElementById(prefix + 'font-code').value
        },
        sizes: sizes
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
          colors: {
            bg:      ov['--r-background-color'] || '#191919',
            text:    ov['--r-main-color']       || '#ffffff',
            heading: ov['--r-heading-color']    || '#ffffff',
            accent:  ov['--r-link-color']       || '#42affa'
          },
          fonts: { heading: 'Inter', body: 'Inter', code: 'Fira Code' },
          sizes: { scale: 'normal' }
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

  // ── Theme application ──────────────────────────────────────

  function applyTheme(name, engine) {
    engine = engine || 'reveal';
    var theme = getThemeByName(name);
    if (!theme) return;

    var f = theme.fonts || {};
    _loadFont(f.heading);
    _loadFont(f.body);
    _loadFont(f.code);

    if (engine === 'reveal') {
      var revealThemeLink = document.getElementById('reveal-theme');
      if (revealThemeLink) revealThemeLink.href = '';
      var vars = _toRevealVars(theme);
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
        PanelsTheme.applyVars(_toPanelsVars(theme));
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
    SCALE_PRESETS: SCALE_PRESETS,
    FONT_LIST: FONT_LIST,
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
    applyTheme: applyTheme,
    initTheme: initTheme,
    resolveTheme: resolveTheme
  };

})();
