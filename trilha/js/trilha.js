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
    // Theme is initialized in <head> (initPublic) and wired by <pensoia-header>.
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

      document.getElementById('tr-loading').hidden = true;
      document.getElementById('tr-main').hidden = false;

      var titleEl = document.getElementById('tr-turma-title');
      if (titleEl) titleEl.textContent = data.turma.display_name || data.turma.name || _turmaSlug;

      var eyebrowEl = document.getElementById('tr-hero-eyebrow');
      if (eyebrowEl && data.client) {
        eyebrowEl.textContent = data.client.display_name || data.client.name || '';
      }

      // Update browser title with turma name for nicer tab labels.
      var turmaTitle = data.turma.display_name || data.turma.name;
      if (turmaTitle) document.title = turmaTitle + ' · PensoIA';

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
      var tagsHtml = (item.tags && item.tags.length)
        ? '<div class="tr-item-tags">' + item.tags.map(function(label) {
            return '<span class="tr-tag-mini">' + _esc(label) + '</span>';
          }).join('') + '</div>'
        : '';

      row.innerHTML =
        '<div class="tr-item-header" role="button" tabindex="0" aria-expanded="false">' +
          '<span class="tr-item-icon"></span>' +
          '<div class="tr-item-meta">' +
            '<div class="tr-item-title">' + _esc(item.title) + '</div>' +
            summary +
            tagsHtml +
          '</div>' +
          '<button class="tr-copy-btn" type="button" title="Copiar conteúdo" aria-label="Copiar conteúdo">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
              '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
            '</svg>' +
            '<span class="tr-copy-btn-label">Copiar</span>' +
          '</button>' +
          '<span class="tr-item-chevron">&#8250;</span>' +
        '</div>' +
        '<div class="tr-item-body" hidden></div>';

      // Icon comes from the worker (joined with ct_types). Falls back to a
      // generic page glyph if the type was deleted or has no icon set.
      row.querySelector('.tr-item-icon').textContent = item.type_icon || '📄';

      var headerEl = row.querySelector('.tr-item-header');
      var bodyEl   = row.querySelector('.tr-item-body');
      var copyBtn  = row.querySelector('.tr-copy-btn');

      headerEl.addEventListener('click', function(e) {
        if (e.target.closest('.tr-copy-btn')) return; // copy click handled separately
        _toggleItem(row, item, headerEl, bodyEl);
      });
      headerEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('.tr-copy-btn')) return;
          e.preventDefault();
          _toggleItem(row, item, headerEl, bodyEl);
        }
      });

      copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        _copyItemBody(item, copyBtn);
      });

      listEl.appendChild(row);
    });
  }

  async function _copyItemBody(item, btn) {
    var labelEl = btn.querySelector('.tr-copy-btn-label');
    var prevLabel = labelEl ? labelEl.textContent : '';
    btn.disabled = true;
    if (labelEl) labelEl.textContent = '...';
    try {
      var data = await callWorker({
        action:      'ct_get_item_public',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        token:       _token,
        item_id:     item.id,
        _silent: true
      });
      var md = (data && data.item && data.item.body_md) || '';
      await _copyToClipboard(md);
      if (labelEl) labelEl.textContent = 'Copiado!';
    } catch (e) {
      if (labelEl) labelEl.textContent = 'Erro';
    } finally {
      setTimeout(function() {
        if (labelEl) labelEl.textContent = prevLabel;
        btn.disabled = false;
      }, 1600);
    }
  }

  function _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      resolve();
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
    document.getElementById('tr-loading').hidden = true;
    var errorEl = document.getElementById('tr-error');
    errorEl.hidden = false;
    var msgEl = errorEl.querySelector('.tr-error-msg');
    if (msgEl) {
      msgEl.textContent = code === 'link_invalid'
        ? 'Link inválido ou expirado. Verifique o endereço com seu professor(a).'
        : 'Erro ao carregar o conteúdo. Tente novamente em instantes.';
    }
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
