'use strict';

(function() {

  var _params = new URLSearchParams(window.location.search);
  var _clientSlug = _params.get('c');
  var _turmaSlug  = _params.get('t');
  var _token      = _params.get('k');

  // Fallback: parse /trilha/<client>/<turma> directly (no .htaccess rewrite)
  if (!_clientSlug || !_turmaSlug) {
    var _parts = window.location.pathname.replace(/^\/trilha\/?/, '').replace(/\/$/, '').split('/');
    if (_parts.length >= 2 && _parts[0]) {
      _clientSlug = _parts[0];
      _turmaSlug  = _parts[1] || null;
    }
  }

  function init() {
    ThemeManager.initPublic({ storageKey: 'trilha_theme', defaultTheme: 'light' });

    var themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.innerHTML = ThemeManager.SVG_SUN + ThemeManager.SVG_MOON;
      ThemeManager.init({ toggleEl: themeBtn });
    }

    if (!_clientSlug || !_turmaSlug || !_token) {
      _showError('link_invalid');
      return;
    }

    _loadTurma();
  }

  async function _loadTurma() {
    try {
      var data = await callWorker({
        action: 'ct_get_turma_view',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        token:       _token,
        _silent: true
      });

      document.getElementById('tr-loading').style.display = 'none';
      document.getElementById('tr-main').style.display = 'block';

      var titleEl = document.getElementById('tr-turma-title');
      if (titleEl) titleEl.textContent = data.turma.display_name || data.turma.name || _turmaSlug;

      _renderItems(data.items || []);

    } catch (err) {
      var code = (err.data && err.data.error) ? err.data.error : 'error';
      _showError(code === 'not_found' || code === 'unauthorized' ? 'link_invalid' : 'error');
    }
  }

  function _renderItems(items) {
    var listEl = document.getElementById('tr-items-list');
    var countEl = document.getElementById('tr-section-count');
    if (!listEl) return;

    if (countEl) {
      countEl.textContent = items.length === 0
        ? ''
        : (items.length === 1 ? '1 item' : items.length + ' itens');
    }

    if (!items.length) {
      listEl.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível no momento. Volte mais tarde.</div>';
      return;
    }

    listEl.innerHTML = '';
    items.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'tr-item';

      var summary = item.summary
        ? '<div class="tr-item-summary">' + _esc(item.summary) + '</div>'
        : '';

      row.innerHTML =
        '<div class="tr-item-header" role="button" tabindex="0" aria-expanded="false">' +
          '<span class="tr-item-icon">' + _typeIcon(item.type) + '</span>' +
          '<div class="tr-item-meta">' +
            '<div class="tr-item-title">' + _esc(item.title) + '</div>' +
            summary +
          '</div>' +
          '<span class="tr-item-chevron">&#8250;</span>' +
        '</div>' +
        '<div class="tr-item-body" hidden></div>';

      var headerEl = row.querySelector('.tr-item-header');
      var bodyEl   = row.querySelector('.tr-item-body');

      headerEl.addEventListener('click', function() { _toggleItem(row, item, headerEl, bodyEl); });
      headerEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _toggleItem(row, item, headerEl, bodyEl);
        }
      });

      listEl.appendChild(row);
    });
  }

  async function _toggleItem(row, item, headerEl, bodyEl) {
    var expanded = headerEl.getAttribute('aria-expanded') === 'true';

    if (expanded) {
      headerEl.setAttribute('aria-expanded', 'false');
      bodyEl.hidden = true;
      row.classList.remove('tr-item-open');
      return;
    }

    headerEl.setAttribute('aria-expanded', 'true');
    bodyEl.hidden = false;
    row.classList.add('tr-item-open');

    if (bodyEl.dataset.loaded) return;

    bodyEl.innerHTML = '<div class="tr-item-loading">Carregando...</div>';

    try {
      var data = await callWorker({
        action:      'ct_get_item_public',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        token:       _token,
        item_id:     item.id,
        _silent: true
      });
      bodyEl.dataset.loaded = '1';
      CTRenderer.render(data.item, bodyEl, {});
    } catch (e) {
      bodyEl.innerHTML = '<div class="tr-item-error">Erro ao carregar conteúdo.</div>';
    }
  }

  function _showError(code) {
    document.getElementById('tr-loading').style.display = 'none';
    var errorEl = document.getElementById('tr-error');
    errorEl.style.display = 'block';
    var msgEl = errorEl.querySelector('.tr-error-msg');
    if (msgEl) {
      msgEl.textContent = code === 'link_invalid'
        ? 'Link inválido ou expirado. Verifique o endereço com seu professor(a).'
        : 'Erro ao carregar o conteúdo. Tente novamente em instantes.';
    }
  }

  function _typeIcon(type) {
    return type === 'prompt' ? '&#128172;' : '&#128196;';
  }

  function _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
