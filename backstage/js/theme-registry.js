'use strict';

// ============================================================
// Theme Registry (shared module)
// Manages Reveal.js theme data, rendering, CRUD, AI generation,
// and theme application (CSS file + variable overrides).
// Assumes globals: AIClient (for generateTheme only)
// Usage: ThemeRegistry.renderThemeGrid(container, opts)
//        ThemeRegistry.initTheme(name)
// ============================================================

window.ThemeRegistry = (function() {

  var BUILTIN_THEMES = ['black','white','league','beige','night','serif','simple','solarized','moon','dracula','sky','blood'];

  var THEME_DATA = {
    black:     { bg: '#191919', heading: '#fff',     accent: '#42affa', text: '#fff'     },
    white:     { bg: '#fff',    heading: '#222',     accent: '#2a76dd', text: '#222'     },
    league:    { bg: '#1a1a2e', heading: '#eee',     accent: '#f6c90e', text: '#eee'     },
    beige:     { bg: '#f7f2d3', heading: '#333',     accent: '#8b743d', text: '#333'     },
    night:     { bg: '#1c1e20', heading: '#eee',     accent: '#e7ad52', text: '#eee'     },
    serif:     { bg: '#f0ede0', heading: '#383d3d',  accent: '#8b4513', text: '#383d3d'  },
    simple:    { bg: '#fff',    heading: '#333',     accent: '#333',    text: '#444'     },
    solarized: { bg: '#002b36', heading: '#93a1a1',  accent: '#268bd2', text: '#657b83'  },
    moon:      { bg: '#002b36', heading: '#93a1a1',  accent: '#00bcd4', text: '#839496'  },
    dracula:   { bg: '#282a36', heading: '#f8f8f2',  accent: '#bd93f9', text: '#f8f8f2'  },
    sky:       { bg: '#add9e4', heading: '#003b4f',  accent: '#007da3', text: '#003b4f'  },
    blood:     { bg: '#2a0000', heading: '#eee',     accent: '#a23',    text: '#eee'     }
  };

  // ── Storage ───────────────────────────────────────────────

  function getCustomThemes() { return JSON.parse(localStorage.getItem('bs_custom_themes') || '[]'); }
  function saveCustomThemes(list) { localStorage.setItem('bs_custom_themes', JSON.stringify(list)); }
  function getActiveTheme() { return localStorage.getItem('bs_reveal_theme') || 'black'; }
  function setActiveTheme(name) { localStorage.setItem('bs_reveal_theme', name); }

  // ── CRUD ──────────────────────────────────────────────────

  function createCustomTheme(theme) {
    var list = getCustomThemes();
    var existIdx = list.findIndex(function(x) { return x.name === theme.name; });
    if (existIdx >= 0) list[existIdx] = theme;
    else list.push(theme);
    saveCustomThemes(list);
    return list;
  }

  function renameCustomTheme(idx, newName) {
    var list = getCustomThemes();
    if (!list[idx]) return list;
    var oldKey = 'custom:' + list[idx].name;
    var wasActive = getActiveTheme() === oldKey;
    list[idx].name = newName;
    saveCustomThemes(list);
    if (wasActive) setActiveTheme('custom:' + newName);
    return list;
  }

  function deleteCustomTheme(idx) {
    var list = getCustomThemes();
    if (!list[idx]) return list;
    var key = 'custom:' + list[idx].name;
    list.splice(idx, 1);
    saveCustomThemes(list);
    if (getActiveTheme() === key) setActiveTheme('black');
    return list;
  }

  // ── Rendering ─────────────────────────────────────────────

  function renderThemeGrid(container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var active = getActiveTheme();

    function rerender() { renderThemeGrid(container, opts); }

    BUILTIN_THEMES.forEach(function(themeName) {
      var d = THEME_DATA[themeName] || {};
      var card = document.createElement('div');
      card.className = 'cf-theme-card' + (active === themeName ? ' cf-selected' : '');
      card.dataset.value = themeName;
      card.innerHTML = '<div class="cf-theme-card-preview" style="background:' + d.bg + '">' +
        '<div class="cf-theme-card-heading" style="color:' + d.heading + '">Aa</div>' +
        '<div class="cf-theme-card-bar" style="background:' + d.accent + '"></div>' +
        '<div class="cf-theme-card-lines">' +
          '<div class="cf-theme-card-line" style="background:' + d.text + '"></div>' +
          '<div class="cf-theme-card-line" style="background:' + d.text + '"></div>' +
        '</div></div>' +
        '<div class="cf-theme-card-label" style="background:' + d.bg + ';color:' + d.text + '">' + themeName + '</div>';
      container.appendChild(card);
      card.addEventListener('click', function() {
        if (opts.onSelect) opts.onSelect(themeName);
      });
    });

    getCustomThemes().forEach(function(ct, idx) {
      var ov = ct.overrides || {};
      var bg = ov['--r-background-color'] || '#222';
      var heading = ov['--r-heading-color'] || '#fff';
      var accent = ov['--r-link-color'] || '#aaa';
      var text = ov['--r-main-color'] || '#ccc';
      var key = 'custom:' + ct.name;
      var card = document.createElement('div');
      card.className = 'cf-theme-card' + (active === key ? ' cf-selected' : '');
      card.dataset.value = key;
      card.innerHTML = '<div class="cf-theme-card-preview" style="background:' + bg + '">' +
        '<div class="cf-theme-card-heading" style="color:' + heading + '">Aa</div>' +
        '<div class="cf-theme-card-bar" style="background:' + accent + '"></div>' +
        '<div class="cf-theme-card-lines">' +
          '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
          '<div class="cf-theme-card-line" style="background:' + text + '"></div>' +
        '</div></div>' +
        '<div class="cf-theme-card-label" style="background:' + bg + ';color:' + text + '">' + ct.name + ' \u2736</div>';

      var ren = document.createElement('button');
      ren.className = 'cf-theme-card-rename';
      ren.textContent = '\u270e';
      ren.title = 'Renomear tema';
      ren.onclick = (function(capturedIdx, capturedCt) {
        return function(e) {
          e.stopPropagation();
          var newName = prompt('Novo nome para o tema:', capturedCt.name);
          if (!newName || !newName.trim()) return;
          renameCustomTheme(capturedIdx, newName.trim());
          rerender();
        };
      }(idx, ct));
      card.appendChild(ren);

      var del = document.createElement('button');
      del.className = 'cf-theme-card-delete';
      del.textContent = '\u00d7';
      del.title = 'Excluir tema';
      del.onclick = (function(capturedIdx, capturedKey) {
        return function(e) {
          e.stopPropagation();
          deleteCustomTheme(capturedIdx);
          rerender();
        };
      }(idx, key));
      card.appendChild(del);

      container.appendChild(card);
      card.addEventListener('click', function() {
        if (opts.onSelect) opts.onSelect(key);
      });
    });
  }

  // ── AI generation ─────────────────────────────────────────

  function generateTheme(description) {
    return AIClient.generate({ action: 'ai_theme', description: description }).then(function(resp) {
      if (!resp) return null;
      var theme = resp.theme;
      if (!theme || !theme.overrides) return null;
      return theme;
    });
  }

  // ── Reveal.js theme application ───────────────────────────

  function themeUrl(name) {
    return 'https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/' + name + '.css';
  }

  function setTheme(name) {
    if (BUILTIN_THEMES.indexOf(name) < 0) name = 'black';
    var el = document.getElementById('reveal-theme');
    if (el) el.href = themeUrl(name);
  }

  function applyCustomTheme(themeName) {
    var customs = getCustomThemes();
    var theme = customs.find(function(t) { return t.name === themeName; });
    if (!theme) { setTheme('black'); return; }
    setTheme(theme.base || 'black');
    var el = document.getElementById('cf-theme-overrides');
    if (!el) {
      el = document.createElement('style');
      el.id = 'cf-theme-overrides';
      document.head.appendChild(el);
    }
    var css = Object.entries(theme.overrides || {}).map(function(pair) { return pair[0] + ':' + pair[1]; }).join(';');
    el.textContent = '.reveal{' + css + '}';
  }

  function initTheme(name) {
    if (name && name.startsWith('custom:')) applyCustomTheme(name.slice(7));
    else setTheme(name || 'black');
  }

  function resolveTheme(lessonTheme) {
    var params = new URLSearchParams(location.search);
    return params.get('theme') || localStorage.getItem('bs_reveal_theme') || lessonTheme || 'black';
  }

  return {
    BUILTIN_THEMES: BUILTIN_THEMES,
    THEME_DATA: THEME_DATA,
    getCustomThemes: getCustomThemes,
    saveCustomThemes: saveCustomThemes,
    getActiveTheme: getActiveTheme,
    setActiveTheme: setActiveTheme,
    createCustomTheme: createCustomTheme,
    renameCustomTheme: renameCustomTheme,
    deleteCustomTheme: deleteCustomTheme,
    renderThemeGrid: renderThemeGrid,
    generateTheme: generateTheme,
    themeUrl: themeUrl,
    setTheme: setTheme,
    applyCustomTheme: applyCustomTheme,
    initTheme: initTheme,
    resolveTheme: resolveTheme
  };

})();
