'use strict';

// ============================================================
// Backstage Topbar (shared module)
// Generates topbar DOM, wires theme toggle, logout, settings.
// Portal mode assumes globals: ThemeManager, SettingsDrawer, BS_AUTH
// Presentation mode assumes globals: ThemeManager, SettingsDrawer (no BS_AUTH)
// Usage: Topbar.init({ title?, subtitle?, backLink?, sections?, container?, mode?, tabs?, subTabs? })
// tabs: optional [{ label, href, active?, dot? }] — Codex hub main tab strip
// between the brand and icon buttons. Each page that joins the hub passes the
// same tabs array with its own `active` flag set.
// subTabs: optional [{ label, href, active? }] — Bundle F hybrid nested row.
// When non-empty, a thin 30px row appears INSIDE the topbar chassis, beneath
// the main row. The sub-row hides itself when subTabs is empty or omitted.
// ============================================================

window.Topbar = (function() {

  var BACK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

  var GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  var _inner = null;
  var _itemsAnchor = null;
  var _tabsByKey = {};
  var _liveSessionTimer = null;

  // ── Auto-hide (presentation mode only) ────────────────────

  var TRIGGER_ZONE = 80;
  var HIDE_DELAY = 1500;
  var _header = null;
  var _hideTimer = null;
  var _visible = false;
  var _mouseOverBar = false;

  function _show() {
    if (!_header) return;
    clearTimeout(_hideTimer);
    _header.classList.add('bs-topbar--visible');
    _visible = true;
  }

  function _hide() {
    if (!_header || _mouseOverBar) return;
    _header.classList.remove('bs-topbar--visible');
    _visible = false;
  }

  function _scheduleHide() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(_hide, HIDE_DELAY);
  }

  function _onMouseMove(e) {
    if (_mouseOverBar) return;
    if (e.clientY <= TRIGGER_ZONE) {
      _show();
      _scheduleHide();
    }
  }

  function _onKeyDown(e) {
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (_visible) { _hide(); } else { _show(); _scheduleHide(); }
    }
  }

  // ── Init ──────────────────────────────────────────────────

  function init(opts) {
    opts = opts || {};
    var mode = opts.mode || 'portal';
    var isPresentation = mode === 'presentation';
    var title = opts.title || 'Backstage';
    var subtitle = opts.subtitle || '';
    var backLink = opts.backLink || '';
    var sections = opts.sections || [];
    var tabs = opts.tabs || [];
    var subTabs = opts.subTabs || [];
    var container = opts.container || document.querySelector('.bs-app') || document.body;

    // Build header
    var header = document.createElement('header');
    header.className = 'bs-topbar';
    if (isPresentation) header.classList.add('bs-topbar--presentation');

    _inner = document.createElement('div');
    _inner.className = 'bs-topbar-inner';
    if (tabs.length > 0) _inner.classList.add('bs-topbar-inner--with-tabs');

    // Back arrow (portal sub-pages only)
    if (backLink && !isPresentation) {
      var back = document.createElement('a');
      back.href = backLink;
      back.className = 'bs-topbar-back';
      back.setAttribute('aria-label', 'Voltar');
      back.innerHTML = BACK_SVG;
      _inner.appendChild(back);
    }

    // Full glyph-wordmark (PensoIA lockup) + page-specific suffix. Two theme
    // variants of the wordmark in DOM, CSS hides one based on data-theme. Suffix
    // is just the distinguishing part of the product name (PensoCodex -> Codex,
    // PensoNexo -> Nexo). Non-Penso products show their full name.
    var brand = document.createElement('a');
    brand.href = backLink || 'https://pensoia.com';
    brand.className = 'bs-topbar-logo';
    brand.setAttribute('aria-label', 'PensoIA — ' + (subtitle || title));

    var displayName = subtitle || title;
    var suffix;
    if (displayName.indexOf('Penso') === 0) {
      // Wordmark already says "PensoIA"; show only the differentiator.
      suffix = displayName.slice(5);  // "PensoCodex" -> "Codex"
    } else {
      // Non-Penso product (ClassForge, TypeDrill); show the full name beside
      // the brand wordmark.
      suffix = displayName;
    }

    var wmLight = document.createElement('span');
    wmLight.className = 'bs-topbar-logo-light bs-topbar-mark';
    wmLight.setAttribute('aria-hidden', 'true');
    if (window.glyphWordmark && window.stdColors) {
      wmLight.innerHTML = window.glyphWordmark(window.stdColors('white'));
    }
    brand.appendChild(wmLight);

    var wmDark = document.createElement('span');
    wmDark.className = 'bs-topbar-logo-dark bs-topbar-mark';
    wmDark.setAttribute('aria-hidden', 'true');
    if (window.glyphWordmark && window.stdColors) {
      wmDark.innerHTML = window.glyphWordmark(window.stdColors('navy'));
    }
    brand.appendChild(wmDark);

    if (suffix) {
      var suffixEl = document.createElement('span');
      suffixEl.className = 'bs-topbar-name';
      suffixEl.textContent = suffix;
      brand.appendChild(suffixEl);
    }

    _inner.appendChild(brand);

    // Codex hub tabs (between brand and spacer)
    _tabsByKey = {};
    if (tabs.length > 0) {
      var tabStrip = document.createElement('nav');
      tabStrip.className = 'bs-topbar-tabs';
      tabStrip.setAttribute('role', 'tablist');
      tabStrip.setAttribute('aria-label', 'PensoCodex');
      tabs.forEach(function(t) {
        var a = document.createElement('a');
        a.className = 'bs-topbar-tab' + (t.active ? ' active' : '');
        a.href = t.href || '#';
        a.setAttribute('role', 'tab');
        if (t.active) a.setAttribute('aria-current', 'page');
        var labelSpan = document.createElement('span');
        labelSpan.className = 'bs-topbar-tab-label';
        labelSpan.textContent = t.label;
        a.appendChild(labelSpan);
        // Always pre-create the dot for keyed tabs; CSS keeps it hidden until
        // a .live class lights it up (e.g. live-session indicator on Perguntas).
        if (t.key) {
          var dotSpan = document.createElement('span');
          dotSpan.className = 'bs-topbar-tab-dot';
          if (t.dot) dotSpan.classList.add('live');
          dotSpan.setAttribute('aria-hidden', 'true');
          a.appendChild(dotSpan);
          _tabsByKey[t.key] = { link: a, dot: dotSpan };
        }
        tabStrip.appendChild(a);
      });
      _inner.appendChild(tabStrip);
    }

    // Spacer
    var spacer = document.createElement('div');
    spacer.className = 'bs-topbar-spacer';
    _inner.appendChild(spacer);

    // Theme toggle
    var themeBtn = document.createElement('button');
    themeBtn.className = 'bs-icon-btn theme-toggle';
    themeBtn.id = 'themeToggle';
    themeBtn.setAttribute('aria-label', 'Alternar tema');
    themeBtn.setAttribute('aria-pressed', 'false');
    var themeIcon = document.createElement('span');
    themeIcon.id = 'themeIcon';
    themeBtn.appendChild(themeIcon);
    _inner.appendChild(themeBtn);

    // Custom items insert before theme toggle
    _itemsAnchor = themeBtn;

    // Settings gear
    var settingsBtn = document.createElement('button');
    settingsBtn.className = 'bs-icon-btn';
    settingsBtn.id = 'settings-btn';
    settingsBtn.setAttribute('aria-label', 'Configurações');
    settingsBtn.title = 'Configurações';
    settingsBtn.innerHTML = GEAR_SVG;
    _inner.appendChild(settingsBtn);

    // Logout (portal only)
    if (!isPresentation) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'bs-logout-btn';
      logoutBtn.id = 'logout-btn';
      logoutBtn.textContent = 'Sair';
      logoutBtn.addEventListener('click', BS_AUTH.logout);
      _inner.appendChild(logoutBtn);
    }

    header.appendChild(_inner);

    // Bundle F hybrid: optional sub-row inside the same chassis. Empty
    // subTabs leaves the row out of the DOM so the topbar collapses to 64px.
    if (subTabs.length > 0) {
      var subRow = document.createElement('div');
      subRow.className = 'bs-topbar-subrow';
      var subStrip = document.createElement('nav');
      subStrip.className = 'bs-topbar-subtabs';
      subStrip.setAttribute('role', 'tablist');
      subStrip.setAttribute('aria-label', subTabs[0] && subTabs[0]._ariaLabel || 'Sub-navegação');
      subTabs.forEach(function(t) {
        if (!t || t._ariaLabel) return; // skip metadata marker, if any
        var a = document.createElement('a');
        a.className = 'bs-topbar-subtab' + (t.active ? ' active' : '');
        a.href = t.href || '#';
        a.setAttribute('role', 'tab');
        if (t.active) a.setAttribute('aria-current', 'page');
        a.textContent = t.label;
        subStrip.appendChild(a);
      });
      subRow.appendChild(subStrip);
      header.appendChild(subRow);
    }

    // Insert into DOM
    container.insertBefore(header, container.firstChild);

    // Prevent click-through to presentation engines
    if (isPresentation) {
      header.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Wire theme
    ThemeManager.init({ storageKey: 'bs_theme' });
    ThemeManager.applyTheme(localStorage.getItem('bs_theme') || 'dark');

    // Wire settings drawer
    SettingsDrawer.init({ sections: sections });

    // Prevent click-through on drawer/overlay in presentation mode
    if (isPresentation) {
      var overlay = document.getElementById('settings-overlay');
      var drawer = document.getElementById('settings-drawer');
      if (overlay) overlay.addEventListener('click', function(e) { e.stopPropagation(); });
      if (drawer) drawer.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Presentation auto-hide
    if (isPresentation) {
      _header = header;
      _hide();
      document.addEventListener('mousemove', _onMouseMove);
      document.addEventListener('keydown', _onKeyDown);
      header.addEventListener('mouseenter', function() {
        _mouseOverBar = true;
        clearTimeout(_hideTimer);
      });
      header.addEventListener('mouseleave', function() {
        _mouseOverBar = false;
        _scheduleHide();
      });
    }

    // Codex hub pages all get a global live-session indicator on Perguntas.
    if (!isPresentation && _tabsByKey.perguntas) {
      startLiveSessionPoll();
    }
  }

  // ── addItem ───────────────────────────────────────────────

  function addItem(item) {
    if (!_inner || !_itemsAnchor) return;
    var el;
    if (item.href) {
      el = document.createElement('a');
      el.href = item.href;
      if (item.href.startsWith('http')) {
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }
    } else {
      el = document.createElement('button');
    }
    el.className = item.icon ? 'bs-icon-btn' : 'bs-topbar-item';
    if (item.id) el.id = item.id;
    if (item.title) el.title = item.title;
    if (item.icon) el.innerHTML = item.icon;
    if (item.label && !item.icon) el.textContent = item.label;
    if (item.onClick) el.addEventListener('click', item.onClick);
    _inner.insertBefore(el, _itemsAnchor);
    return el;
  }

  function setSubtitle(text) {
    var el = document.querySelector('.bs-topbar-name');
    if (el) el.textContent = text;
  }

  // ── Codex hub tabs (canonical definition) ─────────────────
  // Bundle F: 4 main tabs after Nexo (codename) was absorbed into Perguntas
  // and Liberações was folded into Turmas (three-column layout, Bundle G).
  //   - Aula     → ClassVault (the launcher used in class)
  //   - Conteúdo → ClassTrail admin (Conteúdo/Apostila/Tarefas/Drive/Presets sub-tabs)
  //   - Turmas   → ClassTrail Turmas tab (becomes three-column in Bundle G)
  //   - Perguntas → ClassPulse (Ao vivo/Banco/Estatísticas/Configurações sub-tabs)
  var CODEX_TABS = [
    { key: 'aula',      label: 'Aula',      href: '/backstage/classvault/' },
    { key: 'conteudo',  label: 'Conteúdo',  href: '/backstage/classtrail/?tab=conteudo' },
    { key: 'turmas',    label: 'Turmas',    href: '/backstage/classtrail/?tab=turmas' },
    { key: 'perguntas', label: 'Perguntas', href: '/backstage/classpulse/' }
  ];

  // Sub-tabs per main tab. Aula and Turmas have none → topbar collapses to
  // 64px on those pages. Drive and Presets are routing-only stubs until
  // Bundle I; the destination page paints a "Em breve" placeholder.
  var CODEX_SUBTABS = {
    aula: [],
    conteudo: [
      { key: 'conteudo',   label: 'Items',      href: '/backstage/classtrail/?tab=conteudo' },
      { key: 'apostila',   label: 'Apostila',   href: '/backstage/classtrail/?tab=apostila' },
      { key: 'tarefas',    label: 'Tarefas',    href: '/backstage/classtrail/?tab=tarefas' },
      { key: 'drive',      label: 'Drive',      href: '/backstage/classtrail/?tab=drive' },
      { key: 'presets',    label: 'Presets',    href: '/backstage/classtrail/?tab=presets' },
      { key: 'liberacoes', label: 'Liberações', href: '/backstage/classtrail/?tab=liberacoes' }
    ],
    turmas: [],
    // Bundle L L.1: "Ao vivo" renamed to "Sessões" (key stays 'ao-vivo' for URL
    // back-compat). The Live sub-tab is NOT in the static array; it is
    // appended at render time by renderSubTabsInto / codexSubTabs when body
    // has the cp-session-open class (set by host.html on load and by the
    // index.html session-click path).
    perguntas: [
      { key: 'ao-vivo',        label: 'Sessões',        href: '/backstage/classpulse/' },
      { key: 'banco',          label: 'Banco',          href: '/backstage/classpulse/?tab=banks' },
      { key: 'estatisticas',   label: 'Estatísticas',   href: '/backstage/classpulse/?tab=global-stats' }
    ]
  };

  function codexTabs(activeKey, overrides) {
    overrides = overrides || {};
    return CODEX_TABS.map(function(t) {
      var entry = { key: t.key, label: t.label, href: t.href };
      if (t.key === activeKey) entry.active = true;
      if (overrides[t.key]) {
        if (overrides[t.key].dot) entry.dot = true;
      }
      return entry;
    });
  }

  // Toggles the live indicator dot on a tab created via codexTabs(). Used by
  // the live-session poll, but exposed so other future indicators (unread
  // counts, errors) can target a tab by key without re-implementing the lookup.
  function setTabDot(key, on) {
    var ref = _tabsByKey[key];
    if (!ref || !ref.dot) return;
    ref.dot.classList.toggle('live', !!on);
  }

  // Backstage-wide live-session indicator: polls cp_get_live_session and
  // toggles the Perguntas tab's red dot. Auto-started by init() when the
  // tabs include a 'perguntas' entry; safe to call explicitly otherwise.
  function startLiveSessionPoll() {
    if (_liveSessionTimer) return;
    if (typeof callWorker !== 'function' || typeof BS_AUTH === 'undefined') return;
    if (!_tabsByKey.perguntas) return;
    var poll = function() {
      callWorker({ action: 'cp_get_live_session', auth_token: BS_AUTH.TOKEN })
        .then(function(res) { setTabDot('perguntas', !!(res && res.session)); })
        .catch(function() {});
    };
    poll();
    _liveSessionTimer = setInterval(poll, 30000);
  }

  // Bundle L L.1: the Perguntas Live sub-tab is conditional — it only appears
  // when there is an active session in this browser tab. Source of truth is
  // sessionStorage['cp_active_session_code'], set by host.html on load (and
  // cleared by BS_AUTH.signOut). We append the entry at render time so the
  // topbar reflects current state without relying on CSS :not() selectors
  // (which proved fragile across cached HTML and theme overrides).
  function _activeSessionCode() {
    try { return sessionStorage.getItem('cp_active_session_code') || ''; } catch (_) { return ''; }
  }

  function _withLiveEntry(parentKey) {
    var rows = (CODEX_SUBTABS[parentKey] || []).slice();
    if (parentKey === 'perguntas') {
      var code = _activeSessionCode();
      if (code) {
        rows.splice(1, 0, {
          key: 'live',
          label: 'Live',
          href: '/backstage/classpulse/host.html?code=' + encodeURIComponent(code)
        });
      }
    }
    return rows;
  }

  function codexSubTabs(parentKey, activeSubKey) {
    return _withLiveEntry(parentKey).map(function(t) {
      var entry = { label: t.label, href: t.href };
      if (t.key === activeSubKey) entry.active = true;
      return entry;
    });
  }

  // Render the sub-tabs for a parent Codex key as inline links into an arbitrary
  // container element (live bar, page header, etc.). Lets pages absorb the
  // 30px sub-row into their own chrome instead of stacking another row.
  function renderSubTabsInto(containerEl, parentKey, activeSubKey) {
    if (!containerEl) return;
    var rows = _withLiveEntry(parentKey);
    containerEl.innerHTML = '';
    rows.forEach(function(t) {
      var a = document.createElement('a');
      a.className = 'bs-topbar-subtab' + (t.key === activeSubKey ? ' active' : '');
      a.href = t.href || '#';
      a.setAttribute('role', 'tab');
      if (t.key === activeSubKey) a.setAttribute('aria-current', 'page');
      a.textContent = t.label;
      containerEl.appendChild(a);
    });
  }

  return {
    init: init,
    addItem: addItem,
    setSubtitle: setSubtitle,
    codexTabs: codexTabs,
    codexSubTabs: codexSubTabs,
    setTabDot: setTabDot,
    startLiveSessionPoll: startLiveSessionPoll,
    renderSubTabsInto: renderSubTabsInto
  };

})();
