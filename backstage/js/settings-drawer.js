'use strict';

// ============================================================
// Backstage Settings Drawer (shared module)
// Usage: SettingsDrawer.init({ sections: [...] })
// Built-in sections: debug toggle, password change.
// Pages can inject additional sections via opts.sections.
// ============================================================

window.SettingsDrawer = (function() {

  // ── Helpers ──────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Section HTML builder ─────────────────────────────────

  function _buildSection(id, title, bodyHtml, expanded) {
    var openClass = expanded ? ' sd-section-open' : '';
    var hiddenAttr = expanded ? '' : ' hidden';
    return (
      '<div class="sd-section' + openClass + '" data-sd-section="' + _esc(id) + '">' +
        '<button class="sd-section-header" type="button">' +
          '<span>' + _esc(title) + '</span>' +
          '<span class="sd-chevron">&#9662;</span>' +
        '</button>' +
        '<div class="sd-section-body"' + hiddenAttr + '>' +
          bodyHtml +
        '</div>' +
      '</div>'
    );
  }

  // ── Built-in: Debug toggle ───────────────────────────────

  function _debugSectionHtml() {
    return (
      '<p style="font-size:.88rem;color:var(--text-primary);margin-bottom:.5rem">Painel de debug</p>' +
      '<button class="bs-toggle-btn" id="sd-debug-toggle" style="margin-bottom:.5rem">Desativado</button>' +
      '<p class="bs-hint">Exibe pill flutuante com logs em todas as páginas do Backstage.</p>'
    );
  }

  function _initDebugToggle() {
    var btn = document.getElementById('sd-debug-toggle');
    if (!btn) return;

    function sync() {
      var on = localStorage.getItem('bs_debug') === '1';
      btn.textContent = on ? 'Desativar' : 'Ativar';
      btn.style.color = on ? 'var(--primary)' : '';
      btn.style.borderColor = on ? 'var(--primary)' : '';
    }
    sync();

    btn.addEventListener('click', function() {
      var on = localStorage.getItem('bs_debug') === '1';
      localStorage.setItem('bs_debug', on ? '0' : '1');
      sync();
      if (!on) { if (window.bsDebugMount) window.bsDebugMount(); }
      else     { if (window.bsDebugUnmount) window.bsDebugUnmount(); }
    });
  }

  // ── Built-in: Password change ────────────────────────────

  function _pwSectionHtml() {
    return (
      '<button class="bs-toggle-btn" id="sd-show-pw-form">Alterar senha</button>' +
      '<div id="sd-pw-form" hidden>' +
        '<div class="bs-field" style="margin-top:1rem">' +
          '<label>Senha atual</label>' +
          '<input id="sd-pw-current" type="password" autocomplete="off">' +
        '</div>' +
        '<div class="bs-field">' +
          '<label>Nova senha</label>' +
          '<input id="sd-pw-new" type="password" autocomplete="off">' +
        '</div>' +
        '<div class="bs-field">' +
          '<label>Confirmar nova senha</label>' +
          '<input id="sd-pw-confirm" type="password" autocomplete="off">' +
        '</div>' +
        '<p class="bs-form-error" id="sd-pw-error"></p>' +
        '<button class="bs-save-btn" id="sd-pw-save">Atualizar senha</button>' +
      '</div>'
    );
  }

  function _initPwChange() {
    var showBtn = document.getElementById('sd-show-pw-form');
    if (!showBtn) return;

    showBtn.addEventListener('click', function() {
      var form = document.getElementById('sd-pw-form');
      form.hidden = !form.hidden;
      if (!form.hidden) document.getElementById('sd-pw-current').focus();
    });

    document.getElementById('sd-pw-save').addEventListener('click', async function() {
      var btn     = this;
      var cur     = document.getElementById('sd-pw-current').value;
      var newPw   = document.getElementById('sd-pw-new').value;
      var confirm = document.getElementById('sd-pw-confirm').value;
      var err     = document.getElementById('sd-pw-error');
      err.textContent = '';
      err.style.color = '';

      if (newPw.length < 6) { err.textContent = 'A senha deve ter pelo menos 6 caracteres.'; return; }
      if (newPw !== confirm) { err.textContent = 'As senhas não coincidem.'; return; }

      btn.disabled = true;
      try {
        var curHash = await hashPw(cur);
        var newHash = await hashPw(newPw);
        await callWorker({ action: 'change_password', auth_token: curHash, new_hash: newHash });
        localStorage.setItem(window.BS_AUTH ? BS_AUTH.PW_KEY : 'bs_pw_hash', newHash);
        document.getElementById('sd-pw-current').value = '';
        document.getElementById('sd-pw-new').value = '';
        document.getElementById('sd-pw-confirm').value = '';
        err.style.color = 'var(--primary)';
        err.textContent = 'Senha alterada com sucesso.';
        setTimeout(function() {
          err.textContent = '';
          err.style.color = '';
          document.getElementById('sd-pw-form').hidden = true;
        }, 2500);
      } catch (e) {
        err.textContent = 'Senha atual incorreta.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Built-in: Google account ─────────────────────────────
  //
  // Bundle Q follow-up: the topbar G dot was removed (the inline connect
  // prompts on Drive features make passive status unnecessary). This section
  // is the deliberate, find-it-when-you-need-it entry point: shows current
  // state and a single Conectar/Desconectar button.

  function _googleSectionHtml() {
    return (
      '<div id="sd-google-state" style="margin-bottom:.6rem;font-size:.92rem"></div>' +
      '<button class="bs-toggle-btn" id="sd-google-action" style="margin-bottom:.5rem"></button>' +
      '<p class="bs-hint">Conexão necessária apenas para sincronizar pastas do Drive ou ' +
      'copiar texto de documentos. Pré-visualizações usam sua sessão Google geral do navegador.</p>'
    );
  }

  function _renderGoogleSection() {
    var stateEl = document.getElementById('sd-google-state');
    var btn = document.getElementById('sd-google-action');
    if (!stateEl || !btn) return;
    var bs = window.BS_GOOGLE;
    var authed = !!(bs && bs.isAuthed && bs.isAuthed());
    if (authed) {
      var email = (bs.getEmail && bs.getEmail()) || '';
      stateEl.innerHTML = '<strong style="color:var(--primary)">Conectado</strong>' +
        (email ? '<br><span style="color:var(--text-secondary);font-size:.85rem">' + _esc(email) + '</span>' : '');
      btn.textContent = 'Desconectar';
    } else {
      stateEl.innerHTML = '<span style="color:var(--text-secondary)">Não conectado</span>';
      btn.textContent = 'Conectar Google';
    }
  }

  function _initGoogleSection() {
    var btn = document.getElementById('sd-google-action');
    if (!btn) return;
    _renderGoogleSection();
    btn.addEventListener('click', async function () {
      var bs = window.BS_GOOGLE;
      if (!bs) return;
      if (bs.isAuthed && bs.isAuthed()) {
        try { bs.signOut(); } catch (_) {}
        _renderGoogleSection();
        return;
      }
      btn.disabled = true;
      try {
        await bs.requestToken({ prompt: 'consent' });
        if (typeof bs.init === 'function') bs.init();
      } catch (_) { /* render below reflects final state */ }
      btn.disabled = false;
      _renderGoogleSection();
    });
  }

  // ── Drawer shell ─────────────────────────────────────────

  var _overlay, _drawer;
  var _onOpenCallbacks = [];

  function _injectDrawer(sectionsHtml) {
    // Overlay
    _overlay = document.createElement('div');
    _overlay.id = 'settings-overlay';
    _overlay.className = 'bs-overlay';
    _overlay.hidden = true;
    document.body.appendChild(_overlay);

    // Drawer
    _drawer = document.createElement('aside');
    _drawer.id = 'settings-drawer';
    _drawer.className = 'bs-drawer';
    _drawer.hidden = true;
    _drawer.setAttribute('aria-label', 'Configurações');
    _drawer.innerHTML =
      '<h2>' +
        '<span>Configurações</span>' +
        '<button class="bs-drawer-close" id="sd-close" aria-label="Fechar">&times;</button>' +
      '</h2>' +
      sectionsHtml;
    document.body.appendChild(_drawer);

    // Bind close
    document.getElementById('sd-close').addEventListener('click', close);
    _overlay.addEventListener('click', close);

    // Bind section toggles
    _drawer.querySelectorAll('.sd-section-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var section = header.closest('.sd-section');
        var body = section.querySelector('.sd-section-body');
        var isOpen = !body.hidden;
        body.hidden = isOpen;
        section.classList.toggle('sd-section-open', !isOpen);
      });
    });
  }

  function open() {
    _onOpenCallbacks.forEach(function(fn) { fn(); });
    _overlay.hidden = false;
    _drawer.hidden = false;
    requestAnimationFrame(function() {
      _overlay.classList.add('open');
      _drawer.classList.add('open');
    });
  }

  function close() {
    _overlay.classList.remove('open');
    _drawer.classList.remove('open');
    setTimeout(function() {
      _overlay.hidden = true;
      _drawer.hidden = true;
    }, 300);
  }

  // ── CSS (injected once) ──────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('sd-styles')) return;
    var style = document.createElement('style');
    style.id = 'sd-styles';
    style.textContent =
      '.sd-section { border-bottom: 1px solid var(--border); }' +
      '.sd-section:last-child { border-bottom: none; }' +
      '.sd-section-header {' +
        'display: flex; align-items: center; justify-content: space-between;' +
        'width: 100%; background: none; border: none; padding: 0.85rem 0;' +
        'font-family: inherit; font-size: 0.82rem; font-weight: 700;' +
        'text-transform: uppercase; letter-spacing: 0.06em;' +
        'color: var(--text-secondary); cursor: pointer;' +
      '}' +
      '.sd-section-header:hover { color: var(--text-primary); }' +
      '.sd-chevron {' +
        'transition: transform 0.2s; font-size: 0.7rem;' +
      '}' +
      '.sd-section-open .sd-chevron { transform: rotate(180deg); }' +
      '.sd-section-body { padding: 0 0 1rem; }';
    document.head.appendChild(style);
  }

  // ── Public: init ─────────────────────────────────────────

  function init(opts) {
    opts = opts || {};
    var customSections = opts.sections || [];

    _injectStyles();

    // Build sections HTML: custom first, then built-in
    var html = '';

    for (var i = 0; i < customSections.length; i++) {
      var s = customSections[i];
      html += _buildSection(s.id, s.title, s.content || '', s.expanded === true);
    }

    // Built-in: Google account (only if BS_GOOGLE is loaded on this page)
    if (typeof window.BS_GOOGLE !== 'undefined') {
      html += _buildSection('sd-google', 'Conta Google', _googleSectionHtml(), false);
    }

    // Built-in: debug
    html += _buildSection('sd-debug', 'Desenvolvedor', _debugSectionHtml(), false);

    // Built-in: password (only if auth module is loaded or we're on the portal page)
    if (typeof callWorker === 'function') {
      html += _buildSection('sd-security', 'Segurança', _pwSectionHtml(), false);
    }

    _injectDrawer(html);
    _initGoogleSection();
    _initDebugToggle();
    _initPwChange();
    // Re-render the Google section each time the drawer opens, so it reflects
    // any state change (e.g. user just connected via an inline Drive prompt).
    if (typeof window.BS_GOOGLE !== 'undefined') {
      _onOpenCallbacks.push(_renderGoogleSection);
    }

    // Init custom section callbacks
    for (var j = 0; j < customSections.length; j++) {
      if (typeof customSections[j].onInit === 'function') {
        customSections[j].onInit();
      }
      if (typeof customSections[j].onOpen === 'function') {
        _onOpenCallbacks.push(customSections[j].onOpen);
      }
    }

    // Bind to settings button (must exist in the page's topbar)
    var settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', open);
    }
  }

  return { init: init, open: open, close: close };

})();
