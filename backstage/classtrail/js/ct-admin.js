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

  function _toast(msg, duration) {
    var t = document.createElement('div');
    t.className = 'ct-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, duration || 2500);
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

  function _renderTypeOptions(selectedSlug) {
    var opts = _types.map(function(t) {
      var sel = t.slug === selectedSlug ? ' selected' : '';
      var icon = t.icon ? t.icon + ' ' : '';
      return '<option value="' + _esc(t.slug) + '"' + sel + '>' + _esc(icon + t.label) + '</option>';
    }).join('');
    // Preserve unregistered types so opening an item with type='material' (etc.)
    // doesn't silently downgrade to the first registered type on save.
    if (selectedSlug && !_types.find(function(t) { return t.slug === selectedSlug; })) {
      opts = '<option value="' + _esc(selectedSlug) + '" selected>' + _esc(selectedSlug) + ' (não registrado)</option>' + opts;
    }
    return opts + '<option value="__new__">+ Criar novo tipo...</option>';
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
      title.textContent = 'Turmas — ' + (client.display_name || client.name);
      btn.style.display = '';
    }
    _loadTurmas(slug);
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
    var bd = _openModal(html, { disableBackdropClose: true });

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
      var archived = t.status === 'archived' ? ' <span class="ct-badge archived">Arquivada</span>' : '';
      var aulaCount = t.aula_count || 0;
      var aulaLabel = aulaCount === 0 ? 'Nenhuma aula ainda' : 'Aulas: ' + aulaCount;
      var wpOk = !!(t.whatsapp_url);
      var wpLabel = wpOk ? 'WhatsApp ✓' : 'WhatsApp não definido';
      var cpOk = !!(t.classpulse_session_id);
      var cpLabel = cpOk ? 'ClassPulse ✓' : 'ClassPulse não definido';
      return '<div class="ct-card" data-id="' + t.id + '">' +
        '<div class="ct-card-name">' + _esc(t.display_name || t.name) + archived + '</div>' +
        '<div class="ct-card-meta">' + _esc(t.client_slug) + ' / ' + _esc(t.slug) + '</div>' +
        '<div class="ct-url-row">' +
          '<a class="ct-url-text" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + _esc(url) + '">' + _esc(url) + '</a>' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.copyTurmaUrl(\'' + _esc(url) + '\')">Copiar</button>' +
        '</div>' +
        '<div class="ct-turma-chips">' +
          '<button class="ct-turma-chip' + (aulaCount > 0 ? ' ok' : '') + '" onclick="CT_ADMIN.editTurmaTo(' + t.id + ',\'aulas\')">' + _esc(aulaLabel) + '</button>' +
          '<button class="ct-turma-chip' + (wpOk ? ' ok' : '') + '" onclick="CT_ADMIN.editTurmaTo(' + t.id + ',\'whatsapp\')">' + _esc(wpLabel) + '</button>' +
          '<button class="ct-turma-chip' + (cpOk ? ' ok' : '') + '" onclick="CT_ADMIN.editTurmaTo(' + t.id + ',\'classpulse\')">' + _esc(cpLabel) + '</button>' +
        '</div>' +
        '<div class="ct-card-actions">' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.editTurma(' + t.id + ')">Editar</button>' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.regenerateToken(\'' + _esc(t.client_slug) + '\',\'' + _esc(t.slug) + '\')">Regenerar token</button>' +
          (t.status !== 'archived' ? '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="CT_ADMIN.archiveTurma(\'' + _esc(t.client_slug) + '\',\'' + _esc(t.slug) + '\')">Arquivar</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
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
        (isEdit ? _renderAulasSection(turma) : '') +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="tf-cancel">Cancelar</button>' +
          '<button class="ct-btn ct-btn-primary" id="tf-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
        '</div>' +
      '</div>';

      var bd = _openModal(html, { disableBackdropClose: true });

      // Scroll to a specific section after modal opens
      function _scrollModalTo(targetId) {
        var modal = bd.querySelector('.ct-modal');
        var el = bd.querySelector('#' + targetId);
        if (modal && el) {
          setTimeout(function() { el.scrollIntoView({ block: 'nearest' }); modal.scrollTop = el.offsetTop - 16; }, 80);
        }
      }

      // Load aulas for existing turma
      if (isEdit) {
        _loadAulasIntoForm(bd, turma.client_slug, turma.slug);
        if (scrollTo === 'aulas') { setTimeout(function() { _scrollModalTo('tf-aulas-section'); }, 200); }
      }

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

  // ---- Aulas section (inside turma edit) ----

  function _renderAulasSection(turma) {
    return '<div class="ct-aulas-section" id="tf-aulas-section">' +
      '<div class="ct-aulas-header">' +
        '<span class="ct-aulas-title">Aulas desta turma</span>' +
        '<button type="button" class="ct-btn ct-btn-sm ct-btn-primary" id="tf-add-aula">+ Nova aula</button>' +
      '</div>' +
      '<div id="tf-aulas-list"><div class="ct-empty">Carregando aulas...</div></div>' +
    '</div>';
  }

  function _loadAulasIntoForm(bd, clientSlug, turmaSlug) {
    callWorker({ action: 'ct_list_aulas', client_slug: clientSlug, turma_slug: turmaSlug }).then(function(d) {
      var aulas = d.aulas || [];
      _renderAulaRows(bd, aulas, clientSlug, turmaSlug);
    }).catch(function() {
      var el = bd.querySelector('#tf-aulas-list');
      if (el) el.innerHTML = '<div class="ct-empty">Erro ao carregar aulas.</div>';
    });
  }

  function _renderAulaRows(bd, aulas, clientSlug, turmaSlug) {
    var container = bd.querySelector('#tf-aulas-list');
    if (!container) return;

    function render(list) {
      if (!list.length) {
        container.innerHTML = '<div class="ct-empty">Nenhuma aula. Clique em "+ Nova aula" para adicionar.</div>';
      } else {
        container.innerHTML = list.map(_buildAulaRowHtml).join('');
        _wireAulaRowEvents(bd, container, list, clientSlug, turmaSlug);
      }
    }

    render(aulas);

    var addBtn = bd.querySelector('#tf-add-aula');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var nums = aulas.map(function(a) { return a.aula_number || 0; });
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
        aulas.push(newAula);
        render(aulas);
        var modal = bd.querySelector('.ct-modal');
        if (modal) modal.scrollTop = modal.scrollHeight;
      });
    }
  }

  function _buildAulaRowHtml(a) {
    // Tarefa is no longer a field on the aula itself; tarefas are managed in
    // the Liberações composer as items of type='tarefa' released to the aula.
    return '<div class="ct-aula-row" data-aula-id="' + _esc(a.id || '') + '" data-is-new="' + (a._isNew ? '1' : '0') + '">' +
      '<div class="ct-aula-num-label">Aula ' + _esc(a.aula_number) + '</div>' +
      '<div class="ct-aula-row-grid">' +
        '<div class="ct-field">' +
          '<label>Título</label>' +
          '<input type="text" class="aula-title" value="' + _esc(a.title || '') + '" placeholder="Título da aula">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Agendada para</label>' +
          '<input type="date" class="aula-scheduled" value="' + _esc(a.scheduled_for || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Ocorreu em</label>' +
          '<input type="date" class="aula-happened" value="' + _esc(a.happened_on || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Remarcada de (data original)</label>' +
          '<input type="date" class="aula-rescheduled-from" value="' + _esc(a.rescheduled_from || '') + '">' +
        '</div>' +
        '<div class="ct-field">' +
          '<label>Nota de remarcação (opcional)</label>' +
          '<input type="text" class="aula-rescheduled-note" value="' + _esc(a.rescheduled_note || '') + '" placeholder="Ex: Feriado nacional">' +
        '</div>' +
      '</div>' +
      '<div class="ct-aula-actions">' +
        '<button type="button" class="ct-btn ct-btn-sm ct-btn-danger aula-delete-btn">Excluir</button>' +
        '<button type="button" class="ct-btn ct-btn-sm ct-btn-primary aula-save-btn">Salvar aula</button>' +
      '</div>' +
    '</div>';
  }

  function _wireAulaRowEvents(bd, container, aulas, clientSlug, turmaSlug) {
    container.querySelectorAll('.ct-aula-row').forEach(function(row, idx) {
      var aula = aulas[idx];

      var saveBtn = row.querySelector('.aula-save-btn');
      var deleteBtn = row.querySelector('.aula-delete-btn');

      saveBtn.addEventListener('click', function() {
        // topics_json is intentionally omitted; the Worker preserves the existing value
        // when the param is absent. Topics auto-fill from apostila releases now.
        var payload = {
          client_slug: clientSlug,
          turma_slug: turmaSlug,
          aula_number: aula.aula_number,
          title: row.querySelector('.aula-title').value.trim(),
          scheduled_for: row.querySelector('.aula-scheduled').value || null,
          happened_on: row.querySelector('.aula-happened').value || null,
          rescheduled_from: row.querySelector('.aula-rescheduled-from').value || null,
          rescheduled_note: row.querySelector('.aula-rescheduled-note').value.trim() || null
        };
        var isNew = row.dataset.isNew === '1' || aula._isNew;
        if (isNew) {
          callWorker(Object.assign({ action: 'ct_create_aula' }, payload)).then(function(res) {
            var created = res.aula || res;
            if (created && created.id) {
              aula.id = created.id;
              aula._isNew = false;
              row.dataset.aulaId = created.id;
              row.dataset.isNew = '0';
            }
            _toast('Aula criada.');
          }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
        } else {
          callWorker(Object.assign({ action: 'ct_update_aula', id: aula.id }, payload)).then(function() {
            _toast('Aula salva.');
          }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
        }
      });

      deleteBtn.addEventListener('click', function() {
        var isNew = row.dataset.isNew === '1' || aula._isNew;
        if (isNew) {
          // Not yet saved, just remove from DOM and local array
          aulas.splice(idx, 1);
          _renderAulaRows(bd, aulas, clientSlug, turmaSlug);
          return;
        }
        if (!confirm('Excluir aula ' + aula.aula_number + '? Os itens liberados para ela perderão a associação.')) return;
        callWorker({ action: 'ct_delete_aula', id: aula.id }).then(function() {
          aulas.splice(idx, 1);
          _renderAulaRows(bd, aulas, clientSlug, turmaSlug);
          _toast('Aula excluída.');
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
    CT_TYPE_FILTER.render({
      container:    fc,
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
    var html = '<div class="ct-editor">' +
      '<div class="ct-editor-header">' +
        '<span class="ct-editor-title">Novo item · 1 de 2</span>' +
        '<button class="ct-btn ct-btn-sm" id="cf-close">Fechar</button>' +
      '</div>' +
      '<div class="ct-editor-body">' +
        '<div class="ct-field">' +
          '<label>Cole ou escreva seu conteúdo</label>' +
          '<textarea id="cf-raw" rows="10" placeholder="Cole aqui o texto do prompt, exemplo, exercício, dica..."></textarea>' +
        '</div>' +
        '<div class="ct-gdoc-row">' +
          '<span class="ct-helper-text">ou importe de um Google Docs:</span>' +
          '<div class="ct-gdoc-inline">' +
            '<input type="text" id="cf-gdoc-url" placeholder="URL do Google Docs..." style="flex:1;min-width:0">' +
            '<button class="ct-btn ct-btn-sm" id="cf-gdoc-load" type="button">Carregar</button>' +
          '</div>' +
          '<p class="ct-helper-text" id="cf-gdoc-hint">O documento deve estar compartilhado como "Qualquer pessoa com o link pode visualizar".</p>' +
        '</div>' +
        '<div class="ct-emoji-toggle-row">' +
          '<label class="ct-toggle-label">' +
            '<span class="ct-toggle">' +
              '<input type="checkbox" id="cf-emoji-toggle" checked>' +
              '<span class="ct-toggle-slider"></span>' +
            '</span>' +
            '<span class="ct-toggle-text">Adicionar emojis quando ajudar</span>' +
          '</label>' +
          '<p class="ct-helper-text">* Se o conteúdo for um prompt para IA, ele será mantido exatamente como está, sem alterações.</p>' +
        '</div>' +
      '</div>' +
      '<div class="ct-editor-footer">' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="cf-cancel">Cancelar</button>' +
          '<button class="ct-btn" id="cf-manual" type="button">Continuar manualmente</button>' +
          '<button class="ct-btn ct-btn-primary" id="cf-ai" type="button">&#9889; Formatar com IA</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html, { disableBackdropClose: true });
    bd.querySelector('#cf-raw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') e.stopPropagation();
    });
    bd.querySelector('#cf-close').addEventListener('click', _closeModal);
    bd.querySelector('#cf-cancel').addEventListener('click', _closeModal);

    // GDoc single-item loader: fetches body_md and pastes it into the raw textarea
    bd.querySelector('#cf-gdoc-load').addEventListener('click', function() {
      var url = bd.querySelector('#cf-gdoc-url').value.trim();
      if (!url) { _toast('Informe a URL do Google Docs.'); return; }
      var btn = bd.querySelector('#cf-gdoc-load');
      btn.disabled = true;
      btn.textContent = 'Carregando...';
      callWorker({ action: 'ct_ingest_gdoc', url: url, mode: 'single' }).then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Carregar';
        if (res && res.preview && res.preview.body_md) {
          var rawEl = bd.querySelector('#cf-raw');
          rawEl.value = res.preview.body_md;
          rawEl.focus();
          _toast('Conteúdo importado. Revise e formate com IA.');
        } else {
          _toast('Documento importado, mas sem conteúdo reconhecível.');
        }
      }).catch(function(err) {
        btn.disabled = false;
        btn.textContent = 'Carregar';
        _toast('Erro ao importar: ' + (err.message || err));
      });
    });

    bd.querySelector('#cf-manual').addEventListener('click', function() {
      var raw = bd.querySelector('#cf-raw').value;
      _closeModal();
      _openItemEditorFull(null, { body_md: raw }, null);
    });

    bd.querySelector('#cf-ai').addEventListener('click', async function() {
      var raw = bd.querySelector('#cf-raw').value.trim();
      if (!raw) { _toast('Cole ou digite seu conteúdo primeiro.'); return; }
      var addEmojis = bd.querySelector('#cf-emoji-toggle').checked;
      var btn = this;
      var prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '&#9889; Gerando...';
      try {
        var systemPrompt = CT_AI_SPEC.buildSystemPrompt(_types, _tags, { addEmojis: addEmojis });
        var res = await AIClient.generate({
          action: 'ai_chat',
          system: systemPrompt,
          messages: [{ role: 'user', content: raw }],
          temperature: 0.3,
          max_tokens: CT_AI_SPEC.MAX_TOKENS
        });
        if (!res || !res.text) { _toast('IA não retornou conteúdo. Tente continuar manualmente.'); return; }
        var parsed = CT_AI_SPEC.parseModelJson(res.text);
        if (!parsed || !parsed.body_md) {
          _toast('IA retornou em formato inesperado. Tente continuar manualmente.');
          return;
        }
        parsed = CT_AI_SPEC.enforcePromptVerbatim(parsed, raw);
        if (parsed.type !== 'prompt' && CT_AI_SPEC.looksTruncated(raw, parsed.body_md)) {
          if (!confirm('A IA parece ter encurtado o texto significativamente. Usar mesmo assim?\n\nClique em Cancelar para tentar de novo ou continuar manualmente.')) return;
        }
        _closeModal();
        var tagIds = await _tagsByLabels(parsed.tag_labels || []);
        _openItemEditorFull(null, {
          title:    parsed.title    || '',
          summary:  parsed.summary  || '',
          type:     parsed.type     || (_types[0] && _types[0].slug),
          body_md:  parsed.body_md  || raw,
          tag_ids:  tagIds
        }, {
          rawInput:    raw,
          firstOutput: parsed,
          addEmojis:   addEmojis
        });
      } catch (e) {
        _toast('Erro: ' + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
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
    var src = prefill || item || {};
    var initialType = src.type || (isEdit ? item.type : null) || (_types[0] && _types[0].slug) || 'prompt';
    var initialTitle   = src.title   != null ? src.title   : '';
    var initialSummary = src.summary != null ? src.summary : '';
    var initialBody    = src.body_md != null ? src.body_md : '';
    var initialMeta    = (isEdit && item.meta_json) ? (typeof item.meta_json === 'string' ? JSON.parse(item.meta_json) : item.meta_json) : {};
    var initialTagIds = Array.isArray(src.tag_ids)
      ? src.tag_ids
      : (isEdit && Array.isArray(item.tags) ? item.tags.map(function(t) { return t.id; }) : []);
    var initialAudience = (src.audience != null ? src.audience : (isEdit && item.audience ? item.audience : 'public'));
    if (initialAudience !== 'public' && initialAudience !== 'vault_only') initialAudience = 'public';

    var refazerBtn = aiContext
      ? '<button class="ct-btn" id="ie-refazer-btn" type="button">&#9889; Refazer com IA</button>'
      : '';

    var html = '<div class="ct-editor">' +
      '<div class="ct-editor-header">' +
        '<span class="ct-editor-title">' + (isEdit ? 'Editar item' : 'Novo item · 2 de 2') + '</span>' +
        '<button class="ct-btn ct-btn-sm" id="ie-close">Fechar</button>' +
      '</div>' +
      '<div class="ct-editor-body">' +
        '<div class="ct-field"><label>Título</label>' +
          '<input type="text" id="ie-title" value="' + _esc(initialTitle) + '" placeholder="Título do item">' +
        '</div>' +
        '<div class="ct-field"><label>Tipo</label>' +
          '<select id="ie-type">' + _renderTypeOptions(initialType) + '</select>' +
        '</div>' +
        '<div class="ct-field"><label>Resumo</label>' +
          '<input type="text" id="ie-summary" value="' + _esc(initialSummary) + '" placeholder="Uma linha descrevendo o item">' +
        '</div>' +
        '<div class="ct-field"><label>Tags</label>' +
          '<div class="ct-tag-picker" id="ie-tag-picker"></div>' +
        '</div>' +
        '<div class="ct-field"><label>Audiência</label>' +
          '<div class="ct-audience-picker">' +
            '<label class="ct-audience-opt"><input type="radio" name="ie-audience" value="public"' + (initialAudience === 'public' ? ' checked' : '') + '> ' +
              '<span class="ct-audience-opt-label">Pública</span>' +
              '<span class="ct-audience-opt-hint">aparece na trilha do aluno</span>' +
            '</label>' +
            '<label class="ct-audience-opt"><input type="radio" name="ie-audience" value="vault_only"' + (initialAudience === 'vault_only' ? ' checked' : '') + '> ' +
              '<span class="ct-audience-opt-label">Vault only</span>' +
              '<span class="ct-audience-opt-hint">só visível no ClassVault do professor</span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div id="ie-type-block"></div>' +
      '</div>' +
      '<div class="ct-editor-footer">' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="ie-cancel">Cancelar</button>' +
          refazerBtn +
          '<button class="ct-btn ct-btn-primary" id="ie-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var bd = _openModal(html, { disableBackdropClose: true });
    var selectedTagIds = new Set(initialTagIds);

    // Pending file for asset upload (set by type-specific blocks)
    var _pendingAssetFile = null;
    var _pendingAssetField = null; // 'attachment_url' or 'pdf_url'

    var typeSel = bd.querySelector('#ie-type');
    var lastTypeValue = initialType;

    function renderTypeBlock(typeSlug) {
      var block = bd.querySelector('#ie-type-block');
      block.innerHTML = _buildTypeBlock(typeSlug, initialBody, initialMeta, isEdit ? item : null);
      _wireTypeBlockEvents(block, typeSlug, function(file, field) {
        _pendingAssetFile = file;
        _pendingAssetField = field;
      });
    }

    renderTypeBlock(initialType);

    typeSel.addEventListener('change', function() {
      if (typeSel.value === '__new__') {
        _openTypeCreateForm(function(newSlug) {
          if (newSlug) {
            typeSel.innerHTML = _renderTypeOptions(newSlug);
            lastTypeValue = newSlug;
            renderTypeBlock(newSlug);
          } else {
            typeSel.value = lastTypeValue;
          }
        });
        return;
      }
      lastTypeValue = typeSel.value;
      renderTypeBlock(typeSel.value);
    });

    _renderTagPicker(bd.querySelector('#ie-tag-picker'), selectedTagIds);

    bd.querySelector('#ie-close').addEventListener('click', _closeModal);
    bd.querySelector('#ie-cancel').addEventListener('click', _closeModal);

    if (aiContext) {
      bd.querySelector('#ie-refazer-btn').addEventListener('click', async function() {
        var btn = this;
        var prev = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '&#9889; Refazendo...';
        try {
          var currentTagIds = Array.from(selectedTagIds);
          var currentTagLabels = currentTagIds.map(function(id) {
            var t = _tags.find(function(x) { return x.id === id; });
            return t ? t.label : null;
          }).filter(Boolean);

          var bodyEl = bd.querySelector('#ie-body');
          var current = {
            title:      bd.querySelector('#ie-title').value.trim(),
            summary:    bd.querySelector('#ie-summary').value.trim(),
            type:       bd.querySelector('#ie-type').value,
            body_md:    bodyEl ? bodyEl.value : '',
            tag_labels: currentTagLabels
          };
          var diff = CT_AI_SPEC.computeEditDiff(aiContext.firstOutput, current);
          var systemPrompt = CT_AI_SPEC.buildRefineSystemPrompt({ addEmojis: aiContext.addEmojis });
          var userMsg = CT_AI_SPEC.buildRefineUserMessage(aiContext.rawInput, aiContext.firstOutput, diff);

          var res = await AIClient.generate({
            action:      'ai_chat',
            system:      systemPrompt,
            messages:    [{ role: 'user', content: userMsg }],
            temperature: 0.3,
            max_tokens:  CT_AI_SPEC.MAX_TOKENS
          });
          if (!res || !res.text) { _toast('IA não retornou conteúdo.'); return; }
          var parsed = CT_AI_SPEC.parseModelJson(res.text);
          if (!parsed || !parsed.body_md) { _toast('IA retornou formato inesperado.'); return; }
          parsed = CT_AI_SPEC.enforcePromptVerbatim(parsed, aiContext.rawInput);

          aiContext.firstOutput = parsed;

          bd.querySelector('#ie-title').value   = parsed.title   || '';
          bd.querySelector('#ie-summary').value = parsed.summary || '';
          if (parsed.type) bd.querySelector('#ie-type').value = parsed.type;
          if (bodyEl) bodyEl.value = parsed.body_md || '';
          var newTagIds = await _tagsByLabels(parsed.tag_labels || []);
          selectedTagIds.clear();
          newTagIds.forEach(function(id) { selectedTagIds.add(id); });
          _renderTagPicker(bd.querySelector('#ie-tag-picker'), selectedTagIds);
          var pre = bd.querySelector('#ie-preview');
          if (pre && pre.style.display !== 'none') _renderMarkdown(parsed.body_md || '', pre);
          _toast('Item refeito.');
        } catch (e) {
          _toast('Erro: ' + (e.message || e));
        } finally {
          btn.disabled = false;
          btn.innerHTML = prev;
        }
      });
    }

    bd.querySelector('#ie-save').addEventListener('click', async function() {
      var title = bd.querySelector('#ie-title').value.trim();
      var type = typeSel.value;
      if (type === '__new__') { _toast('Selecione um tipo.'); return; }
      var summary = bd.querySelector('#ie-summary').value.trim();
      if (!title) { _toast('Título obrigatório.'); return; }

      // Collect type-specific fields
      var typeData = _collectTypeData(bd, type);
      var body_md = typeData.body_md;
      var meta_json = typeData.meta_json;

      var audienceEl = bd.querySelector('input[name="ie-audience"]:checked');
      var audience = audienceEl ? audienceEl.value : 'public';

      var action = isEdit ? 'ct_update_item' : 'ct_create_item';
      var params = {
        action: action,
        type: type,
        title: title,
        summary: summary || null,
        body_md: body_md,
        meta_json: meta_json ? JSON.stringify(meta_json) : null,
        tag_ids: Array.from(selectedTagIds),
        audience: audience
      };
      if (isEdit) params.id = item.id;

      try {
        var saveRes = await callWorker(params);
        var savedId = isEdit ? item.id : (saveRes && saveRes.id ? saveRes.id : saveRes && saveRes.item ? saveRes.item.id : null);

        // Handle pending asset upload
        if (_pendingAssetFile && savedId) {
          var progressEl = bd.querySelector('.ct-upload-progress');
          if (progressEl) progressEl.textContent = 'Enviando arquivo...';
          var b64 = await _readFileAsBase64(_pendingAssetFile);
          var uploadRes = await callWorker({
            action: 'ct_upload_asset',
            item_id: savedId,
            filename: _pendingAssetFile.name,
            content_b64: b64
          });
          var assetUrl = uploadRes && uploadRes.url;
          if (assetUrl && _pendingAssetField) {
            var updatedMeta = Object.assign({}, meta_json || {});
            updatedMeta[_pendingAssetField] = assetUrl;
            await callWorker({
              action: 'ct_update_item',
              id: savedId,
              meta_json: JSON.stringify(updatedMeta)
            });
          }
          if (progressEl) progressEl.textContent = '';
          var filenameEl = bd.querySelector('.ct-upload-filename');
          if (filenameEl) filenameEl.textContent = _pendingAssetFile.name;
        }

        _closeModal();
        _toast(isEdit ? 'Item atualizado.' : 'Item criado.');
        _loadItems({ silent: true });
        _loadTags();
      } catch (err) {
        _toast('Erro: ' + (err.message || err));
      }
    });
  }

  // ---- Type-specific editor blocks ----

  function _buildTypeBlock(typeSlug, body_md, meta, existingItem) {
    var m = meta || {};
    var hasBody = '<div class="ct-field"><label>Corpo em Markdown</label>' +
      '<textarea id="ie-body" rows="10" placeholder="Conteúdo do item em Markdown...">' + _esc(body_md || '') + '</textarea>' +
      '<div class="ct-editor-toolbar">' +
        '<button class="ct-btn ct-btn-sm" id="ie-preview-btn" type="button">Visualizar preview</button>' +
      '</div>' +
      '<div class="ct-preview-area" id="ie-preview" style="display:none"></div>' +
    '</div>';

    if (typeSlug === 'prompt') {
      return '<div class="ct-type-block">' + hasBody + '</div>';
    }

    if (typeSlug === 'guide') {
      var hasPlatformTabs = !!(m.platform_tabs);
      return '<div class="ct-type-block">' +
        hasBody +
        '<div class="ct-field">' +
          '<label class="ct-toggle-label" style="font-size:0.82rem;text-transform:none;letter-spacing:normal">' +
            '<span class="ct-toggle">' +
              '<input type="checkbox" id="ie-platform-toggle"' + (hasPlatformTabs ? ' checked' : '') + '>' +
              '<span class="ct-toggle-slider"></span>' +
            '</span>' +
            '<span> Plataformas separadas (Windows, Mac, Linux)</span>' +
          '</label>' +
        '</div>' +
        '<div id="ie-platform-tabs-wrap" style="display:' + (hasPlatformTabs ? '' : 'none') + '">' +
          '<div class="ct-platform-tabs">' +
            '<div class="ct-field"><label>Windows</label>' +
              '<textarea id="ie-pt-windows" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.windows) || '') + '</textarea>' +
            '</div>' +
            '<div class="ct-field"><label>Mac</label>' +
              '<textarea id="ie-pt-mac" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.mac) || '') + '</textarea>' +
            '</div>' +
            '<div class="ct-field"><label>Linux</label>' +
              '<textarea id="ie-pt-linux" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.linux) || '') + '</textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    if (typeSlug === 'material') {
      return '<div class="ct-type-block">' +
        hasBody +
        '<div class="ct-field"><label>Arquivo anexo (PNG, JPG, PDF, opcional)</label>' +
          '<div class="ct-upload-row">' +
            '<input type="file" id="ie-material-file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf">' +
            '<span class="ct-upload-progress"></span>' +
          '</div>' +
          (m.attachment_url ? '<div class="ct-upload-filename">Arquivo atual: <a href="' + _esc(m.attachment_url) + '" target="_blank" rel="noopener">visualizar</a></div>' : '') +
        '</div>' +
      '</div>';
    }

    if (typeSlug === 'paper') {
      return '<div class="ct-type-block">' +
        '<div class="ct-field"><label>Autores</label>' +
          '<input type="text" id="ie-paper-authors" value="' + _esc(m.authors || '') + '" placeholder="Ex: Silva, J.; Santos, M.">' +
        '</div>' +
        '<div class="ct-field"><label>Ano</label>' +
          '<input type="number" id="ie-paper-year" value="' + _esc(m.year || '') + '" placeholder="2024" min="1900" max="2099">' +
        '</div>' +
        '<div class="ct-field"><label>Resumo (abstract)</label>' +
          '<textarea id="ie-paper-abstract" rows="4" placeholder="Resumo do artigo...">' + _esc(m.abstract || '') + '</textarea>' +
        '</div>' +
        '<div class="ct-field"><label>PDF do artigo</label>' +
          '<div class="ct-upload-row">' +
            '<input type="file" id="ie-paper-pdf" accept=".pdf,application/pdf">' +
            '<span class="ct-upload-progress"></span>' +
          '</div>' +
          (m.pdf_url ? '<div class="ct-upload-filename">PDF atual: <a href="' + _esc(m.pdf_url) + '" target="_blank" rel="noopener">visualizar</a></div>' : '') +
        '</div>' +
        '<div class="ct-field"><label>Conteúdo complementar (Markdown, opcional)</label>' +
          '<textarea id="ie-body" rows="6" placeholder="Notas, contexto ou resumo expandido...">' + _esc(body_md || '') + '</textarea>' +
        '</div>' +
      '</div>';
    }

    if (typeSlug === 'model_info') {
      return '<div class="ct-type-block">' +
        '<div class="ct-field"><label>Provedor</label>' +
          '<input type="text" id="ie-mi-provider" value="' + _esc(m.provider || '') + '" placeholder="Ex: Anthropic">' +
        '</div>' +
        '<div class="ct-field"><label>ID do modelo</label>' +
          '<input type="text" id="ie-mi-model-id" value="' + _esc(m.model_id || '') + '" placeholder="Ex: claude-opus-4-5">' +
        '</div>' +
        '<div class="ct-field"><label>Janela de contexto (tokens)</label>' +
          '<input type="number" id="ie-mi-context" value="' + _esc(m.context_window || '') + '" placeholder="200000">' +
        '</div>' +
        '<div class="ct-field"><label>Pontos fortes (um por linha)</label>' +
          '<textarea id="ie-mi-strengths" rows="4" placeholder="Raciocínio avançado&#10;Geração de código&#10;Multilíngue">' + _esc(Array.isArray(m.strengths) ? m.strengths.join('\n') : (m.strengths || '')) + '</textarea>' +
        '</div>' +
        '<div class="ct-field"><label>URL da documentação</label>' +
          '<input type="text" id="ie-mi-doc-url" value="' + _esc(m.doc_url || '') + '" placeholder="https://...">' +
        '</div>' +
      '</div>';
    }

    // Fallback: generic body editor (handles unknown types the same way as prompt)
    return '<div class="ct-type-block">' + hasBody + '</div>';
  }

  function _wireTypeBlockEvents(block, typeSlug, onFileSelected) {
    // Preview button (prompt + guide + material fallback)
    var previewBtn = block.querySelector('#ie-preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', function() {
        var pre = block.querySelector('#ie-preview');
        var bodyEl = block.querySelector('#ie-body');
        if (!pre || !bodyEl) return;
        if (pre.style.display === 'none') {
          pre.style.display = '';
          _renderMarkdown(bodyEl.value, pre);
          previewBtn.textContent = 'Fechar preview';
        } else {
          pre.style.display = 'none';
          previewBtn.textContent = 'Visualizar preview';
        }
      });
    }

    // Textarea Enter key fix
    block.querySelectorAll('textarea').forEach(function(ta) {
      ta.addEventListener('keydown', function(e) { if (e.key === 'Enter') e.stopPropagation(); });
    });

    // Platform tabs toggle (guide)
    var platformToggle = block.querySelector('#ie-platform-toggle');
    if (platformToggle) {
      platformToggle.addEventListener('change', function() {
        var wrap = block.querySelector('#ie-platform-tabs-wrap');
        if (wrap) wrap.style.display = platformToggle.checked ? '' : 'none';
      });
    }

    // File input (material)
    var materialFile = block.querySelector('#ie-material-file');
    if (materialFile) {
      materialFile.addEventListener('change', function() {
        var f = materialFile.files[0];
        if (f) onFileSelected(f, 'attachment_url');
      });
    }

    // File input (paper)
    var paperPdf = block.querySelector('#ie-paper-pdf');
    if (paperPdf) {
      paperPdf.addEventListener('change', function() {
        var f = paperPdf.files[0];
        if (f) onFileSelected(f, 'pdf_url');
      });
    }
  }

  function _collectTypeData(bd, typeSlug) {
    var body_md = '';
    var meta_json = null;

    var bodyEl = bd.querySelector('#ie-body');
    if (bodyEl) body_md = bodyEl.value;

    if (typeSlug === 'prompt') {
      // body_md is all we need; no meta
    } else if (typeSlug === 'guide') {
      var platformToggle = bd.querySelector('#ie-platform-toggle');
      if (platformToggle && platformToggle.checked) {
        meta_json = {
          platform_tabs: {
            windows: (bd.querySelector('#ie-pt-windows') || {}).value || '',
            mac:     (bd.querySelector('#ie-pt-mac') || {}).value || '',
            linux:   (bd.querySelector('#ie-pt-linux') || {}).value || ''
          }
        };
      }
    } else if (typeSlug === 'material') {
      // attachment_url set after upload; preserve existing if present
      meta_json = {};
    } else if (typeSlug === 'paper') {
      meta_json = {
        authors:  (bd.querySelector('#ie-paper-authors') || {}).value || null,
        year:     (bd.querySelector('#ie-paper-year') || {}).value || null,
        abstract: (bd.querySelector('#ie-paper-abstract') || {}).value || null
      };
    } else if (typeSlug === 'model_info') {
      var strengthsEl = bd.querySelector('#ie-mi-strengths');
      var strengthsArr = strengthsEl
        ? strengthsEl.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean)
        : [];
      meta_json = {
        provider:       (bd.querySelector('#ie-mi-provider') || {}).value || null,
        model_id:       (bd.querySelector('#ie-mi-model-id') || {}).value || null,
        context_window: (bd.querySelector('#ie-mi-context') || {}).value || null,
        strengths:      strengthsArr,
        doc_url:        (bd.querySelector('#ie-mi-doc-url') || {}).value || null
      };
      body_md = ''; // model_info has no body_md
    }

    return { body_md: body_md, meta_json: meta_json };
  }

  // ---- Tag picker (single-row chips + inline "+ tag" button) ----

  function _renderTagPicker(container, selectedTagIds) {
    function render() {
      var chips = _tags.map(function(t) {
        var active = selectedTagIds.has(t.id);
        return '<button type="button" class="ct-tag-chip' + (active ? ' active' : '') +
          '" data-id="' + t.id + '">' + _esc(t.label) + '</button>';
      }).join('');
      container.innerHTML =
        '<div class="ct-tag-chip-row">' + chips +
          '<button type="button" class="ct-tag-add-chip">+ tag</button>' +
        '</div>';

      container.querySelectorAll('.ct-tag-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = parseInt(btn.dataset.id);
          if (selectedTagIds.has(id)) selectedTagIds.delete(id);
          else selectedTagIds.add(id);
          btn.classList.toggle('active');
        });
      });

      var addBtn = container.querySelector('.ct-tag-add-chip');
      addBtn.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'ct-tag-add-input';
        input.placeholder = 'nome da tag';
        addBtn.replaceWith(input);
        input.focus();
        function commit() {
          var label = input.value.trim();
          if (!label) { render(); return; }
          callWorker({ action: 'ct_create_tag', label: label }).then(function(res) {
            if (res && res.tag) {
              if (!_tags.find(function(x) { return x.id === res.tag.id; })) {
                _tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
                _tags.sort(function(a, b) { return a.label.localeCompare(b.label, 'pt-BR'); });
              }
              selectedTagIds.add(res.tag.id);
            }
            render();
          }).catch(function(err) {
            _toast('Erro: ' + (err.message || err));
            render();
          });
        }
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
          else if (e.key === 'Escape') { render(); }
        });
        input.addEventListener('blur', commit);
      });
    }
    render();
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

  function _renderMarkdown(md, container) {
    if (window.marked) {
      container.innerHTML = window.marked.parse(md);
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    s.onload = function() { container.innerHTML = window.marked.parse(md); };
    document.head.appendChild(s);
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

  function _initTabs() {
    document.querySelectorAll('.ct-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var id = tab.dataset.tab;
        document.querySelectorAll('.ct-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.ct-panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var panel = document.getElementById('panel-' + id);
        if (panel) panel.classList.add('active');
        if (id === 'items') _loadItems();
        if (id === 'apostila') _loadApostila();
        if (id === 'tarefas') _initTarefasPicker();
        if (id === 'releases') _initTurmaPicker();
      });
    });
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

  function _initTurmaPicker() {
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
            '<span class="ct-tarefa-dot">·</span>' +
            '<span class="ct-tarefa-anon-badge">' + (anonOk ? 'Anônimo permitido' : 'Identificação obrigatória') + '</span>' +
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
        if (anonEl) anonEl.textContent = anon ? 'Anônimo permitido' : 'Identificação obrigatória';
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
      _initTabs();
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
      _loadTypes();
      _loadTags();
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
