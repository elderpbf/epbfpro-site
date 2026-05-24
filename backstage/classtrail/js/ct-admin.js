'use strict';

window.CT_ADMIN = (function() {

  // ---- State ----
  var _clients = [];
  var _selectedClientSlug = null;
  var _turmas = [];
  var _items = [];
  var _types = []; // [{slug, label, icon, sort_order}]
  var _tags  = []; // [{id, label, item_count}]
  var _selectedTypeFilter = null; // null = "Todos"
  var _selectMode = false;
  var _selectedIds = new Set();
  var _relAllItems = [];           // items pulled from ct_list_items
  var _relReleased = [];           // ordered array of released item IDs
  var _relClientSlug = null;
  var _relTurmaSlug = null;
  var _relAulas = [];              // aulas for current turma in releases view
  var _relReleasedMeta = {};       // {item_id: {aula_number}} for the current turma
  var _turmaAulas = [];            // aulas for the turma shown in column 3 (Aulas)
  var _selectedReleaseFilter = null;
  var _cpSessions = [];            // [{id, name}] from cp_list_sessions
  var _apostilaSet  = null;        // current ct_item_sets row or null
  var _apostilaItems = [];         // items in set_position order

  // ---- Helpers ----

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _slugify(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }

  // Thin alias over the shared BSToast.show (Site/backstage/js/bs-toast.js).
  // Kept local because ~80 callsites in this file use `_toast(...)`.
  function _toast(msg, duration) {
    if (window.BSToast && window.BSToast.show) window.BSToast.show(msg, duration);
  }

  function _baseUrl() {
    return location.protocol + '//' + location.host;
  }

  // ---- Type / tag helpers ----

  var TYPE_ICON_FALLBACK = {
    prompt: '💬',
    exemplo: '✨',
    exercicio: '📝',
    dica: '💡',
    leitura: '📖',
    video: '🎬',
    link: '🔗'
  };

  function _typeMeta(slug) {
    var t = _types.find(function(x) { return x.slug === slug; });
    if (t) return { label: t.label, icon: t.icon || TYPE_ICON_FALLBACK[slug] || '📄' };
    return { label: slug || 'item', icon: TYPE_ICON_FALLBACK[slug] || '📄' };
  }

  function _turmaUrl(clientSlug, turmaSlug, token) {
    return _baseUrl() + '/trilha/' + clientSlug + '/' + turmaSlug + '?k=' + token;
  }

  // ---- Modal helpers ----

  function _openModal(html, opts) {
    opts = opts || {};
    var bd = document.createElement('div');
    bd.className = 'ct-modal-backdrop';
    bd.innerHTML = html;

    if (!opts.disableBackdropClose) {
      bd.addEventListener('click', function(e) {
        if (e.target === bd) bd.parentNode.removeChild(bd);
      });
    }

    var escHandler = function(e) {
      if (e.key === 'Escape') {
        if (bd.parentNode) bd.parentNode.removeChild(bd);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(bd);
    var firstInput = bd.querySelector('input,textarea,select');
    if (firstInput) setTimeout(function() { firstInput.focus(); }, 60);
    return bd;
  }

  function _closeModal() {
    var bd = document.querySelector('.ct-modal-backdrop');
    if (bd) bd.parentNode.removeChild(bd);
  }

  // ---- Clients ----

  function _loadClients() {
    callWorker({ action: 'ct_list_clients' }).then(function(data) {
      _clients = data.clients || [];
      _renderClients();
      // Pre-select the first non-archived client (fallback to any) so the page
      // is never empty on first load. Respect _selectedClientSlug if it was
      // already restored (e.g., from localStorage or a deep link).
      if (!_selectedClientSlug && _clients.length) {
        var firstActive = _clients.find(function(c) { return c.status !== 'archived'; }) || _clients[0];
        if (firstActive) _selectClient(firstActive.slug);
      }
    }).catch(function() {
      document.getElementById('clients-list').innerHTML = '<div class="ct-empty">Erro ao carregar clientes.</div>';
    });
  }

  function _renderClients() {
    var el = document.getElementById('clients-list');
    if (!_clients.length) {
      el.innerHTML = '<div class="ct-empty">Nenhum cliente cadastrado.</div>';
      return;
    }
    el.innerHTML = _clients.map(function(c) {
      var sel = c.slug === _selectedClientSlug ? ' selected' : '';
      var archived = c.status === 'archived' ? ' <span class="ct-badge archived">Arquivado</span>' : '';
      var iconHtml = '';
      if (c.icon_path) {
        var iconSrc = c.icon_path.startsWith('http') ? c.icon_path : WORKER_URL + '/r2/' + c.icon_path;
        iconHtml = '<img class="ct-icon-preview" src="' + _esc(iconSrc) + '" alt="">';
      }
      return '<div class="ct-card' + sel + '" data-slug="' + _esc(c.slug) + '">' +
        '<div class="ct-card-name">' + iconHtml + _esc(c.display_name || c.name) + archived + '</div>' +
        '<div class="ct-card-meta">' + _esc(c.slug) + '</div>' +
        '<div class="ct-card-actions">' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.editClient(\'' + _esc(c.slug) + '\')">Editar</button>' +
          (c.status !== 'archived' ? '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="CT_ADMIN.archiveClient(\'' + _esc(c.slug) + '\')">Arquivar</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.ct-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'IMG') return;
        _selectClient(card.dataset.slug);
      });
    });
  }

  function _selectClient(slug) {
    _selectedClientSlug = slug;
    _renderClients();
    var btn = document.getElementById('btn-new-turma');
    var title = document.getElementById('turmas-pane-title');
    var client = _clients.find(function(c) { return c.slug === slug; });
    if (client) {
      title.textContent = 'Turmas: ' + (client.display_name || client.name);
      btn.style.display = '';
    }
    // G redesign: switching client resets column 3 (aulas) unless the saved
    // turma still belongs to the new client; auto-restore on initial boot
    // keeps the previous selection sticky.
    var savedClient = null;
    try { savedClient = localStorage.getItem(LS_REL_CLIENT); } catch (_) {}
    if (savedClient !== slug) {
      _clearAulasColumn();
    }
    _loadTurmas(slug);
  }

  // G redesign: blank column 3 (Aulas) when no turma is selected. The
  // selection state lives in _relClientSlug / _relTurmaSlug (kept reused
  // so Liberações in the Conteúdo sub-tab can read it back).
  function _clearAulasColumn() {
    _relClientSlug = null;
    _relTurmaSlug = null;
    _turmaAulas = [];
    var hdr = document.getElementById('aulas-pane-title');
    if (hdr) hdr.textContent = 'Aulas';
    var list = document.getElementById('aulas-list');
    if (list) list.innerHTML = '<div class="ct-empty">Selecione uma turma à esquerda para ver suas aulas.</div>';
  }

  // ---- Client form with icon picker ----

  function _openClientForm(client) {
    var isEdit = !!client;
    var currentIconPath = isEdit ? (client.icon_path || '') : '';
    var iconPreviewHtml = '';
    if (currentIconPath) {
      var previewSrc = currentIconPath.startsWith('http') ? currentIconPath : WORKER_URL + '/r2/' + currentIconPath;
      iconPreviewHtml =
        '<div class="ct-icon-preview-row">' +
          '<img class="ct-icon-preview" src="' + _esc(previewSrc) + '" alt="Ícone atual">' +
          '<span class="ct-helper-text">Atual</span>' +
        '</div>' +
        '<div class="ct-icon-preview-row" id="cf-icon-preview-row" style="display:none">' +
          '<img id="cf-icon-preview-img" class="ct-icon-preview" src="" alt="Prévia">' +
          '<span class="ct-helper-text">Novo</span>' +
        '</div>';
    } else {
      iconPreviewHtml = '<div class="ct-icon-preview-row" id="cf-icon-preview-row" style="display:none">' +
        '<img id="cf-icon-preview-img" class="ct-icon-preview" src="" alt="Prévia">' +
        '<span class="ct-helper-text">Prévia</span>' +
        '</div>';
    }
    var deleteBlock = isEdit
      ? '<div class="ct-danger-zone">' +
          '<div class="ct-danger-zone-label">Zona de perigo</div>' +
          '<button class="ct-btn ct-btn-danger" id="cf-delete" type="button">Excluir cliente permanentemente</button>' +
          '<p class="ct-helper-text">Apaga o cliente, todas as turmas dele e as liberações de cada turma. Os itens da biblioteca não são afetados. Essa ação não pode ser desfeita.</p>' +
        '</div>'
      : '';
    var html = '<div class="ct-modal" style="max-width:500px">' +
      '<div class="ct-modal-title">' + (isEdit ? 'Editar cliente' : 'Novo cliente') + '</div>' +
      '<div class="ct-field"><label>Nome interno</label>' +
        '<input type="text" id="cf-name" value="' + _esc(isEdit ? client.name : '') + '" placeholder="Ex: Acme Ltda">' +
      '</div>' +
      '<div class="ct-field"><label>Nome para alunos (opcional)</label>' +
        '<input type="text" id="cf-display" value="' + _esc(isEdit ? (client.display_name || '') : '') + '" placeholder="Igual ao nome interno se vazio">' +
      '</div>' +
      '<div class="ct-field"><label>Ícone</label>' +
        iconPreviewHtml +
        '<div class="ct-icon-mode-row">' +
          '<label><input type="radio" name="cf-icon-mode" value="url" id="cf-icon-mode-url"> URL externa</label>' +
          '<label><input type="radio" name="cf-icon-mode" value="upload" id="cf-icon-mode-upload" checked> Upload de imagem</label>' +
        '</div>' +
        '<div id="cf-icon-url-wrap" style="display:none">' +
          '<input type="text" id="cf-icon-url" placeholder="https://..." value="">' +
        '</div>' +
        '<div id="cf-icon-file-wrap">' +
          '<input type="file" id="cf-icon-file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml">' +
          '<div class="ct-file-error" id="cf-icon-file-error" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      deleteBlock +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn" id="cf-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-primary" id="cf-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html);

    // Icon mode toggle
    var modeUrl = bd.querySelector('#cf-icon-mode-url');
    var modeUpload = bd.querySelector('#cf-icon-mode-upload');
    var urlWrap = bd.querySelector('#cf-icon-url-wrap');
    var fileWrap = bd.querySelector('#cf-icon-file-wrap');
    modeUrl.addEventListener('change', function() {
      urlWrap.style.display = '';
      fileWrap.style.display = 'none';
    });
    modeUpload.addEventListener('change', function() {
      urlWrap.style.display = 'none';
      fileWrap.style.display = '';
    });

    // File validation and preview
    var fileErrEl = bd.querySelector('#cf-icon-file-error');
    var previewImg = bd.querySelector('#cf-icon-preview-img');
    var previewRow = bd.querySelector('#cf-icon-preview-row') || bd.querySelector('.ct-icon-preview-row');
    bd.querySelector('#cf-icon-file').addEventListener('change', function(e) {
      var file = e.target.files[0];
      fileErrEl.style.display = 'none';
      fileErrEl.textContent = '';
      if (!file) return;
      if (file.size > 1024 * 1024) {
        fileErrEl.textContent = 'O arquivo excede 1 MB. Escolha uma imagem menor.';
        fileErrEl.style.display = '';
        e.target.value = '';
        return;
      }
      // Show preview
      var reader = new FileReader();
      reader.onload = function(ev) {
        if (previewImg) {
          previewImg.src = ev.target.result;
          if (previewRow) previewRow.style.display = '';
        }
      };
      reader.readAsDataURL(file);
    });

    bd.querySelector('#cf-cancel').addEventListener('click', _closeModal);

    if (isEdit) {
      bd.querySelector('#cf-delete').addEventListener('click', function() {
        var confirmText = 'Para confirmar, digite o nome interno do cliente:\n\n"' + client.name + '"';
        var typed = prompt(confirmText, '');
        if (typed === null) return;
        if (typed.trim() !== client.name) { _toast('Nome não confere. Exclusão cancelada.'); return; }
        callWorker({ action: 'ct_delete_client', slug: client.slug }).then(function() {
          _closeModal();
          _toast('Cliente excluído.');
          if (_selectedClientSlug === client.slug) {
            _selectedClientSlug = null;
            _turmas = [];
            _renderTurmas();
            document.getElementById('turmas-pane-title').textContent = 'Turmas';
            document.getElementById('btn-new-turma').style.display = 'none';
          }
          _loadClients();
        }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
      });
    }

    bd.querySelector('#cf-save').addEventListener('click', function() {
      var name = bd.querySelector('#cf-name').value.trim();
      var display = bd.querySelector('#cf-display').value.trim();
      if (!name) { _toast('Nome obrigatório.'); return; }
      var action = isEdit ? 'ct_update_client' : 'ct_create_client';
      var params = { action: action, name: name, display_name: display || null };
      if (isEdit) params.slug = client.slug;
      else params.slug = _slugify(name);
      if (!params.slug) { _toast('Nome inválido para gerar slug.'); return; }

      var slug = params.slug;
      var iconMode = bd.querySelector('input[name="cf-icon-mode"]:checked').value;
      var iconUrl = bd.querySelector('#cf-icon-url').value.trim();
      var iconFile = bd.querySelector('#cf-icon-file').files[0];

      callWorker(params).then(function() {
        // After client saved, handle icon if provided
        if (iconMode === 'url' && iconUrl) {
          return callWorker({ action: 'ct_set_client_icon', slug: slug, mode: 'url', value: iconUrl });
        } else if (iconMode === 'upload' && iconFile) {
          return _readFileAsBase64(iconFile).then(function(b64) {
            return callWorker({ action: 'ct_set_client_icon', slug: slug, mode: 'upload', value: b64, filename: iconFile.name });
          });
        }
        return Promise.resolve();
      }).then(function() {
        _closeModal();
        _toast(isEdit ? 'Cliente atualizado.' : 'Cliente criado.');
        _loadClients();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  function _readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        // Strip the data:...;base64, prefix
        var result = e.target.result;
        var b64 = result.split(',')[1] || result;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---- Turmas ----

  function _loadTurmas(clientSlug) {
    var el = document.getElementById('turmas-list');
    el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    callWorker({ action: 'ct_list_turmas', client_slug: clientSlug }).then(function(data) {
      _turmas = data.turmas || [];
      _renderTurmas();
      // Pre-select the first non-archived turma so column 3 (Aulas) is never
      // empty when a client has turmas. Skip if the saved selection from
      // localStorage already matches one of the loaded turmas for this client.
      var savedTurma = null;
      try { savedTurma = localStorage.getItem(LS_REL_TURMA); } catch (_) {}
      var savedMatches = savedTurma && _turmas.some(function(t) {
        return t.client_slug === clientSlug && t.slug === savedTurma;
      });
      if (!savedMatches && _turmas.length) {
        var firstActive = _turmas.find(function(t) { return t.status !== 'archived'; }) || _turmas[0];
        if (firstActive) _selectTurmaForAulas(firstActive.client_slug, firstActive.slug);
      }
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar turmas.</div>';
    });
  }

  function _renderTurmas() {
    var el = document.getElementById('turmas-list');
    if (!_turmas.length) {
      el.innerHTML = '<div class="ct-empty">Nenhuma turma cadastrada.</div>';
      return;
    }
    el.innerHTML = _turmas.map(function(t) {
      var url = _turmaUrl(t.client_slug, t.slug, t.token);
      var sel = (t.client_slug === _relClientSlug && t.slug === _relTurmaSlug) ? ' selected' : '';
      var archived = t.status === 'archived' ? ' <span class="ct-badge archived">Arquivada</span>' : '';
      var wpOk = !!(t.whatsapp_url);
      var cpOk = !!(t.classpulse_session_id);
      var hasUrl = !!t.token;
      var realName = t.name || '';
      var displayName = t.display_name || '';
      var subtitle = (displayName && displayName !== realName)
        ? '<div class="ct-card-meta">Para alunos: ' + _esc(displayName) + '</div>'
        : '';
      var aulaCount = t.aula_count || 0;
      var aulaCountLabel = aulaCount === 1 ? '1 aula' : aulaCount + ' aulas';
      var wpInner =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
          '<path d="M20.52 3.48A11.78 11.78 0 0 0 12.05 0C5.5 0 .18 5.32.18 11.87a11.83 11.83 0 0 0 1.59 5.94L0 24l6.34-1.66a11.86 11.86 0 0 0 5.71 1.46h.01c6.55 0 11.87-5.32 11.87-11.87a11.79 11.79 0 0 0-3.41-8.45zM12.06 21.7h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.76.99 1-3.66-.23-.38a9.85 9.85 0 0 1-1.51-5.2c0-5.44 4.43-9.87 9.87-9.87a9.79 9.79 0 0 1 6.97 2.89 9.79 9.79 0 0 1 2.89 6.98c0 5.44-4.43 9.83-9.85 9.83zm5.4-7.36c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.74-1.64-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.08 3.18 5.05 4.45.71.31 1.26.49 1.68.63.71.22 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
        '</svg>';
      var wpIcon = wpOk
        ? '<a class="ct-card-mini-icon is-on" href="' + _esc(t.whatsapp_url) + '" target="_blank" rel="noopener" title="Abrir grupo no WhatsApp" onclick="event.stopPropagation()">' + wpInner + '</a>'
        : '<span class="ct-card-mini-icon is-off" title="WhatsApp não definido">' + wpInner + '</span>';
      var cpIcon =
        '<span class="ct-card-mini-icon ' + (cpOk ? 'is-on' : 'is-off') + '" title="ClassPulse: ' + (cpOk ? 'definido' : 'não definido') + '">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>' +
          '</svg>' +
        '</span>';
      var urlRow = hasUrl
        ? '<div class="ct-card-url-row">' +
            '<button type="button" class="ct-card-url-text" title="Copiar URL" onclick="event.stopPropagation();CT_ADMIN.copyTurmaUrl(\'' + _esc(url) + '\')">' + _esc(url) + '</button>' +
            '<a class="ct-card-url-open" href="' + _esc(url) + '" target="_blank" rel="noopener" title="Abrir URL em nova aba" aria-label="Abrir URL em nova aba" onclick="event.stopPropagation()">↗</a>' +
          '</div>'
        : '<div class="ct-card-url-row is-disabled" title="Token de URL ausente"><span class="ct-card-url-text" aria-disabled="true">URL indisponível</span></div>';
      return '<div class="ct-card' + sel + '" data-id="' + t.id +
              '" data-client-slug="' + _esc(t.client_slug) + '" data-turma-slug="' + _esc(t.slug) + '">' +
        '<div class="ct-card-name">' + _esc(realName) + archived + '</div>' +
        subtitle +
        '<div class="ct-card-info-row">' +
          '<span class="ct-card-info-chip">' + aulaCountLabel + '</span>' +
          '<span class="ct-card-mini-icons">' + wpIcon + cpIcon + '</span>' +
        '</div>' +
        urlRow +
        '<div class="ct-card-actions">' +
          '<button type="button" class="ct-btn ct-btn-sm" onclick="event.stopPropagation();CT_ADMIN.editTurma(' + t.id + ')">Editar</button>' +
          (t.status !== 'archived' ? '<button type="button" class="ct-btn ct-btn-sm ct-btn-danger" onclick="event.stopPropagation();CT_ADMIN.archiveTurma(\'' + _esc(t.client_slug) + '\',\'' + _esc(t.slug) + '\')">Arquivar</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    // Mirror client card pattern: click anywhere on card body (not on a button
    // or link) selects the turma so column 3 loads its aulas.
    el.querySelectorAll('.ct-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('button, a')) return;
        _selectTurmaForAulas(card.dataset.clientSlug, card.dataset.turmaSlug);
      });
    });
  }

  // G redesign: drive column 3 (Aulas) from a click on column 2 (Turmas).
  // Loads aulas for the selected turma and updates the header label.
  function _selectTurmaForAulas(clientSlug, turmaSlug) {
    if (!clientSlug || !turmaSlug) return;
    if (clientSlug === _relClientSlug && turmaSlug === _relTurmaSlug) return;
    _relClientSlug = clientSlug;
    _relTurmaSlug = turmaSlug;
    try {
      localStorage.setItem(LS_REL_CLIENT, clientSlug);
      localStorage.setItem(LS_REL_TURMA, turmaSlug);
    } catch (_) {}
    var hdr = document.getElementById('aulas-pane-title');
    if (hdr) {
      var t = _turmas.find(function(x) { return x.client_slug === clientSlug && x.slug === turmaSlug; });
      var name = t ? (t.display_name || t.name) : '';
      hdr.textContent = name ? 'Aulas: ' + name : 'Aulas';
    }
    _loadTurmaAulas(clientSlug, turmaSlug);
    _renderTurmas();
  }

  // G redesign: column 3 loads aulas for the selected turma.
  function _loadTurmaAulas(clientSlug, turmaSlug) {
    var el = document.getElementById('aulas-list');
    if (!el) return;
    el.innerHTML = '<div class="ct-empty">Carregando aulas...</div>';
    callWorker({ action: 'ct_list_aulas', client_slug: clientSlug, turma_slug: turmaSlug }).then(function(d) {
      _turmaAulas = (d.aulas || []).slice().sort(function(a, b) {
        return (a.aula_number || 0) - (b.aula_number || 0);
      });
      _renderTurmaAulas();
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar aulas.</div>';
    });
  }

  function _renderTurmaAulas() {
    var el = document.getElementById('aulas-list');
    if (!el) return;
    var addBtnHtml =
      '<div class="ct-aulas-toolbar">' +
        '<button type="button" class="ct-btn ct-btn-sm ct-btn-primary" id="cv-add-aula-btn">+ Nova aula</button>' +
      '</div>';
    if (!_turmaAulas.length) {
      el.innerHTML = addBtnHtml +
        '<div class="ct-empty">Nenhuma aula cadastrada. Clique em "+ Nova aula" para criar.</div>';
    } else {
      el.innerHTML = addBtnHtml +
        '<div class="ct-aulas-col-list">' +
          _turmaAulas.map(_renderAulaColRow).join('') +
        '</div>';
    }
    _wireAulasColEvents();
  }

  function _renderAulaColRow(a, idx) {
    var ds = _aulaDateStatus(a);
    var title = a.title ? _esc(a.title) : '<span class="is-empty">sem título</span>';
    return '<div class="ct-aula-col-row" data-aula-idx="' + idx + '">' +
      '<div class="ct-aula-col-row-display">' +
        '<div class="ct-aula-col-row-main">' +
          '<span class="ct-rel-aula-label">Aula ' + _esc(a.aula_number) + '</span>' +
          '<span class="ct-aula-col-row-title">' + title + '</span>' +
        '</div>' +
        '<span class="ct-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
      '</div>' +
    '</div>';
  }

  function _renderAulaColEditor(a) {
    return '<div class="ct-aula-col-editor">' +
      '<div class="ct-field">' +
        '<label>Título</label>' +
        '<input type="text" class="cv-aula-title" value="' + _esc(a.title || '') + '" placeholder="Título da aula">' +
      '</div>' +
      '<div class="ct-aula-col-editor-grid">' +
        '<div class="ct-field">' +
          '<label>Agendada para (vazio = sem data definida)</label>' +
          '<input type="date" class="cv-aula-scheduled" value="' + _esc(a.scheduled_for || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Ocorreu em</label>' +
          '<input type="date" class="cv-aula-happened" value="' + _esc(a.happened_on || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Remarcada de (data original)</label>' +
          '<input type="date" class="cv-aula-rescheduled-from" value="' + _esc(a.rescheduled_from || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Nota de remarcação (opcional)</label>' +
          '<input type="text" class="cv-aula-rescheduled-note" value="' + _esc(a.rescheduled_note || '') + '" placeholder="Ex: feriado, aguardando nova data">' +
        '</div>' +
      '</div>' +
      '<div class="ct-aula-col-editor-actions">' +
        '<button type="button" class="ct-btn ct-btn-sm ct-btn-danger cv-aula-delete">Excluir</button>' +
        '<div class="ct-aula-col-editor-actions-right">' +
          '<button type="button" class="ct-btn ct-btn-sm cv-aula-cancel">Fechar</button>' +
          '<button type="button" class="ct-btn ct-btn-sm ct-btn-primary cv-aula-save">Salvar</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _wireAulasColEvents() {
    var addBtn = document.getElementById('cv-add-aula-btn');
    if (addBtn) {
      addBtn.addEventListener('click', _addNewAulaCol);
    }
    document.querySelectorAll('#aulas-list .ct-aula-col-row').forEach(function(row) {
      var display = row.querySelector('.ct-aula-col-row-display');
      if (display) {
        display.addEventListener('click', function() { _expandAulaCol(row); });
      }
    });
  }

  function _addNewAulaCol() {
    var nums = _turmaAulas.map(function(a) { return a.aula_number || 0; });
    var nextNum = nums.length ? Math.max.apply(null, nums) + 1 : 1;
    var newAula = {
      id: null,
      aula_number: nextNum,
      title: '',
      topics_json: null,
      scheduled_for: null,
      happened_on: null,
      rescheduled_from: null,
      rescheduled_note: null,
      _isNew: true
    };
    _turmaAulas.push(newAula);
    _renderTurmaAulas();
    var rows = document.querySelectorAll('#aulas-list .ct-aula-col-row');
    var newRow = rows[rows.length - 1];
    if (newRow) _expandAulaCol(newRow);
  }

  function _expandAulaCol(row) {
    var idx = parseInt(row.dataset.aulaIdx, 10);
    var aula = _turmaAulas[idx];
    if (!aula) return;
    document.querySelectorAll('#aulas-list .ct-aula-col-row.is-editing').forEach(function(r) {
      if (r !== row) _collapseAulaCol(r);
    });
    row.classList.add('is-editing');
    var display = row.querySelector('.ct-aula-col-row-display');
    if (display) display.style.display = 'none';
    var wrapper = document.createElement('div');
    wrapper.innerHTML = _renderAulaColEditor(aula);
    var editorEl = wrapper.firstChild;
    row.appendChild(editorEl);
    _wireAulaEditorEvents(row, aula, idx);
    var titleInput = row.querySelector('.cv-aula-title');
    if (titleInput) setTimeout(function() { titleInput.focus(); }, 0);
  }

  function _collapseAulaCol(row) {
    row.classList.remove('is-editing');
    var display = row.querySelector('.ct-aula-col-row-display');
    if (display) display.style.display = '';
    var editor = row.querySelector('.ct-aula-col-editor');
    if (editor) editor.parentNode.removeChild(editor);
  }

  function _wireAulaEditorEvents(row, aula, idx) {
    var saveBtn = row.querySelector('.cv-aula-save');
    var cancelBtn = row.querySelector('.cv-aula-cancel');
    var deleteBtn = row.querySelector('.cv-aula-delete');
    var titleInput = row.querySelector('.cv-aula-title');
    var schedInput = row.querySelector('.cv-aula-scheduled');
    var happInput = row.querySelector('.cv-aula-happened');
    var rfromInput = row.querySelector('.cv-aula-rescheduled-from');
    var rnoteInput = row.querySelector('.cv-aula-rescheduled-note');

    saveBtn.addEventListener('click', function() {
      var payload = {
        client_slug: _relClientSlug,
        turma_slug: _relTurmaSlug,
        aula_number: aula.aula_number,
        title: titleInput.value.trim(),
        scheduled_for: schedInput.value || null,
        happened_on: happInput.value || null,
        rescheduled_from: rfromInput.value || null,
        rescheduled_note: rnoteInput.value.trim() || null
      };
      var isNew = aula._isNew;
      var params = Object.assign({ action: isNew ? 'ct_create_aula' : 'ct_update_aula' }, payload);
      if (!isNew) params.id = aula.id;
      callWorker(params).then(function(res) {
        if (isNew) {
          var created = res.aula || res;
          if (created && created.id) {
            aula.id = created.id;
            aula._isNew = false;
          }
        }
        aula.title = payload.title;
        aula.scheduled_for = payload.scheduled_for;
        aula.happened_on = payload.happened_on;
        aula.rescheduled_from = payload.rescheduled_from;
        aula.rescheduled_note = payload.rescheduled_note;
        _toast('Aula salva.');
        _renderTurmaAulas();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });

    cancelBtn.addEventListener('click', function() {
      if (aula._isNew) {
        _turmaAulas.splice(idx, 1);
        _renderTurmaAulas();
      } else {
        _collapseAulaCol(row);
      }
    });

    deleteBtn.addEventListener('click', function() {
      if (aula._isNew) {
        _turmaAulas.splice(idx, 1);
        _renderTurmaAulas();
        return;
      }
      if (!confirm('Excluir aula ' + aula.aula_number + '? Os itens liberados para ela perderão a associação.')) return;
      callWorker({ action: 'ct_delete_aula', id: aula.id }).then(function() {
        _turmaAulas.splice(idx, 1);
        _toast('Aula excluída.');
        _renderTurmaAulas();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  function _openTurmaForm(turma, scrollTo) {
    var isEdit = !!turma;
    // Load ClassPulse sessions (may already be cached)
    var sessionsPromise = _cpSessions.length
      ? Promise.resolve()
      : callWorker({ action: 'cp_list_sessions' }).then(function(d) { _cpSessions = d.sessions || []; }).catch(function() {});

    sessionsPromise.then(function() {
      var cpOptions = '<option value="">(nenhuma)</option>' +
        _cpSessions.map(function(s) {
          var sel = (isEdit && turma.classpulse_session_id === s.id) ? ' selected' : '';
          return '<option value="' + _esc(s.id) + '"' + sel + '>' + _esc(s.name) + '</option>';
        }).join('');

      var html = '<div class="ct-modal" style="max-width:600px;max-height:90vh;overflow-y:auto">' +
        '<div class="ct-modal-title">' + (isEdit ? 'Editar turma' : 'Nova turma') + '</div>' +
        '<div class="ct-field"><label>Nome interno</label>' +
          '<input type="text" id="tf-name" value="' + _esc(isEdit ? turma.name : '') + '" placeholder="Ex: Turma A">' +
        '</div>' +
        '<div class="ct-field"><label>Nome para alunos (opcional)</label>' +
          '<input type="text" id="tf-display" value="' + _esc(isEdit ? (turma.display_name || '') : '') + '" placeholder="Igual ao nome interno se vazio">' +
        '</div>' +
        '<div class="ct-field"><label>WhatsApp do grupo (URL, opcional)</label>' +
          '<input type="text" id="tf-whatsapp" value="' + _esc(isEdit ? (turma.whatsapp_url || '') : '') + '" placeholder="https://chat.whatsapp.com/...">' +
        '</div>' +
        '<div class="ct-field"><label>Sessão ClassPulse</label>' +
          '<select id="tf-classpulse">' + cpOptions + '</select>' +
        '</div>' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="tf-cancel">Cancelar</button>' +
          '<button class="ct-btn ct-btn-primary" id="tf-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
        '</div>' +
      '</div>';

      var bd = _openModal(html);

      // Scroll to a specific section after modal opens
      function _scrollModalTo(targetId) {
        var modal = bd.querySelector('.ct-modal');
        var el = bd.querySelector('#' + targetId);
        if (modal && el) {
          setTimeout(function() { el.scrollIntoView({ block: 'nearest' }); modal.scrollTop = el.offsetTop - 16; }, 80);
        }
      }

      // Aulas now live in column 3 of the Turmas tab (not in this modal).
      if (scrollTo === 'whatsapp') { setTimeout(function() { _scrollModalTo('tf-whatsapp'); bd.querySelector('#tf-whatsapp').focus(); }, 80); }
      else if (scrollTo === 'classpulse') { setTimeout(function() { _scrollModalTo('tf-classpulse'); bd.querySelector('#tf-classpulse').focus(); }, 80); }

      bd.querySelector('#tf-cancel').addEventListener('click', _closeModal);
      bd.querySelector('#tf-save').addEventListener('click', function() {
        var name = bd.querySelector('#tf-name').value.trim();
        var display = bd.querySelector('#tf-display').value.trim();
        var whatsapp = bd.querySelector('#tf-whatsapp').value.trim();
        var cpSession = bd.querySelector('#tf-classpulse').value;
        if (!name) { _toast('Nome obrigatório.'); return; }
        var action = isEdit ? 'ct_update_turma' : 'ct_create_turma';
        var params = { action: action, client_slug: _selectedClientSlug, name: name, display_name: display || null };
        if (isEdit) params.slug = turma.slug;
        else params.slug = _slugify(name);
        if (!params.slug) { _toast('Nome inválido para gerar slug.'); return; }
        callWorker(params).then(function() {
          // Update meta fields if edit
          var metaChanged = isEdit && (
            whatsapp !== (turma.whatsapp_url || '') ||
            cpSession !== (turma.classpulse_session_id || '')
          );
          var metaPromise = Promise.resolve();
          if (isEdit && metaChanged) {
            metaPromise = callWorker({
              action: 'ct_update_turma_meta',
              client_slug: _selectedClientSlug,
              slug: turma.slug,
              whatsapp_url: whatsapp || null,
              classpulse_session_id: cpSession || null
            });
          } else if (!isEdit && (whatsapp || cpSession)) {
            // On create, slug is the slugified name; update meta after create
            metaPromise = callWorker({
              action: 'ct_update_turma_meta',
              client_slug: _selectedClientSlug,
              slug: params.slug,
              whatsapp_url: whatsapp || null,
              classpulse_session_id: cpSession || null
            });
          }
          return metaPromise;
        }).then(function() {
          _closeModal();
          _toast(isEdit ? 'Turma atualizada.' : 'Turma criada.');
          _loadTurmas(_selectedClientSlug);
        }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
      });
    });
  }

  // ---- Items ----

  function _loadItems(opts) {
    opts = opts || {};
    var el = document.getElementById('items-list');
    if (!opts.silent || !_items.length) {
      el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    }
    return callWorker({ action: 'ct_list_items' }).then(function(data) {
      _items = data.items || [];
      _renderItems();
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar itens.</div>';
    });
  }

  function _renderItems() {
    // Hide apostila items (set_id != null), tarefa, and conteudo items from the main Items grid.
    var libraryItems = _items.filter(function(it) { return !it.set_id && it.type !== 'tarefa' && it.type !== 'conteudo'; });
    _renderItemsFilter(libraryItems);
    var el = document.getElementById('items-list');
    if (!libraryItems.length) {
      el.innerHTML = '<div class="ct-empty">Nenhum item na biblioteca.</div>';
      return;
    }
    var filtered = CT_TYPE_FILTER.apply(libraryItems, _selectedTypeFilter);
    if (!filtered.length) {
      el.innerHTML = '<div class="ct-empty">Nenhum item neste filtro.</div>';
      return;
    }
    el.innerHTML = filtered.map(function(item) {
      var meta = _typeMeta(item.type);
      var tagsHtml = (item.tags && item.tags.length)
        ? '<span class="ct-item-tags">' + item.tags.map(function(t) {
            return '<span class="ct-tag-chip ct-tag-chip-mini">' + _esc(t.label) + '</span>';
          }).join('') + '</span>'
        : '';
      var setBadge = item.set_id
        ? '<span class="ct-set-badge" title="Item faz parte do conteúdo importado; edições manuais podem ser sobrescritas em sincronizações futuras.">Conteúdo do curso</span>'
        : '';
      var rowOnclick = _selectMode
        ? 'CT_ADMIN.toggleItemSelection(' + item.id + ')'
        : 'CT_ADMIN.openItem(' + item.id + ')';
      var checkboxHtml = _selectMode
        ? '<input type="checkbox" class="ct-item-checkbox"' + (_selectedIds.has(Number(item.id)) ? ' checked' : '') + ' onclick="event.stopPropagation();CT_ADMIN.toggleItemSelection(' + item.id + ')">'
        : '';
      var actionsHtml = _selectMode
        ? ''
        : '<button class="ct-btn ct-btn-sm" onclick="event.stopPropagation();CT_ADMIN.duplicateItem(' + item.id + ')" title="Duplicar item">Duplicar</button>' +
          '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="event.stopPropagation();CT_ADMIN.deleteItem(' + item.id + ')">Excluir</button>';
      var rowSelectedClass = _selectedIds.has(Number(item.id)) ? ' ct-item-row-selected' : '';
      return '<div class="ct-item-row' + rowSelectedClass + '" data-item-id="' + item.id + '" onclick="' + rowOnclick + '">' +
        checkboxHtml +
        '<span class="ct-item-type-icon">' + meta.icon + '</span>' +
        '<div class="ct-item-info">' +
          '<div class="ct-item-title">' + _esc(item.title) + setBadge + '</div>' +
          '<div class="ct-item-sub">' + _esc(meta.label) +
            ' · ' + new Date(item.updated_at * 1000).toLocaleDateString('pt-BR') +
          '</div>' +
          tagsHtml +
        '</div>' +
        actionsHtml +
      '</div>';
    }).join('');
  }

  function _removeItemFromDom(id) {
    var idStr = String(id);
    var row = document.querySelector('.ct-item-row[data-item-id="' + idStr + '"]');
    if (row && row.parentNode) row.parentNode.removeChild(row);
    var libraryItems = _items.filter(function(it) { return !it.set_id && it.type !== 'tarefa' && it.type !== 'conteudo'; });
    _renderItemsFilter(libraryItems);
    var grid = document.getElementById('items-list');
    if (grid && grid.children.length === 0) {
      var filtered = CT_TYPE_FILTER.apply(libraryItems, _selectedTypeFilter);
      grid.innerHTML = !libraryItems.length
        ? '<div class="ct-empty">Nenhum item na biblioteca.</div>'
        : (filtered.length ? '' : '<div class="ct-empty">Nenhum item neste filtro.</div>');
    }
  }

  function _updateBulkBar() {
    var bar = document.getElementById('items-bulk-bar');
    var btn = document.getElementById('btn-select-mode');
    if (!bar || !btn) return;
    bar.style.display = _selectMode ? 'flex' : 'none';
    btn.textContent = _selectMode ? 'Sair da seleção' : 'Selecionar';
    if (_selectMode) {
      var count = _selectedIds.size;
      document.getElementById('items-bulk-count').textContent = count + ' selecionado(s)';
      var delBtn = document.getElementById('btn-bulk-delete');
      if (delBtn) delBtn.disabled = count === 0;
    }
  }

  function _renderItemsFilter(itemsSubset) {
    var fc = document.getElementById('items-filter');
    if (!fc) return;
    var items = itemsSubset !== undefined ? itemsSubset : _items.filter(function(it) { return !it.set_id && it.type !== 'tarefa' && it.type !== 'conteudo'; });
    if (!items.length) { fc.innerHTML = ''; return; }
    fc.innerHTML =
      '<div class="ct-filter-row">' +
        '<div id="ct-type-filter-host" class="ct-filter-types"></div>' +
      '</div>';
    CT_TYPE_FILTER.render({
      container:    fc.querySelector('#ct-type-filter-host'),
      types:        _types,
      items:        items,
      selectedSlug: _selectedTypeFilter,
      onChange: function(slug) {
        _selectedTypeFilter = slug;
        _renderItems();
      }
    });
  }

  // ---- GDoc ingest button + modal ----

  function _openGdocIngestModal(onSuccess) {
    var html = '<div class="ct-modal ct-gdoc-modal">' +
      '<div class="ct-modal-title">Importar conteúdo do curso</div>' +
      '<p class="ct-helper-text" style="margin:0 0 12px">O conteúdo é compartilhado entre todos os clientes. Após importar, todas as turmas terão acesso ao mesmo material.</p>' +
      '<div class="ct-field"><label>URL do documento</label>' +
        '<input type="text" id="gd-url" placeholder="https://docs.google.com/document/d/...">' +
        '<p class="ct-helper-text">O documento deve estar compartilhado como "Qualquer pessoa com o link pode visualizar".</p>' +
      '</div>' +
      '<div class="ct-field"><label>Marcador de seção</label>' +
        '<select id="gd-marker">' +
          '<option value="h2" selected>Título 2 (h2)</option>' +
          '<option value="h1">Título 1 (h1)</option>' +
          '<option value="hr">Linha horizontal (---)</option>' +
        '</select>' +
      '</div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn" id="gd-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-primary" id="gd-import">Importar</button>' +
      '</div>' +
    '</div>';

    var bd = _openModal(html, { disableBackdropClose: true });

    bd.querySelector('#gd-cancel').addEventListener('click', _closeModal);

    bd.querySelector('#gd-import').addEventListener('click', function() {
      var url = bd.querySelector('#gd-url').value.trim();
      if (!url) { _toast('Informe a URL do documento.'); return; }
      var marker = bd.querySelector('#gd-marker').value;
      var btn = bd.querySelector('#gd-import');
      btn.disabled = true;
      btn.textContent = 'Importando...';
      callWorker({ action: 'ct_ingest_gdoc', url: url, mode: 'set', marker: marker }).then(function(res) {
        _closeModal();
        var n = (res && res.items_created) ? res.items_created : (res && res.count) ? res.count : (res && res.items) ? res.items.length : '?';
        _toast('Conteúdo importado, ' + n + ' seções criadas.');
        if (typeof onSuccess === 'function') onSuccess();
        else _loadItems({ silent: true });
      }).catch(function(err) {
        btn.disabled = false;
        btn.textContent = 'Importar';
        _toast('Erro: ' + (err.message || err));
      });
    });
  }

  // ---- Apostila tab ----

  function _loadApostila() {
    var el = document.getElementById('apostila-list');
    if (!el) return;
    el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    callWorker({ action: 'ct_list_sets' }).then(function(data) {
      var sets = (data.sets || []).filter(function(s) { return (s.item_count || 0) > 0; });
      if (!sets.length) {
        _apostilaSet = null;
        _apostilaItems = [];
        _renderApostila();
        return;
      }
      // Pick newest set with items (matches student view's apostila_set selection)
      var current = sets[sets.length - 1];
      return callWorker({ action: 'ct_get_set', id: current.id }).then(function(res) {
        _apostilaSet = res.set || null;
        _apostilaItems = (res.items || []).slice().sort(function(a, b) {
          return (a.set_position || 0) - (b.set_position || 0);
        });
        _renderApostila();
      });
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar o conteúdo.</div>';
    });
  }

  function _renderApostila() {
    var labelEl = document.getElementById('apostila-set-label');
    var deleteBtn = document.getElementById('btn-delete-set');
    var el = document.getElementById('apostila-list');
    if (!el) return;

    if (!_apostilaSet) {
      if (labelEl) labelEl.textContent = 'Conteúdo do curso';
      if (deleteBtn) deleteBtn.style.display = 'none';
      el.innerHTML = '<div class="ct-empty">Nenhum conteúdo importado ainda. Use o botão acima para importar a partir de um Google Docs.</div>';
      return;
    }

    if (labelEl) labelEl.textContent = _apostilaSet.category_label || 'Conteúdo do curso';
    if (deleteBtn) deleteBtn.style.display = '';

    if (!_apostilaItems.length) {
      el.innerHTML = '<div class="ct-empty">O conteúdo não tem seções.</div>';
      return;
    }

    el.innerHTML = _apostilaItems.map(function(item) {
      // Worker's ct_get_set query doesn't return body_md (would inflate the
      // payload), so we display the summary on the sub-line instead. Falls
      // back to a placeholder for legacy items that have neither.
      var subText = item.summary && item.summary.trim() ? item.summary : 'sem resumo';
      return '<div class="ct-item-row ct-apostila-row" data-id="' + item.id + '">' +
        '<span class="ct-apostila-pos">' + (item.set_position || '') + '</span>' +
        '<div class="ct-item-info">' +
          '<div class="ct-item-title">' + _esc(item.title) + '</div>' +
          '<div class="ct-item-sub">' + _esc(subText) + '</div>' +
        '</div>' +
        '<button class="ct-btn ct-btn-sm" onclick="event.stopPropagation();CT_ADMIN.openItem(' + item.id + ')">Editar</button>' +
        '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="event.stopPropagation();CT_ADMIN.deleteApostilaItem(' + item.id + ')">Excluir</button>' +
      '</div>';
    }).join('');
  }

  function _deleteApostilaItem(id) {
    if (!confirm('Excluir esta seção do conteúdo? Ela será removida de todas as turmas onde está liberada.')) return;
    var idNum = Number(id);
    var idx = _apostilaItems.findIndex(function(it) { return Number(it.id) === idNum; });
    var snapshot = idx >= 0 ? _apostilaItems[idx] : null;
    if (idx >= 0) {
      _apostilaItems.splice(idx, 1);
      _renderApostila();
    }
    callWorker({ action: 'ct_delete_item', id: id, _silent: true }).then(function() {
      _toast('Seção excluída.');
      // Keep _items in sync as well
      var libIdx = _items.findIndex(function(it) { return Number(it.id) === idNum; });
      if (libIdx >= 0) _items.splice(libIdx, 1);
    }).catch(function(err) {
      if (snapshot && idx >= 0) {
        _apostilaItems.splice(idx, 0, snapshot);
        _renderApostila();
      }
      _toast('Erro: ' + (err.message || err));
    });
  }

  function _deleteApostilaSet() {
    if (!_apostilaSet) return;
    if (!confirm('Excluir o conteúdo completo? Todas as seções serão removidas da biblioteca e de todas as turmas onde estão liberadas.')) return;
    callWorker({ action: 'ct_delete_set', id: _apostilaSet.id }).then(function() {
      _apostilaSet = null;
      _apostilaItems = [];
      // Cascade delete on the server removes the items too; drop them from the local cache.
      _items = _items.filter(function(it) { return !it.set_id; });
      _renderApostila();
      _toast('Conteúdo excluído.');
    }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
  }

  // ---- Item editor (open) ----

  function _openItemEditor(item) {
    if (item) { _openItemEditorFull(item, null); return; }
    _openItemContentFirst();
  }

  // ---- Step 1: content-first screen (new items only) ----

  function _openItemContentFirst() {
    var bd = _openModal('<div class="ct-modal-body"></div>', { disableBackdropClose: true });
    CTItemCreator.mount(bd, {
      types: _types,
      tags: _tags,
      titleLabel: 'Novo item · 1 de 2',
      closeLabel: 'Fechar',
      onClose: _closeModal,
      onCancel: _closeModal,
      onManual: function(out) {
        _closeModal();
        _openItemEditorFull(null, { body_md: out.body_md }, null);
      },
      onAIComplete: async function(result) {
        _closeModal();
        var tagIds = await _tagsByLabels(result.tagLabels || []);
        var prefill = Object.assign({}, result.prefill, { tag_ids: tagIds });
        _openItemEditorFull(null, prefill, result.aiContext);
      }
    });
  }

  // Resolve a list of tag labels to existing tag IDs, creating any
  // missing ones.
  async function _tagsByLabels(labels) {
    var ids = [];
    for (var i = 0; i < labels.length; i++) {
      var label = (labels[i] || '').trim();
      if (!label) continue;
      var existing = _tags.find(function(t) { return t.label.toLowerCase() === label.toLowerCase(); });
      if (existing) { ids.push(existing.id); continue; }
      try {
        var res = await callWorker({ action: 'ct_create_tag', label: label });
        if (res && res.tag) {
          if (!_tags.find(function(t) { return t.id === res.tag.id; })) {
            _tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
          }
          ids.push(res.tag.id);
        }
      } catch (e) {}
    }
    return ids;
  }

  // ---- Step 2: full editor form (also handles edit mode) ----

  function _openItemEditorFull(item, prefill, aiContext) {
    var isEdit = !!item;
    var bd = _openModal('<div class="ct-modal-body"></div>', { disableBackdropClose: true });
    CTItemForm.mount(bd, {
      item: item,
      prefill: prefill,
      aiContext: aiContext,
      types: _types,
      tags: _tags,
      titleLabel: isEdit ? 'Editar item' : 'Novo item · 2 de 2',
      saveLabel: isEdit ? 'Salvar' : 'Criar',
      closeLabel: 'Fechar',
      excludeTypes: isEdit ? [] : ['conteudo', 'tarefa'],
      onCreateType: _openTypeCreateForm,
      onSave: function() {
        _closeModal();
        _toast(isEdit ? 'Item atualizado.' : 'Item criado.');
        _loadItems({ silent: true });
        _loadTags();
      },
      onCancel: _closeModal
    });
  }

  // ---- Inline "+ Criar novo tipo" form ----

  function _openTypeCreateForm(callback) {
    var html = '<div class="ct-modal" style="max-width:380px">' +
      '<div class="ct-modal-title">Novo tipo</div>' +
      '<div class="ct-field"><label>Nome</label>' +
        '<input type="text" id="tc-label" placeholder="Ex: Atividade">' +
      '</div>' +
      '<div class="ct-field"><label>Identificador (slug, opcional)</label>' +
        '<input type="text" id="tc-slug" placeholder="auto-gerado se vazio">' +
      '</div>' +
      '<div class="ct-field"><label>Ícone (emoji, opcional)</label>' +
        '<input type="text" id="tc-icon" placeholder="📌" maxlength="4">' +
      '</div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn" id="tc-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-primary" id="tc-save">Criar</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html, { disableBackdropClose: true });
    function close(slug) {
      if (bd.parentNode) bd.parentNode.removeChild(bd);
      if (callback) callback(slug);
    }
    bd.querySelector('#tc-cancel').addEventListener('click', function() { close(null); });
    bd.querySelector('#tc-save').addEventListener('click', function() {
      var label = bd.querySelector('#tc-label').value.trim();
      var slug = bd.querySelector('#tc-slug').value.trim() || _slugify(label);
      var icon = bd.querySelector('#tc-icon').value.trim();
      if (!label || !slug) { _toast('Nome obrigatório.'); return; }
      callWorker({ action: 'ct_create_type', slug: slug, label: label, icon: icon || null }).then(function() {
        return _loadTypes();
      }).then(function() {
        _toast('Tipo criado.');
        close(slug);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  // ---- Tag manager modal (rename / delete tags globally) ----

  function _openTagManager() {
    var html = '<div class="ct-modal" style="max-width:520px">' +
      '<div class="ct-modal-title">Gerenciar tags</div>' +
      '<div class="ct-tag-manager-create">' +
        '<input type="text" id="tm-new" placeholder="Nome da nova tag">' +
        '<button class="ct-btn ct-btn-primary ct-btn-sm" id="tm-add" type="button">Adicionar</button>' +
      '</div>' +
      '<div class="ct-tag-manager-list" id="tm-list"></div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn ct-btn-primary" id="tm-close">Fechar</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html, { disableBackdropClose: true });
    var newInput = bd.querySelector('#tm-new');
    newInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); bd.querySelector('#tm-add').click(); }
    });
    bd.querySelector('#tm-add').addEventListener('click', function() {
      var label = newInput.value.trim();
      if (!label) return;
      callWorker({ action: 'ct_create_tag', label: label }).then(function() {
        return _loadTags();
      }).then(function() {
        newInput.value = '';
        render();
        _toast('Tag adicionada.');
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
    function render() {
      var listEl = bd.querySelector('#tm-list');
      if (!_tags.length) {
        listEl.innerHTML = '<div class="ct-empty">Nenhuma tag cadastrada.</div>';
        return;
      }
      listEl.innerHTML = _tags.map(function(t) {
        return '<div class="ct-tag-row" data-id="' + t.id + '">' +
          '<span class="ct-tag-row-label">' + _esc(t.label) + '</span>' +
          '<span class="ct-tag-row-count">' + (t.item_count || 0) + '</span>' +
          '<button class="ct-btn ct-btn-sm" data-action="rename">Renomear</button>' +
          '<button class="ct-btn ct-btn-sm ct-btn-danger" data-action="delete">Excluir</button>' +
        '</div>';
      }).join('');
      listEl.querySelectorAll('.ct-tag-row').forEach(function(row) {
        var id = parseInt(row.dataset.id);
        var tag = _tags.find(function(t) { return t.id === id; });
        row.querySelector('[data-action="rename"]').addEventListener('click', function() {
          var n = prompt('Novo nome para "' + tag.label + '":', tag.label);
          if (n === null) return;
          n = n.trim();
          if (!n || n === tag.label) return;
          callWorker({ action: 'ct_rename_tag', id: id, label: n }).then(function() {
            return _loadTags();
          }).then(function() {
            render();
            _toast('Tag renomeada.');
            _loadItems();
          }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
        });
        row.querySelector('[data-action="delete"]').addEventListener('click', function() {
          if (!confirm('Excluir a tag "' + tag.label + '"? Ela será removida de todos os itens.')) return;
          callWorker({ action: 'ct_delete_tag', id: id }).then(function() {
            return _loadTags();
          }).then(function() {
            render();
            _toast('Tag excluída.');
            _loadItems();
          }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
        });
      });
    }
    render();
    bd.querySelector('#tm-close').addEventListener('click', _closeModal);
  }

  // ---- Loaders for types/tags ----

  function _loadTypes() {
    return callWorker({ action: 'ct_list_types' }).then(function(data) {
      _types = data.types || [];
    }).catch(function() {});
  }

  function _loadTags() {
    return callWorker({ action: 'ct_list_tags' }).then(function(data) {
      _tags = data.tags || [];
    }).catch(function() {});
  }

  // ---- Releases ----

  function _loadReleases(clientSlug, turmaSlug) {
    _relClientSlug = clientSlug;
    _relTurmaSlug = turmaSlug;
    _relAulas = [];
    _relReleasedMeta = {};
    _apostilaSet = null;
    _apostilaItems = [];
    var el = document.getElementById('releases-list');
    el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    var loadApostila = callWorker({ action: 'ct_list_sets' }).then(function(data) {
      var sets = (data.sets || []).filter(function(s) { return (s.item_count || 0) > 0; });
      if (!sets.length) return;
      // Pick newest set with items (matches student view's apostila_set selection)
      var current = sets[sets.length - 1];
      return callWorker({ action: 'ct_get_set', id: current.id }).then(function(res) {
        _apostilaSet = res.set || null;
        _apostilaItems = (res.items || []).slice().sort(function(a, b) {
          return (a.set_position || 0) - (b.set_position || 0);
        });
      });
    }).catch(function() {});
    Promise.all([
      callWorker({ action: 'ct_list_items' }),
      callWorker({ action: 'ct_list_turmas', client_slug: clientSlug }),
      callWorker({ action: 'ct_list_aulas', client_slug: clientSlug, turma_slug: turmaSlug }),
      loadApostila
    ]).then(function(results) {
      var allItems = (results[0].items || []);
      _relAulas = results[2].aulas || [];
      var turma = (results[1].turmas || []).find(function(t) { return t.slug === turmaSlug; });
      if (!turma) { el.innerHTML = '<div class="ct-empty">Turma não encontrada.</div>'; return; }
      return callWorker({
        action: 'ct_get_turma_view',
        client_slug: clientSlug,
        turma_slug: turmaSlug,
        token: turma.token
      }).then(function(vd) {
        _relAllItems = allItems;
        _relReleased = (vd.items || []).map(function(i) { return i.id; });
        // Build release meta map: {item_id: {aula_number}}
        _relReleasedMeta = {};
        (vd.items || []).forEach(function(i) {
          _relReleasedMeta[i.id] = { aula_number: i.aula_number || null };
        });
        _renderReleases();
      }).catch(function() {
        _relAllItems = allItems;
        _relReleased = [];
        _renderReleases();
      });
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar dados.</div>';
    });
  }

  // ---- Date helpers ----

  function _fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }

  function _aulaDateStatus(a) {
    var today = new Date().toISOString().slice(0, 10);
    if (a.happened_on) return { text: 'ocorreu em ' + _fmtDate(a.happened_on), cls: 'ct-rel-date-ocorreu' };
    if (a.scheduled_for) {
      if (a.rescheduled_from && a.scheduled_for > today)
        return { text: 'remarcada → ' + _fmtDate(a.scheduled_for), cls: 'ct-rel-date-remarcada' };
      if (a.scheduled_for > today)
        return { text: 'agendada para ' + _fmtDate(a.scheduled_for), cls: 'ct-rel-date-agendada' };
      return { text: 'ocorreu em ' + _fmtDate(a.scheduled_for), cls: 'ct-rel-date-ocorreu' };
    }
    return { text: 'a definir', cls: 'ct-rel-date-adefinir' };
  }

  // ---- Releases (aula-centric) ----

  function _renderReleases() {
    _renderReleasesAulaList();
  }

  function _renderReleasesAulaList() {
    var el = document.getElementById('releases-list');

    var html = '';
    if (!_relAulas.length) {
      html += '<div class="ct-empty" style="margin-bottom:1rem">Nenhuma aula cadastrada. Adicione aulas na aba Clientes > editar turma.</div>';
    }

    _relAulas.forEach(function(aula) {
      var n = aula.aula_number;
      var ds = _aulaDateStatus(aula);

      var apostilaCount = _apostilaItems.filter(function(i) {
        return _relReleased.indexOf(i.id) !== -1 &&
               String((_relReleasedMeta[i.id] || {}).aula_number) === String(n);
      }).length;

      var tarefaCount = _relAllItems.filter(function(i) {
        return !i.set_id && i.type === 'tarefa' &&
               _relReleased.indexOf(i.id) !== -1 &&
               String((_relReleasedMeta[i.id] || {}).aula_number) === String(n);
      }).length;

      var outrosCount = _relAllItems.filter(function(i) {
        return !i.set_id && i.type !== 'conteudo' && i.type !== 'tarefa' &&
               _relReleased.indexOf(i.id) !== -1 &&
               String((_relReleasedMeta[i.id] || {}).aula_number) === String(n);
      }).length;

      var counts = '';
      if (apostilaCount) counts += '<span class="ct-rel-count">📖 ' + apostilaCount + '</span>';
      if (tarefaCount)   counts += '<span class="ct-rel-count">⚑ ' + tarefaCount + '</span>';
      if (outrosCount)   counts += '<span class="ct-rel-count">📄 ' + outrosCount + '</span>';
      if (!counts)       counts  = '<span class="ct-rel-count ct-rel-count-empty">vazio</span>';

      html +=
        '<div class="ct-rel-aula-outer" data-aula-id="' + _esc(aula.id) + '" data-aula-num="' + _esc(n) + '">' +
          '<div class="ct-rel-aula-header">' +
            '<div class="ct-rel-aula-info">' +
              '<span class="ct-rel-aula-label">Aula ' + _esc(n) + '</span>' +
              (aula.title ? '<span class="ct-rel-aula-title">' + _esc(aula.title) + '</span>' : '') +
              '<span class="ct-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
            '</div>' +
            '<div class="ct-rel-aula-meta">' +
              '<div class="ct-rel-aula-counts">' + counts + '</div>' +
              '<span class="ct-rel-aula-chevron">&#8250;</span>' +
            '</div>' +
          '</div>' +
          '<div class="ct-rel-aula-composer"></div>' +
        '</div>';
    });

    var outrosSolo = _relAllItems.filter(function(i) {
      return !i.set_id && i.type !== 'conteudo' && i.type !== 'tarefa' &&
             _relReleased.indexOf(i.id) !== -1 &&
             !(_relReleasedMeta[i.id] || {}).aula_number;
    }).length;

    html +=
      '<div class="ct-rel-aula-outer ct-rel-outros-outer">' +
        '<div class="ct-rel-aula-header">' +
          '<div class="ct-rel-aula-info">' +
            '<span class="ct-rel-aula-label ct-rel-outros-label">Outros</span>' +
            '<span class="ct-rel-aula-title">Materiais sem aula</span>' +
          '</div>' +
          '<div class="ct-rel-aula-meta">' +
            '<div class="ct-rel-aula-counts">' +
              (outrosSolo ? '<span class="ct-rel-count">📄 ' + outrosSolo + '</span>' : '<span class="ct-rel-count ct-rel-count-empty">vazio</span>') +
            '</div>' +
            '<span class="ct-rel-aula-chevron">&#8250;</span>' +
          '</div>' +
        '</div>' +
        '<div class="ct-rel-aula-composer"></div>' +
      '</div>';

    el.innerHTML = html;

    el.querySelectorAll('.ct-rel-aula-outer').forEach(function(outer) {
      var header   = outer.querySelector('.ct-rel-aula-header');
      var isOutros = outer.classList.contains('ct-rel-outros-outer');
      header.addEventListener('click', function() {
        var isOpen = header.classList.contains('open');
        el.querySelectorAll('.ct-rel-aula-header.open').forEach(function(h) {
          h.classList.remove('open');
          h.parentElement.querySelector('.ct-rel-aula-composer').innerHTML = '';
        });
        if (!isOpen) {
          header.classList.add('open');
          var composer = outer.querySelector('.ct-rel-aula-composer');
          if (isOutros) _renderOutrosComposer(composer);
          else _renderAulaComposer(composer, outer);
        }
      });
    });
  }

  function _renderAulaComposer(container, outer) {
    var aulaNum = parseInt(outer.dataset.aulaNum);
    var aula = _relAulas.find(function(a) { return String(a.id) === outer.dataset.aulaId; });
    if (!aula) return;

    // Three parallel pools sourced from the library: apostila (via set_id),
    // tarefa (type='tarefa'), and outros (everything else standalone).
    var tarefaItems = _relAllItems.filter(function(i) {
      return !i.set_id && i.type === 'tarefa';
    });
    var outrosItems = _relAllItems.filter(function(i) {
      return !i.set_id && i.type !== 'conteudo' && i.type !== 'tarefa';
    });

    function isBound(id) {
      return _relReleased.indexOf(id) !== -1 &&
             String((_relReleasedMeta[id] || {}).aula_number) === String(aulaNum);
    }

    var apostilaHtml = _apostilaItems.length
      ? _apostilaItems.map(function(i) {
          return '<label class="ct-comp-item">' +
            '<input type="checkbox" class="ct-comp-apostila-cb" value="' + i.id + '"' + (isBound(i.id) ? ' checked' : '') + '>' +
            '<span>' + (i.set_position ? _esc(String(i.set_position)) + '. ' : '') + _esc(i.title) + '</span>' +
          '</label>';
        }).join('')
      : '<div class="ct-comp-empty">Nenhum conteúdo importado.</div>';

    var tarefaHtml = tarefaItems.length
      ? tarefaItems.map(function(i) {
          return '<label class="ct-comp-item" data-title="' + _esc((i.title || '').toLowerCase()) + '">' +
            '<input type="checkbox" class="ct-comp-tarefa-cb" value="' + i.id + '"' + (isBound(i.id) ? ' checked' : '') + '>' +
            '<span>⚑ ' + _esc(i.title) + '</span>' +
          '</label>';
        }).join('')
      : '<div class="ct-comp-empty">Nenhuma tarefa cadastrada na biblioteca. Crie um item de tipo \'tarefa\' na aba Itens.</div>';

    var outrosHtml = outrosItems.length
      ? outrosItems.map(function(i) {
          var m = _typeMeta(i.type);
          return '<label class="ct-comp-item" data-title="' + _esc((i.title || '').toLowerCase()) + '">' +
            '<input type="checkbox" class="ct-comp-outros-cb" value="' + i.id + '"' + (isBound(i.id) ? ' checked' : '') + '>' +
            '<span>' + _esc(m.icon) + ' ' + _esc(i.title) + '</span>' +
          '</label>';
        }).join('')
      : '<div class="ct-comp-empty">Nenhum item na biblioteca.</div>';

    container.innerHTML =
      '<div class="ct-rel-aula-composer-body">' +
        '<div class="ct-comp-section">' +
          '<div class="ct-comp-section-label">Conteúdo do curso</div>' +
          '<div class="ct-comp-list">' + apostilaHtml + '</div>' +
        '</div>' +
        '<div class="ct-comp-section">' +
          '<div class="ct-comp-section-label">Tarefas</div>' +
          '<div class="ct-comp-list ct-comp-tarefa-list">' + tarefaHtml + '</div>' +
        '</div>' +
        '<div class="ct-comp-section">' +
          '<div class="ct-comp-section-label">Outros itens</div>' +
          '<input type="text" class="ct-comp-search" placeholder="Buscar...">' +
          '<div class="ct-comp-list ct-comp-outros-list">' + outrosHtml + '</div>' +
        '</div>' +
        '<div class="ct-comp-actions">' +
          '<button class="ct-btn ct-btn-primary ct-comp-save">Salvar</button>' +
        '</div>' +
      '</div>';

    var searchEl = container.querySelector('.ct-comp-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        var q = this.value.toLowerCase().trim();
        container.querySelectorAll('.ct-comp-outros-list .ct-comp-item').forEach(function(row) {
          row.style.display = (!q || (row.dataset.title || '').indexOf(q) !== -1) ? '' : 'none';
        });
      });
    }

    container.querySelector('.ct-comp-save').addEventListener('click', function() {
      _saveAulaComposer(container, aula, aulaNum, tarefaItems, outrosItems);
    });
  }

  function _renderOutrosComposer(container) {
    // Eligible for Outros: standalone items (set_id IS NULL, type !== 'apostila')
    // that are unreleased OR currently in Outros (no aula). Apostila items live
    // on the Apostila tab only and must not surface here even if set_id was
    // somehow not populated. Items bound to an aula are managed via that aula's
    // composer, not here.
    var standaloneItems = _relAllItems.filter(function(i) {
      if (i.set_id || i.type === 'conteudo' || i.type === 'tarefa') return false;
      var wasReleased = _relReleased.indexOf(i.id) !== -1;
      if (!wasReleased) return true;
      return !(_relReleasedMeta[i.id] || {}).aula_number;
    });

    var listHtml = standaloneItems.length
      ? standaloneItems.map(function(i) {
          var m = _typeMeta(i.type);
          var inOtros = _relReleased.indexOf(i.id) !== -1 && !(_relReleasedMeta[i.id] || {}).aula_number;
          return '<label class="ct-comp-item" data-title="' + _esc((i.title || '').toLowerCase()) + '">' +
            '<input type="checkbox" class="ct-comp-outros-cb" value="' + i.id + '"' + (inOtros ? ' checked' : '') + '>' +
            '<span>' + _esc(m.icon) + ' ' + _esc(i.title) + '</span>' +
          '</label>';
        }).join('')
      : '<div class="ct-comp-empty">Nenhum item disponível.</div>';

    container.innerHTML =
      '<div class="ct-rel-aula-composer-body">' +
        '<div class="ct-comp-section">' +
          '<div class="ct-comp-section-label">Itens sem aula</div>' +
          '<input type="text" class="ct-comp-search" placeholder="Buscar...">' +
          '<div class="ct-comp-list">' + listHtml + '</div>' +
        '</div>' +
        '<div class="ct-comp-actions">' +
          '<button class="ct-btn ct-btn-primary ct-comp-save">Salvar</button>' +
        '</div>' +
      '</div>';

    container.querySelector('.ct-comp-search').addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      container.querySelectorAll('.ct-comp-list .ct-comp-item').forEach(function(row) {
        row.style.display = (!q || (row.dataset.title || '').indexOf(q) !== -1) ? '' : 'none';
      });
    });

    container.querySelector('.ct-comp-save').addEventListener('click', function() {
      _saveOutrosComposer(container, standaloneItems);
    });
  }

  function _saveAulaComposer(container, aula, aulaNum, tarefaItems, outrosItems) {
    var btn = container.querySelector('.ct-comp-save');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    var nowApostila = new Set();
    container.querySelectorAll('.ct-comp-apostila-cb:checked').forEach(function(cb) { nowApostila.add(parseInt(cb.value)); });
    var nowTarefa = new Set();
    container.querySelectorAll('.ct-comp-tarefa-cb:checked').forEach(function(cb) { nowTarefa.add(parseInt(cb.value)); });
    var nowOutros = new Set();
    container.querySelectorAll('.ct-comp-outros-cb:checked').forEach(function(cb) { nowOutros.add(parseInt(cb.value)); });

    var toRelease = [], toSetAula = [], toDropAula = [];

    function classify(id, isChecked) {
      var wasReleased = _relReleased.indexOf(id) !== -1;
      var wasInAula   = wasReleased && String((_relReleasedMeta[id] || {}).aula_number) === String(aulaNum);
      if (isChecked && !wasInAula) {
        if (!wasReleased) toRelease.push(id);
        else toSetAula.push(id);
      } else if (!isChecked && wasInAula) {
        toDropAula.push(id);
      }
    }

    _apostilaItems.forEach(function(i) { classify(i.id, nowApostila.has(i.id)); });
    tarefaItems.forEach(function(i)    { classify(i.id, nowTarefa.has(i.id)); });
    outrosItems.forEach(function(i)    { classify(i.id, nowOutros.has(i.id)); });

    Promise.all(toRelease.map(function(id) {
      return callWorker({ action: 'ct_release_item', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: id });
    })).then(function() {
      var setAulaIds = toRelease.concat(toSetAula);
      var calls = setAulaIds.map(function(id) {
        return callWorker({ action: 'ct_set_release_aula', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: id, aula_number_or_null: aulaNum });
      }).concat(toDropAula.map(function(id) {
        return callWorker({ action: 'ct_set_release_aula', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: id, aula_number_or_null: null });
      }));
      return Promise.all(calls);
    }).then(function() {
      toRelease.forEach(function(id) { _relReleased.push(id); _relReleasedMeta[id] = { aula_number: aulaNum }; });
      toSetAula.forEach(function(id) { (_relReleasedMeta[id] || (_relReleasedMeta[id] = {})).aula_number = aulaNum; });
      toDropAula.forEach(function(id) { if (_relReleasedMeta[id]) _relReleasedMeta[id].aula_number = null; });
      _toast('Salvo.');
      _renderReleasesAulaList();
    }).catch(function(err) {
      btn.disabled = false;
      btn.textContent = 'Salvar';
      _toast('Erro: ' + (err.message || err));
    });
  }

  function _saveOutrosComposer(container, standaloneItems) {
    var btn = container.querySelector('.ct-comp-save');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    var nowChecked = new Set();
    container.querySelectorAll('.ct-comp-outros-cb:checked').forEach(function(cb) { nowChecked.add(parseInt(cb.value)); });

    var toRelease = [], toUnrelease = [];
    standaloneItems.forEach(function(i) {
      var inOtros = _relReleased.indexOf(i.id) !== -1 && !(_relReleasedMeta[i.id] || {}).aula_number;
      if (nowChecked.has(i.id) && _relReleased.indexOf(i.id) === -1) toRelease.push(i.id);
      else if (!nowChecked.has(i.id) && inOtros) toUnrelease.push(i.id);
    });

    Promise.all(
      toRelease.map(function(id) {
        return callWorker({ action: 'ct_release_item', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: id });
      }).concat(toUnrelease.map(function(id) {
        return callWorker({ action: 'ct_unrelease_item', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: id });
      }))
    ).then(function() {
      toRelease.forEach(function(id) { _relReleased.push(id); _relReleasedMeta[id] = { aula_number: null }; });
      toUnrelease.forEach(function(id) {
        var idx = _relReleased.indexOf(id);
        if (idx !== -1) _relReleased.splice(idx, 1);
        delete _relReleasedMeta[id];
      });
      _toast('Salvo.');
      _renderReleasesAulaList();
    }).catch(function(err) {
      btn.disabled = false;
      btn.textContent = 'Salvar';
      _toast('Erro: ' + (err.message || err));
    });
  }

  // ---- Tab switching ----

  // URL ?tab=<x>  ↔  internal panel id
  // The URL uses semantic Codex hub names that match the topbar labels;
  // panel ids retain their legacy names (panel-items, panel-clients, ...).
  // G redesign: liberações moved out of Turmas and into its own Conteúdo
  // sub-tab panel (panel-liberacoes). Turmas keeps its three-column layout
  // for Clientes / Turmas / Aulas.
  var URL_TO_INTERNAL = {
    turmas:     'clients',
    conteudo:   'items',
    apostila:   'apostila',
    tarefas:    'tarefas',
    drive:      'drive',
    presets:    'presets',
    liberacoes: 'liberacoes',
    // legacy aliases, anything that ever pointed at the old in-page tabs
    clients:    'clients',
    items:      'items',
    releases:   'liberacoes'
  };

  function _activatePanel(internalId) {
    document.querySelectorAll('.ct-panel').forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('panel-' + internalId);
    if (!panel) {
      // Defensive: unknown internalId (typo, dropped panel, stale URL). Fall
      // back to the default landing instead of leaving the user on a blank
      // page; a console.warn surfaces the bad id during development.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[CT_ADMIN] Unknown panel id "' + internalId + '"; falling back to clients.');
      }
      internalId = 'clients';
      panel = document.getElementById('panel-' + internalId);
    }
    if (panel) panel.classList.add('active');
    if (internalId === 'items')      _loadItems();
    if (internalId === 'apostila')   _loadApostila();
    if (internalId === 'tarefas')    _initTarefasPicker();
    // G redesign: landing on the Turmas three-column auto-restores the
    // last-selected turma into column 3 (sticky Aulas context).
    if (internalId === 'clients')    _restoreTurmaForAulas();
    // G redesign: Liberações is its own Conteúdo sub-tab. Boot the picker;
    // the picker auto-restores the last turma selection via LS_REL_CLIENT/TURMA.
    if (internalId === 'liberacoes') _initLiberacoesPicker();
    // drive + presets are Bundle I placeholders; they render their own static markup.
  }

  // G redesign: re-hydrate the Aulas column from localStorage so reloading
  // the page brings back the user's last turma. Silent no-op if nothing was
  // previously selected.
  function _restoreTurmaForAulas() {
    var savedClient = null, savedTurma = null;
    try {
      savedClient = localStorage.getItem(LS_REL_CLIENT);
      savedTurma  = localStorage.getItem(LS_REL_TURMA);
    } catch (_) {}
    if (!savedClient || !savedTurma) return;
    // Wait for clients to be loaded before driving column 1's selection;
    // CT_ADMIN.init() fires _loadClients() asynchronously. If clients aren't
    // ready yet, _renderClients (called when the fetch resolves) will set
    // the .selected class via _selectedClientSlug below.
    _selectedClientSlug = savedClient;
    _selectTurmaForAulas(savedClient, savedTurma);
  }

  function _initTabs() {
    // Bundle F: the in-page sub-tabs were retired. Sub-tab navigation is the
    // shared topbar's hybrid sub-row (full-page reloads, ?tab= carries the
    // active sub). We just parse the URL once on boot.
    var params = new URLSearchParams(location.search);
    var urlTab = params.get('tab') || 'conteudo';
    var initial = URL_TO_INTERNAL[urlTab] || 'clients';
    _activatePanel(initial);
  }

  // ---- Shared flat pill bar turma picker (Liberações + Tarefas tabs) ----

  var LS_REL_CLIENT = 'ct_admin_releases_last_client';
  var LS_REL_TURMA  = 'ct_admin_releases_last_turma';

  // Generic renderer: fetches clients + turmas, draws alphabetical pill bar,
  // persists selection per storage key, calls onSelect on click.
  // opts = { onSelect: (clientSlug, turmaSlug) => void,
  //          storageKey: { client: string, turma: string },
  //          autoRestore: bool }
  function _renderTurmaPickerInto(container, opts) {
    if (!container) return;
    opts = opts || {};
    var lsClient = opts.storageKey && opts.storageKey.client;
    var lsTurma  = opts.storageKey && opts.storageKey.turma;
    container.innerHTML = '<div class="ct-empty">Carregando turmas...</div>';

    callWorker({ action: 'ct_list_clients' }).then(function(data) {
      var clients = (data.clients || []).filter(function(c) { return c.status !== 'archived'; });
      if (!clients.length) {
        container.innerHTML = '<div class="ct-empty">Nenhum cliente cadastrado.</div>';
        return null;
      }
      return Promise.all(clients.map(function(c) {
        return callWorker({ action: 'ct_list_turmas', client_slug: c.slug }).then(function(td) {
          return {
            client: c,
            turmas: (td.turmas || []).filter(function(t) { return t.status !== 'archived'; })
          };
        });
      }));
    }).then(function(groups) {
      if (!groups) return;

      var entries = [];
      groups.forEach(function(g) {
        g.turmas.forEach(function(t) {
          entries.push({
            clientSlug: g.client.slug,
            clientName: g.client.display_name || g.client.name,
            turmaSlug:  t.slug,
            turmaName:  t.display_name || t.name
          });
        });
      });

      entries.sort(function(a, b) {
        var cmp = a.clientName.localeCompare(b.clientName, 'pt-BR', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.turmaName.localeCompare(b.turmaName, 'pt-BR', { sensitivity: 'base' });
      });

      if (!entries.length) {
        container.innerHTML = '<div class="ct-empty">Nenhuma turma cadastrada. Crie uma turma na aba Clientes.</div>';
        return;
      }

      var savedClient = lsClient ? localStorage.getItem(lsClient) : null;
      var savedTurma  = lsTurma  ? localStorage.getItem(lsTurma)  : null;

      container.innerHTML = entries.map(function(e) {
        var isActive = e.clientSlug === savedClient && e.turmaSlug === savedTurma;
        return '<button type="button" class="ct-turma-pill' + (isActive ? ' active' : '') + '"' +
          ' data-client="' + _esc(e.clientSlug) + '" data-turma="' + _esc(e.turmaSlug) + '">' +
          '<span class="ct-turma-pill-client">' + _esc(e.clientName) + '</span>' +
          '<span class="ct-turma-pill-sep">·</span>' +
          '<span>' + _esc(e.turmaName) + '</span>' +
        '</button>';
      }).join('');

      container.querySelectorAll('.ct-turma-pill').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var c = btn.dataset.client, t = btn.dataset.turma;
          container.querySelectorAll('.ct-turma-pill').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          if (lsClient) localStorage.setItem(lsClient, c);
          if (lsTurma)  localStorage.setItem(lsTurma, t);
          if (opts.onSelect) opts.onSelect(c, t);
        });
      });

      if (opts.autoRestore && container.querySelector('.ct-turma-pill.active') && opts.onSelect) {
        opts.onSelect(savedClient, savedTurma);
      }
    }).catch(function() {
      container.innerHTML = '<div class="ct-empty">Erro ao carregar turmas.</div>';
    });
  }

  // G redesign: Liberações lives in its own Conteúdo sub-tab now. The picker
  // here writes the same LS keys (LS_REL_CLIENT / LS_REL_TURMA) shared with
  // the Turmas-tab Aulas column, so a turma chosen in either surface persists
  // across tabs.
  function _initLiberacoesPicker() {
    _renderTurmaPickerInto(document.getElementById('rel-turma-picker'), {
      onSelect: function(c, t) { _loadReleases(c, t); },
      storageKey: { client: LS_REL_CLIENT, turma: LS_REL_TURMA },
      autoRestore: true
    });
  }

  // ==========================================================================
  // Phase 5: Tarefas tab (authoring + respostas)
  // ==========================================================================

  var LS_TAR_CLIENT = 'ct_admin_tarefas_last_client';
  var LS_TAR_TURMA  = 'ct_admin_tarefas_last_turma';
  var _tarClient = null;
  var _tarTurma = null;
  var _tarItems = [];
  var _tarItemTurmas = {};
  var _tarSubmissions = {};

  function _initTarefasPicker() {
    _renderTurmaPickerInto(document.getElementById('tarefas-turma-picker'), {
      onSelect: function(c, t) { _loadTarefasFor(c, t); },
      storageKey: { client: LS_TAR_CLIENT, turma: LS_TAR_TURMA },
      autoRestore: true
    });
  }

  function _loadTarefasFor(clientSlug, turmaSlug) {
    _tarClient = clientSlug;
    _tarTurma = turmaSlug;
    var listEl = document.getElementById('tarefas-list');
    var metaEl = document.getElementById('tarefas-section-meta');
    if (!listEl || !clientSlug || !turmaSlug) return;
    listEl.innerHTML = '<div class="ct-empty">Carregando tarefas...</div>';
    if (metaEl) metaEl.innerHTML = '';
    _tarSubmissions = {};

    callWorker({ action: 'ct_list_turmas', client_slug: clientSlug }).then(function(td) {
      var turma = (td.turmas || []).find(function(t) { return t.slug === turmaSlug; });
      if (!turma) throw new Error('turma não encontrada');
      return Promise.all([
        callWorker({ action: 'ct_list_items', type: 'tarefa' }),
        callWorker({
          action: 'ct_get_turma_view',
          client_slug: clientSlug,
          turma_slug: turmaSlug,
          token: turma.token
        })
      ]);
    }).then(function(results) {
      var allTarefas = (results[0].items || []).filter(function(i) { return i.type === 'tarefa'; });
      var view = results[1];
      var releaseMap = {};
      (view.items || []).forEach(function(i) {
        if (i.type === 'tarefa') releaseMap[i.id] = i.aula_number == null ? null : i.aula_number;
      });
      _tarItems = allTarefas
        .filter(function(i) { return Object.prototype.hasOwnProperty.call(releaseMap, i.id); })
        .map(function(i) { i._aula_number = releaseMap[i.id]; return i; });
      _tarItems.sort(function(a, b) {
        var av = a._aula_number == null ? 9999 : a._aula_number;
        var bv = b._aula_number == null ? 9999 : b._aula_number;
        if (av !== bv) return av - bv;
        return (a.title || '').localeCompare(b.title || '', 'pt-BR');
      });
      _renderTarefasList();
    }).catch(function(err) {
      listEl.innerHTML = '<div class="ct-empty">Erro ao carregar tarefas: ' + _esc(err.message || err) + '</div>';
    });
  }

  function _renderTarefasList() {
    var listEl = document.getElementById('tarefas-list');
    var metaEl = document.getElementById('tarefas-section-meta');
    if (!_tarItems.length) {
      listEl.innerHTML = '<div class="ct-empty">Nenhuma tarefa liberada para esta turma. Crie uma com "+ Nova tarefa" ou libere uma existente em Liberações.</div>';
      if (metaEl) metaEl.innerHTML = '';
      return;
    }
    if (metaEl) {
      metaEl.innerHTML = _tarItems.length + ' tarefa' + (_tarItems.length > 1 ? 's' : '') +
        ' liberada' + (_tarItems.length > 1 ? 's' : '') + ' para esta turma.';
    }
    listEl.innerHTML = _tarItems.map(_buildTarefaRowHtml).join('');
    listEl.querySelectorAll('.ct-tarefa-row').forEach(function(row) {
      var id = parseInt(row.dataset.itemId, 10);
      var head = row.querySelector('.ct-tarefa-head');
      head.addEventListener('click', function(e) {
        if (e.target.closest('button, a, input, textarea')) return;
        _toggleTarefaRow(row, id);
      });
    });
    _tarItems.forEach(function(item) {
      _fetchItemTurmas(item.id);
      _prefetchSubmissionCount(item.id);
    });
  }

  function _buildTarefaRowHtml(item) {
    var meta = _parseMeta(item.meta_json);
    var anonOk = !!meta.allow_anonymous;
    var aulaLabel = (item._aula_number != null) ? 'Aula ' + item._aula_number : 'Sem aula';
    var subCount = (_tarSubmissions[item.id] && _tarSubmissions[item.id].length) || 0;
    var countCls = subCount === 0 ? 'ct-tarefa-count zero' : 'ct-tarefa-count';
    var anonBlock = anonOk
      ? ''
      : '<span class="ct-tarefa-dot">·</span>' +
        '<span class="ct-tarefa-anon-badge">Identificação obrigatória</span>';
    return '<article class="ct-tarefa-row" data-item-id="' + item.id + '">' +
      '<div class="ct-tarefa-head">' +
        '<div class="ct-tarefa-icon">📋</div>' +
        '<div class="ct-tarefa-title-wrap">' +
          '<h3 class="ct-tarefa-title">' + _esc(item.title) + '</h3>' +
          '<div class="ct-tarefa-sub">' +
            '<span>' + _esc(aulaLabel) + '</span>' +
            '<span class="ct-tarefa-dot">·</span>' +
            '<span class="' + countCls + '" data-item="' + item.id + '">' +
              subCount + ' resposta' + (subCount === 1 ? '' : 's') +
            '</span>' +
            anonBlock +
            '<span class="ct-tarefa-dot">·</span>' +
            '<span class="ct-tarefa-reuse" data-item="' + item.id + '">…</span>' +
          '</div>' +
        '</div>' +
        '<span class="ct-tarefa-chev">▾</span>' +
      '</div>' +
      '<div class="ct-tarefa-body"></div>' +
    '</article>';
  }

  function _fetchItemTurmas(itemId) {
    if (_tarItemTurmas[itemId]) { _updateReuseLabel(itemId); return; }
    callWorker({ action: 'ct_list_item_turmas', item_id: itemId }).then(function(res) {
      _tarItemTurmas[itemId] = res.turmas || [];
      _updateReuseLabel(itemId);
    }).catch(function() {
      _tarItemTurmas[itemId] = [];
      _updateReuseLabel(itemId);
    });
  }

  function _updateReuseLabel(itemId) {
    var el = document.querySelector('.ct-tarefa-reuse[data-item="' + itemId + '"]');
    if (!el) return;
    var entries = (_tarItemTurmas[itemId] || []).filter(function(e) {
      return !(e.client_slug === _tarClient && e.turma_slug === _tarTurma) && e.turma_status !== 'archived';
    });
    if (!entries.length) {
      el.textContent = 'Exclusiva desta turma';
      el.className = 'ct-tarefa-reuse solo';
    } else {
      var labels = entries.map(function(e) {
        return e.client_display_name + ' · ' + e.turma_display_name;
      }).join(', ');
      el.textContent = 'Também em ' + labels;
      el.className = 'ct-tarefa-reuse multi';
      el.title = labels;
    }
    el.dataset.item = itemId;
  }

  function _prefetchSubmissionCount(itemId) {
    callWorker({
      action: 'ct_list_submissions',
      item_id: itemId,
      client_slug: _tarClient,
      turma_slug: _tarTurma
    }).then(function(res) {
      _tarSubmissions[itemId] = res.submissions || [];
      _updateSubmissionCount(itemId);
    }).catch(function() {});
  }

  function _updateSubmissionCount(itemId) {
    var el = document.querySelector('.ct-tarefa-count[data-item="' + itemId + '"]');
    if (!el) return;
    var cnt = (_tarSubmissions[itemId] || []).length;
    el.textContent = cnt + ' resposta' + (cnt === 1 ? '' : 's');
    el.classList.toggle('zero', cnt === 0);
  }

  function _toggleTarefaRow(row, itemId) {
    var alreadyExpanded = row.classList.contains('expanded');
    document.querySelectorAll('.ct-tarefa-row.expanded').forEach(function(r) {
      r.classList.remove('expanded');
      var body = r.querySelector('.ct-tarefa-body');
      if (body) body.innerHTML = '';
    });
    if (alreadyExpanded) return;

    row.classList.add('expanded');
    var body = row.querySelector('.ct-tarefa-body');
    body.innerHTML =
      '<div class="ct-tarefa-grid">' +
        '<div class="ct-tarefa-pane ct-tarefa-pane-editor" data-item="' + itemId + '">' +
          '<div class="ct-empty">Carregando...</div>' +
        '</div>' +
        '<div class="ct-tarefa-pane ct-tarefa-pane-resp" data-item="' + itemId + '">' +
          '<div class="ct-empty">Carregando respostas...</div>' +
        '</div>' +
      '</div>';

    callWorker({ action: 'ct_get_item', id: itemId }).then(function(res) {
      _renderTarefaEditor(body.querySelector('.ct-tarefa-pane-editor'), res.item);
    }).catch(function() {
      var pane = body.querySelector('.ct-tarefa-pane-editor');
      if (pane) pane.innerHTML = '<div class="ct-empty">Erro ao carregar conteúdo.</div>';
    });

    _loadSubmissions(itemId);
  }

  function _renderTarefaEditor(container, item) {
    var meta = _parseMeta(item.meta_json);
    var fieldType = meta.field_type || 'text';
    var allowAnon = !!meta.allow_anonymous;
    var fields = CTTarefaFields.list();

    var chipHtml = fields.map(function(f) {
      var cls = 'ct-tarefa-field-chip' +
        (f.slug === fieldType ? ' active' : '') +
        (f.disabled ? ' disabled' : '');
      var future = f.disabled ? '<span class="ct-tarefa-field-future">futuro</span>' : '';
      return '<button type="button" class="' + cls + '" data-slug="' + f.slug + '"' +
        (f.disabled ? ' disabled' : '') + '>' + _esc(f.label) + future + '</button>';
    }).join('');

    container.innerHTML =
      '<h4 class="ct-tarefa-pane-title">Conteúdo da tarefa</h4>' +
      '<div class="ct-field">' +
        '<label>Título</label>' +
        '<input type="text" class="ct-tf-title" value="' + _esc(item.title) + '">' +
      '</div>' +
      '<div class="ct-field">' +
        '<label>Instruções (markdown)</label>' +
        '<textarea class="ct-tf-body" rows="8">' + _esc(item.body_md || '') + '</textarea>' +
        '<p class="ct-helper-text">O aluno vê este texto acima do campo de resposta.</p>' +
      '</div>' +
      '<div class="ct-field">' +
        '<label>Tipo do campo de resposta</label>' +
        '<div class="ct-tarefa-field-chips">' + chipHtml + '</div>' +
        '<p class="ct-helper-text">Phase 5: só "Texto livre". Outros tipos chegam em fases futuras.</p>' +
      '</div>' +
      '<label class="ct-tarefa-anon-toggle">' +
        '<input type="checkbox" class="ct-tf-anon"' + (allowAnon ? ' checked' : '') + '>' +
        '<span class="ct-tarefa-anon-track"></span>' +
        '<span class="ct-tarefa-anon-label">Permitir envio anônimo</span>' +
        '<span class="ct-helper-text">Quando desligado, o aluno precisa informar o nome.</span>' +
      '</label>' +
      '<div class="ct-tarefa-editor-actions">' +
        '<button class="ct-btn ct-btn-primary ct-tf-save">Salvar alterações</button>' +
        '<button class="ct-btn ct-tf-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-danger ct-tf-delete">Excluir tarefa</button>' +
      '</div>';

    container.querySelectorAll('.ct-tarefa-field-chip:not(.disabled)').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.ct-tarefa-field-chip').forEach(function(b) {
          if (!b.disabled) b.classList.remove('active');
        });
        btn.classList.add('active');
      });
    });

    container.querySelector('.ct-tf-save').addEventListener('click', function() {
      _saveTarefa(container, item);
    });
    container.querySelector('.ct-tf-cancel').addEventListener('click', function() {
      var row = container.closest('.ct-tarefa-row');
      if (!row) return;
      row.classList.remove('expanded');
      var body = row.querySelector('.ct-tarefa-body');
      if (body) body.innerHTML = '';
    });
    container.querySelector('.ct-tf-delete').addEventListener('click', function() {
      _deleteTarefaWithConfirm(item);
    });
  }

  function _saveTarefa(container, item) {
    var title = container.querySelector('.ct-tf-title').value.trim();
    var body  = container.querySelector('.ct-tf-body').value;
    var anon  = container.querySelector('.ct-tf-anon').checked;
    var slugBtn = container.querySelector('.ct-tarefa-field-chip.active');
    var fieldType = slugBtn ? slugBtn.dataset.slug : 'text';
    if (!title) { _toast('Título obrigatório.'); return; }
    var meta = _parseMeta(item.meta_json);
    meta.allow_anonymous = anon;
    meta.field_type = fieldType;
    callWorker({
      action: 'ct_update_item',
      id: item.id,
      title: title,
      body_md: body,
      meta_json: JSON.stringify(meta)
    }).then(function() {
      _toast('Tarefa atualizada.');
      item.title = title;
      item.body_md = body;
      item.meta_json = JSON.stringify(meta);
      var libItem = _tarItems.find(function(i) { return i.id === item.id; });
      if (libItem) {
        libItem.title = title;
        libItem.meta_json = item.meta_json;
      }
      var row = container.closest('.ct-tarefa-row');
      if (row) {
        var titleEl = row.querySelector('.ct-tarefa-title');
        if (titleEl) titleEl.textContent = title;
        var anonEl = row.querySelector('.ct-tarefa-anon-badge');
        if (anon) {
          // Anonymous allowed: remove the badge and its preceding separator dot if present.
          if (anonEl) {
            var prevDot = anonEl.previousElementSibling;
            if (prevDot && prevDot.classList.contains('ct-tarefa-dot')) prevDot.remove();
            anonEl.remove();
          }
        } else if (!anonEl) {
          // Identification required and no badge yet: insert dot + badge before the trailing reuse element.
          var reuseEl = row.querySelector('.ct-tarefa-reuse');
          if (reuseEl) {
            var trailingDot = reuseEl.previousElementSibling;
            var dotEl = document.createElement('span');
            dotEl.className = 'ct-tarefa-dot';
            dotEl.textContent = '·';
            var badgeEl = document.createElement('span');
            badgeEl.className = 'ct-tarefa-anon-badge';
            badgeEl.textContent = 'Identificação obrigatória';
            reuseEl.parentNode.insertBefore(dotEl, trailingDot);
            reuseEl.parentNode.insertBefore(badgeEl, trailingDot);
          }
        }
      }
    }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
  }

  function _deleteTarefaWithConfirm(item) {
    var html =
      '<div class="ct-modal ct-tarefa-delete-modal">' +
        '<div class="ct-modal-title">Excluir tarefa?</div>' +
        '<p>Esta ação remove a tarefa da biblioteca e <strong>apaga todas as respostas</strong> recebidas, em qualquer turma. Não pode ser desfeita.</p>' +
        '<p>Para confirmar, digite o título exato da tarefa:</p>' +
        '<p class="ct-tarefa-delete-title-quote">' + _esc(item.title) + '</p>' +
        '<input type="text" class="ct-tf-del-input" placeholder="Digite o título exato">' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn ct-tf-del-cancel">Cancelar</button>' +
          '<button class="ct-btn ct-btn-danger ct-tf-del-confirm" disabled>Excluir tarefa</button>' +
        '</div>' +
      '</div>';
    var bd = _openModal(html);
    var input = bd.querySelector('.ct-tf-del-input');
    var btn = bd.querySelector('.ct-tf-del-confirm');
    input.addEventListener('input', function() {
      btn.disabled = (input.value !== item.title);
    });
    bd.querySelector('.ct-tf-del-cancel').addEventListener('click', _closeModal);
    btn.addEventListener('click', function() {
      if (input.value !== item.title) return;
      callWorker({ action: 'ct_delete_item', id: item.id }).then(function() {
        _closeModal();
        _toast('Tarefa excluída.');
        _loadTarefasFor(_tarClient, _tarTurma);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  function _loadSubmissions(itemId) {
    callWorker({
      action: 'ct_list_submissions',
      item_id: itemId,
      client_slug: _tarClient,
      turma_slug: _tarTurma
    }).then(function(res) {
      _tarSubmissions[itemId] = res.submissions || [];
      _renderSubmissions(itemId);
      _updateSubmissionCount(itemId);
    }).catch(function() {
      var pane = document.querySelector('.ct-tarefa-pane-resp[data-item="' + itemId + '"]');
      if (pane) pane.innerHTML = '<div class="ct-empty">Erro ao carregar respostas.</div>';
    });
  }

  function _renderSubmissions(itemId) {
    var pane = document.querySelector('.ct-tarefa-pane-resp[data-item="' + itemId + '"]');
    if (!pane) return;
    var subs = _tarSubmissions[itemId] || [];
    var count = subs.length;
    pane.innerHTML =
      '<h4 class="ct-tarefa-pane-title">Respostas (' + count + ')</h4>' +
      '<div class="ct-resp-toolbar">' +
        '<input type="text" class="ct-resp-search" placeholder="Buscar por nome ou conteúdo...">' +
        '<button class="ct-btn ct-btn-sm ct-resp-export"' + (count === 0 ? ' disabled' : '') + '>Exportar CSV</button>' +
      '</div>' +
      '<div class="ct-resp-list">' +
        (count === 0
          ? '<div class="ct-resp-empty">Nenhuma resposta ainda. As respostas dos alunos aparecem aqui assim que enviadas pelo /trilha.</div>'
          : subs.map(_renderSubmissionCard).join('')
        ) +
      '</div>';

    pane.querySelectorAll('.ct-resp-card-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sid = parseInt(btn.dataset.sid, 10);
        _deleteSubmissionWithConfirm(sid, itemId);
      });
    });
    pane.querySelectorAll('.ct-resp-card-copy').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sid = parseInt(btn.dataset.sid, 10);
        var s = (_tarSubmissions[itemId] || []).find(function(x) { return x.id === sid; });
        if (!s) return;
        var v = CTTarefaFields.get(s.answer_type || 'text').toCsvValue(s.answer_json);
        _copyTextSmall(v, btn);
      });
    });
    pane.querySelectorAll('.ct-resp-card-expand').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var card = btn.closest('.ct-resp-card');
        if (!card) return;
        card.classList.toggle('expanded');
        btn.textContent = card.classList.contains('expanded') ? 'Recolher' : 'Ver completa';
      });
    });

    var search = pane.querySelector('.ct-resp-search');
    if (search) {
      search.addEventListener('input', function() {
        var q = (search.value || '').toLowerCase().trim();
        pane.querySelectorAll('.ct-resp-card').forEach(function(card) {
          var hay = (card.dataset.search || '').toLowerCase();
          card.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
        });
      });
    }

    var exportBtn = pane.querySelector('.ct-resp-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        var item = _tarItems.find(function(i) { return i.id === itemId; });
        _exportSubmissionsCsv(item, subs);
      });
    }
  }

  function _renderSubmissionCard(s) {
    var field = CTTarefaFields.get(s.answer_type || 'text');
    var who = s.student_name ? _esc(s.student_name) : '<em>Anônimo</em>';
    var whoCls = s.student_name ? 'ct-resp-who' : 'ct-resp-who anon';
    var when = _formatTs(s.submitted_at);
    var content = field.renderStored(s.answer_json);
    var rawText = field.toCsvValue(s.answer_json);
    var searchHay = (s.student_name || '') + ' ' + rawText;
    return '<div class="ct-resp-card" data-search="' + _esc(searchHay) + '">' +
      '<div class="ct-resp-meta">' +
        '<span class="' + whoCls + '">' + who + '</span>' +
        '<span class="ct-resp-when">' + when + '</span>' +
      '</div>' +
      '<div class="ct-resp-body">' + content + '</div>' +
      '<div class="ct-resp-actions">' +
        '<button class="ct-btn ct-btn-sm ct-resp-card-expand">Ver completa</button>' +
        '<button class="ct-btn ct-btn-sm ct-resp-card-copy" data-sid="' + s.id + '">Copiar</button>' +
        '<button class="ct-btn ct-btn-sm ct-btn-danger ct-resp-card-delete" data-sid="' + s.id + '">Apagar</button>' +
      '</div>' +
    '</div>';
  }

  function _deleteSubmissionWithConfirm(submissionId, itemId) {
    if (!confirm('Apagar esta resposta? Não pode ser desfeito.')) return;
    callWorker({ action: 'ct_delete_submission', id: submissionId }).then(function() {
      _toast('Resposta apagada.');
      _loadSubmissions(itemId);
    }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
  }

  function _formatTs(unix) {
    if (!unix) return '';
    var d = new Date(unix * 1000);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function _exportSubmissionsCsv(item, subs) {
    if (!item || !subs || !subs.length) return;
    var rows = [['Aluno', 'Data', 'Tipo', 'Resposta']];
    subs.forEach(function(s) {
      var field = CTTarefaFields.get(s.answer_type || 'text');
      rows.push([
        s.student_name || 'Anônimo',
        _formatTs(s.submitted_at),
        s.answer_type || 'text',
        field.toCsvValue(s.answer_json)
      ]);
    });
    var csv = rows.map(function(r) { return r.map(_csvCell).join(','); }).join('\r\n');
    var blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var slug = (item.title || 'tarefa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = 'tarefa-' + (slug || 'tarefa') + '-respostas.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function _csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function _copyTextSmall(text, btn) {
    function flash() {
      var orig = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(function() { btn.textContent = orig; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        flash();
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      flash();
    }
  }

  function _parseMeta(metaJson) {
    if (!metaJson) return {};
    if (typeof metaJson !== 'string') return metaJson || {};
    try { return JSON.parse(metaJson) || {}; } catch (_) { return {}; }
  }

  function _openNewTarefaModal() {
    if (!_tarClient || !_tarTurma) {
      _toast('Selecione uma turma antes de criar uma tarefa.');
      return;
    }
    var html =
      '<div class="ct-modal">' +
        '<div class="ct-modal-title">Nova tarefa</div>' +
        '<div class="ct-field"><label>Título</label>' +
          '<input type="text" id="nt-title" placeholder="Ex.: Análise de cláusula contratual abusiva">' +
        '</div>' +
        '<div class="ct-field"><label>Aula (opcional)</label>' +
          '<input type="number" id="nt-aula" placeholder="Número da aula, em branco se não aplicável">' +
        '</div>' +
        '<div class="ct-field"><label>Instruções (markdown)</label>' +
          '<textarea id="nt-body" rows="6" placeholder="O que o aluno deve fazer..."></textarea>' +
        '</div>' +
        '<label class="ct-tarefa-anon-toggle">' +
          '<input type="checkbox" id="nt-anon">' +
          '<span class="ct-tarefa-anon-track"></span>' +
          '<span class="ct-tarefa-anon-label">Permitir envio anônimo</span>' +
        '</label>' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="nt-cancel">Cancelar</button>' +
          '<button class="ct-btn ct-btn-primary" id="nt-save">Criar e liberar</button>' +
        '</div>' +
      '</div>';
    var bd = _openModal(html);
    bd.querySelector('#nt-cancel').addEventListener('click', _closeModal);
    bd.querySelector('#nt-save').addEventListener('click', function() {
      var title = bd.querySelector('#nt-title').value.trim();
      var body  = bd.querySelector('#nt-body').value;
      var aula  = bd.querySelector('#nt-aula').value.trim();
      var anon  = bd.querySelector('#nt-anon').checked;
      if (!title) { _toast('Título obrigatório.'); return; }
      var meta = { allow_anonymous: anon, field_type: 'text' };
      callWorker({
        action: 'ct_create_item',
        type: 'tarefa',
        title: title,
        body_md: body,
        meta_json: JSON.stringify(meta)
      }).then(function(res) {
        var item = res.item;
        return callWorker({
          action: 'ct_release_item',
          client_slug: _tarClient,
          turma_slug: _tarTurma,
          item_id: item.id
        }).then(function() {
          if (aula) {
            return callWorker({
              action: 'ct_set_release_aula',
              client_slug: _tarClient,
              turma_slug: _tarTurma,
              item_id: item.id,
              aula_number_or_null: parseInt(aula, 10)
            });
          }
        });
      }).then(function() {
        _closeModal();
        _toast('Tarefa criada e liberada.');
        _loadTarefasFor(_tarClient, _tarTurma);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  // ---- Acessos (settings drawer section) ----

  function _accessSectionHtml() {
    return (
      '<div class="ct-access-wrap">' +
        '<div class="ct-access-actions">' +
          '<button type="button" class="bs-toggle-btn" id="ct-access-admin-toggle">Carregando…</button>' +
          '<button type="button" class="bs-toggle-btn" id="ct-access-clear">Limpar log</button>' +
        '</div>' +
        '<div class="ct-access-summary" id="ct-access-summary">Carregando…</div>' +
        '<div class="ct-access-recent-label">Últimos acessos</div>' +
        '<div class="ct-access-recent" id="ct-access-recent"></div>' +
        '<p class="bs-hint" style="margin-top:0.5rem">Acessos públicos são logados pelo Worker. Marcar este dispositivo como admin (mesma origem, mesmo browser) faz as próximas visitas à <code>/trilha</code> ignorarem o log.</p>' +
      '</div>'
    );
  }

  function _syncAdminFlagBtn() {
    var btn = document.getElementById('ct-access-admin-toggle');
    if (!btn) return;
    var on = false;
    try { on = localStorage.getItem('ct_is_admin') === '1'; } catch (_) {}
    btn.textContent = on ? '✓ Este dispositivo é admin (clique para remover)' : 'Marcar este dispositivo como admin';
    btn.style.color = on ? 'var(--primary)' : '';
    btn.style.borderColor = on ? 'var(--primary)' : '';
  }

  function _initAccessActions() {
    var toggleBtn = document.getElementById('ct-access-admin-toggle');
    var clearBtn  = document.getElementById('ct-access-clear');
    if (toggleBtn && !toggleBtn.dataset.wired) {
      toggleBtn.dataset.wired = '1';
      toggleBtn.addEventListener('click', function() {
        var on = false;
        try { on = localStorage.getItem('ct_is_admin') === '1'; } catch (_) {}
        try {
          if (on) localStorage.removeItem('ct_is_admin');
          else    localStorage.setItem('ct_is_admin', '1');
        } catch (_) {}
        _syncAdminFlagBtn();
      });
    }
    if (clearBtn && !clearBtn.dataset.wired) {
      clearBtn.dataset.wired = '1';
      clearBtn.addEventListener('click', function() {
        if (!confirm('Apagar todos os registros de acesso? Não há como desfazer.')) return;
        clearBtn.disabled = true;
        clearBtn.textContent = 'Apagando…';
        callWorker({ action: 'ct_clear_access_log' }).then(function(res) {
          var n = (res && res.deleted) || 0;
          _toast('Log limpo (' + n + ' ' + (n === 1 ? 'registro' : 'registros') + ').');
          _renderAccessLog();
        }).catch(function(err) {
          _toast('Erro: ' + (err.message || err));
        }).then(function() {
          clearBtn.disabled = false;
          clearBtn.textContent = 'Limpar log';
        });
      });
    }
  }

  function _fmtAccessTime(iso) {
    if (!iso) return '';
    // D1 CURRENT_TIMESTAMP returns 'YYYY-MM-DD HH:MM:SS' (UTC). Convert to local.
    var d = new Date(iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return iso;
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return 'hoje ' + hh + ':' + mm;
    var dd = String(d.getDate()).padStart(2, '0');
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mo + ' ' + hh + ':' + mm;
  }

  function _renderAccessLog() {
    _initAccessActions();
    _syncAdminFlagBtn();
    var summary = document.getElementById('ct-access-summary');
    var recent  = document.getElementById('ct-access-recent');
    if (!summary || !recent) return;
    summary.textContent = 'Carregando…';
    recent.innerHTML = '';
    callWorker({ action: 'ct_get_access_log', limit: 100 }).then(function(res) {
      var counts = (res && res.counts) || [];
      var rows   = (res && res.rows)   || [];
      if (!counts.length) {
        summary.textContent = 'Nenhum acesso registrado ainda.';
        return;
      }
      summary.innerHTML = counts.map(function(c) {
        return (
          '<div class="ct-access-row">' +
            '<div class="ct-access-turma">' +
              '<span class="ct-access-client">' + _esc(c.client_name) + '</span>' +
              ' · ' +
              '<span class="ct-access-turma-name">' + _esc(c.turma_name) + '</span>' +
            '</div>' +
            '<div class="ct-access-meta">' +
              '<span class="ct-access-hits">' + c.hits + ' ' + (c.hits === 1 ? 'visita' : 'visitas') + '</span>' +
              '<span class="ct-access-last">último: ' + _esc(_fmtAccessTime(c.last_at)) + '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');
      recent.innerHTML = rows.map(function(r) {
        return (
          '<div class="ct-access-recent-row">' +
            '<span class="ct-access-recent-time">' + _esc(_fmtAccessTime(r.accessed_at)) + '</span>' +
            '<span class="ct-access-recent-turma">' + _esc(r.client_name) + ' · ' + _esc(r.turma_name) + '</span>' +
          '</div>'
        );
      }).join('');
    }).catch(function(err) {
      summary.textContent = 'Erro ao carregar: ' + (err.message || err);
    });
  }

  // ---- Public API ----

  return {
    init: function() {
      // Kick off types+tags before activating the initial panel so that
      // landing directly on ?tab=conteudo has type/tag data ready for
      // _renderItems on first paint.
      Promise.all([_loadTypes(), _loadTags()]).then(_initTabs);
      document.getElementById('btn-new-client').addEventListener('click', function() { _openClientForm(null); });
      document.getElementById('btn-new-turma').addEventListener('click', function() { _openTurmaForm(null); });
      document.getElementById('btn-new-item').addEventListener('click', function() { _openItemEditor(null); });
      var newTarefaBtn = document.getElementById('btn-new-tarefa');
      if (newTarefaBtn) newTarefaBtn.addEventListener('click', _openNewTarefaModal);
      var manageTagsBtn = document.getElementById('btn-manage-tags');
      if (manageTagsBtn) manageTagsBtn.addEventListener('click', _openTagManager);
      var selectModeBtn = document.getElementById('btn-select-mode');
      if (selectModeBtn) selectModeBtn.addEventListener('click', function() {
        if (_selectMode) CT_ADMIN.exitSelectMode();
        else CT_ADMIN.enterSelectMode();
      });
      var bulkDeleteBtn = document.getElementById('btn-bulk-delete');
      if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', function() { CT_ADMIN.bulkDeleteItems(); });
      var bulkCancelBtn = document.getElementById('btn-bulk-cancel');
      if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', function() { CT_ADMIN.exitSelectMode(); });
      var importGdocBtn = document.getElementById('btn-import-gdoc');
      if (importGdocBtn) importGdocBtn.addEventListener('click', function() {
        _openGdocIngestModal(function() {
          _loadApostila();
          _loadItems({ silent: true });
        });
      });
      var deleteSetBtn = document.getElementById('btn-delete-set');
      if (deleteSetBtn) deleteSetBtn.addEventListener('click', _deleteApostilaSet);
      _loadClients();
    },

    openTagManager: _openTagManager,

    accessSectionHtml: _accessSectionHtml,
    renderAccessLog: _renderAccessLog,

    editClient: function(slug) {
      var client = _clients.find(function(c) { return c.slug === slug; });
      if (client) _openClientForm(client);
    },

    archiveClient: function(slug) {
      if (!confirm('Arquivar este cliente? As turmas existentes continuarão acessíveis até serem arquivadas individualmente.')) return;
      callWorker({ action: 'ct_archive_client', slug: slug }).then(function() {
        _toast('Cliente arquivado.');
        _loadClients();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    },

    editTurma: function(id) {
      var turma = _turmas.find(function(t) { return t.id === id; });
      if (turma) _openTurmaForm(turma);
    },

    editTurmaTo: function(id, scrollTo) {
      var turma = _turmas.find(function(t) { return t.id === id; });
      if (turma) _openTurmaForm(turma, scrollTo);
    },

    archiveTurma: function(clientSlug, turmaSlug) {
      if (!confirm('Arquivar esta turma? O link de acesso para os alunos parará de funcionar.')) return;
      callWorker({ action: 'ct_archive_turma', client_slug: clientSlug, slug: turmaSlug }).then(function() {
        _toast('Turma arquivada.');
        _loadTurmas(clientSlug);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    },

    regenerateToken: function(clientSlug, turmaSlug) {
      if (!confirm('Regenerar token? O link atual dos alunos parará de funcionar imediatamente.')) return;
      callWorker({ action: 'ct_regenerate_turma_token', client_slug: clientSlug, slug: turmaSlug }).then(function() {
        _toast('Token regenerado. Compartilhe o novo link com os alunos.');
        _loadTurmas(clientSlug);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    },

    copyTurmaUrl: function(url) {
      navigator.clipboard.writeText(url).then(function() { _toast('Link copiado!'); }).catch(function() {
        prompt('Copie o link:', url);
      });
    },

    openItem: function(id) {
      callWorker({ action: 'ct_get_item', id: id }).then(function(data) {
        _openItemEditor(data.item);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    },

    deleteItem: function(id) {
      if (!confirm('Excluir este item? Ele será removido de todas as turmas onde está liberado.')) return;
      // Optimistic surgical delete: remove from local cache + DOM node, no
      // full re-render (avoids the screen flash on every delete).
      var idNum = Number(id);
      var idx = _items.findIndex(function(it) { return Number(it.id) === idNum; });
      var snapshot = idx >= 0 ? _items[idx] : null;
      if (idx >= 0) {
        _items.splice(idx, 1);
        _removeItemFromDom(idNum);
      }
      callWorker({ action: 'ct_delete_item', id: id, _silent: true }).then(function() {
        _toast('Item excluído.');
      }).catch(function(err) {
        if (snapshot) {
          _items.splice(idx, 0, snapshot);
          _renderItems();
        }
        _toast('Erro: ' + (err.message || err));
      });
    },

    duplicateItem: function(id) {
      callWorker({ action: 'ct_duplicate_item', id: id, _silent: true }).then(function(data) {
        if (data && data.item) {
          _items.push(data.item);
          _renderItems();
          _toast('Item duplicado.');
        }
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    },

    enterSelectMode: function() {
      _selectMode = true;
      _selectedIds.clear();
      _renderItems();
      _updateBulkBar();
    },

    exitSelectMode: function() {
      _selectMode = false;
      _selectedIds.clear();
      _renderItems();
      _updateBulkBar();
    },

    toggleItemSelection: function(id) {
      var idNum = Number(id);
      if (_selectedIds.has(idNum)) _selectedIds.delete(idNum);
      else _selectedIds.add(idNum);
      var row = document.querySelector('.ct-item-row[data-item-id="' + idNum + '"]');
      if (row) {
        row.classList.toggle('ct-item-row-selected', _selectedIds.has(idNum));
        var cb = row.querySelector('.ct-item-checkbox');
        if (cb) cb.checked = _selectedIds.has(idNum);
      }
      _updateBulkBar();
    },

    bulkDeleteItems: function() {
      var ids = Array.from(_selectedIds);
      if (!ids.length) { _toast('Nenhum item selecionado.'); return; }
      if (!confirm('Excluir ' + ids.length + ' item(ns)? Eles serão removidos de todas as turmas onde estão liberados.')) return;
      // Optimistic: remove from cache + DOM surgically
      ids.forEach(function(id) {
        var idNum = Number(id);
        var idx = _items.findIndex(function(it) { return Number(it.id) === idNum; });
        if (idx >= 0) _items.splice(idx, 1);
        _removeItemFromDom(idNum);
      });
      _selectedIds.clear();
      _selectMode = false;
      _updateBulkBar();
      callWorker({ action: 'ct_delete_items_bulk', ids: ids, _silent: true }).then(function() {
        _toast(ids.length + ' item(ns) excluído(s).');
      }).catch(function(err) {
        _toast('Erro: ' + (err.message || err));
        _loadItems();
      });
    },

    deleteApostilaItem: function(id) {
      _deleteApostilaItem(id);
    }
  };
})();
