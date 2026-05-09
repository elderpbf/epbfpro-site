'use strict';

window.CT_ADMIN = (function() {

  // ---- State ----
  var _clients = [];
  var _selectedClientSlug = null;
  var _turmas = [];
  var _items = [];
  var _types = []; // [{slug, label, icon, sort_order}]
  var _tags  = []; // [{id, label, item_count}]
  var _relItems = [];
  var _relReleased = []; // [{item_id, position}]
  var _relClientSlug = null;
  var _relTurmaSlug = null;

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
    prompt: '💬',     // 💬
    exemplo: '✨',           // ✨
    exercicio: '📝',  // 📝
    dica: '💡',        // 💡
    leitura: '📖',     // 📖
    video: '🎬',       // 🎬
    link: '🔗'         // 🔗
  };

  function _typeMeta(slug) {
    var t = _types.find(function(x) { return x.slug === slug; });
    if (t) return { label: t.label, icon: t.icon || TYPE_ICON_FALLBACK[slug] || '📄' };
    return { label: slug || 'item', icon: TYPE_ICON_FALLBACK[slug] || '📄' };
  }

  function _renderTypeOptions(selectedSlug) {
    var opts = _types.map(function(t) {
      var sel = t.slug === selectedSlug ? ' selected' : '';
      return '<option value="' + _esc(t.slug) + '"' + sel + '>' + _esc(t.label) + '</option>';
    }).join('');
    return opts + '<option value="__new__">+ Criar novo tipo...</option>';
  }

  function _turmaUrl(clientSlug, turmaSlug, token) {
    return _baseUrl() + '/trilha/' + clientSlug + '/' + turmaSlug + '?k=' + token;
  }

  // ---- Modal helpers ----

  function _openModal(html) {
    var bd = document.createElement('div');
    bd.className = 'ct-modal-backdrop';
    bd.innerHTML = html;
    bd.addEventListener('click', function(e) {
      if (e.target === bd) bd.parentNode.removeChild(bd);
    });
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
      _populateRelClientSelect();
    }).catch(function(err) {
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
      return '<div class="ct-card' + sel + '" data-slug="' + _esc(c.slug) + '">' +
        '<div class="ct-card-name">' + _esc(c.display_name || c.name) + archived + '</div>' +
        '<div class="ct-card-meta">' + _esc(c.slug) + '</div>' +
        '<div class="ct-card-actions">' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.editClient(\'' + _esc(c.slug) + '\')">Editar</button>' +
          (c.status !== 'archived' ? '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="CT_ADMIN.archiveClient(\'' + _esc(c.slug) + '\')">Arquivar</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.ct-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
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

  function _openClientForm(client) {
    var isEdit = !!client;
    var html = '<div class="ct-modal">' +
      '<div class="ct-modal-title">' + (isEdit ? 'Editar cliente' : 'Novo cliente') + '</div>' +
      '<div class="ct-field"><label>Nome interno</label>' +
        '<input type="text" id="cf-name" value="' + _esc(isEdit ? client.name : '') + '" placeholder="Ex: Acme Ltda">' +
      '</div>' +
      '<div class="ct-field"><label>Nome para alunos (opcional)</label>' +
        '<input type="text" id="cf-display" value="' + _esc(isEdit ? (client.display_name || '') : '') + '" placeholder="Igual ao nome interno se vazio">' +
      '</div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn" id="cf-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-primary" id="cf-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html);
    bd.querySelector('#cf-cancel').addEventListener('click', _closeModal);
    bd.querySelector('#cf-save').addEventListener('click', function() {
      var name = bd.querySelector('#cf-name').value.trim();
      var display = bd.querySelector('#cf-display').value.trim();
      if (!name) { _toast('Nome obrigatório.'); return; }
      var action = isEdit ? 'ct_update_client' : 'ct_create_client';
      var params = { action: action, name: name, display_name: display || null };
      if (isEdit) params.slug = client.slug;
      else params.slug = _slugify(name);
      if (!params.slug) { _toast('Nome inválido para gerar slug.'); return; }
      callWorker(params).then(function() {
        _closeModal();
        _toast(isEdit ? 'Cliente atualizado.' : 'Cliente criado.');
        _loadClients();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
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
      return '<div class="ct-card" data-id="' + t.id + '">' +
        '<div class="ct-card-name">' + _esc(t.display_name || t.name) + archived + '</div>' +
        '<div class="ct-card-meta">' + _esc(t.client_slug) + ' / ' + _esc(t.slug) + '</div>' +
        '<div class="ct-url-row">' +
          '<a class="ct-url-text" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + _esc(url) + '">' + _esc(url) + '</a>' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.copyTurmaUrl(\'' + _esc(url) + '\')">Copiar</button>' +
        '</div>' +
        '<div class="ct-card-actions">' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.editTurma(' + t.id + ')">Editar</button>' +
          '<button class="ct-btn ct-btn-sm" onclick="CT_ADMIN.regenerateToken(\'' + _esc(t.client_slug) + '\',\'' + _esc(t.slug) + '\')">Regenerar token</button>' +
          (t.status !== 'archived' ? '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="CT_ADMIN.archiveTurma(\'' + _esc(t.client_slug) + '\',\'' + _esc(t.slug) + '\')">Arquivar</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _openTurmaForm(turma) {
    var isEdit = !!turma;
    var html = '<div class="ct-modal">' +
      '<div class="ct-modal-title">' + (isEdit ? 'Editar turma' : 'Nova turma') + '</div>' +
      '<div class="ct-field"><label>Nome interno</label>' +
        '<input type="text" id="tf-name" value="' + _esc(isEdit ? turma.name : '') + '" placeholder="Ex: Turma A">' +
      '</div>' +
      '<div class="ct-field"><label>Nome para alunos (opcional)</label>' +
        '<input type="text" id="tf-display" value="' + _esc(isEdit ? (turma.display_name || '') : '') + '" placeholder="Igual ao nome interno se vazio">' +
      '</div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn" id="tf-cancel">Cancelar</button>' +
        '<button class="ct-btn ct-btn-primary" id="tf-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html);
    bd.querySelector('#tf-cancel').addEventListener('click', _closeModal);
    bd.querySelector('#tf-save').addEventListener('click', function() {
      var name = bd.querySelector('#tf-name').value.trim();
      var display = bd.querySelector('#tf-display').value.trim();
      if (!name) { _toast('Nome obrigatório.'); return; }
      var action = isEdit ? 'ct_update_turma' : 'ct_create_turma';
      var params = { action: action, client_slug: _selectedClientSlug, name: name, display_name: display || null };
      if (isEdit) params.slug = turma.slug;
      else params.slug = _slugify(name);
      if (!params.slug) { _toast('Nome inválido para gerar slug.'); return; }
      callWorker(params).then(function() {
        _closeModal();
        _toast(isEdit ? 'Turma atualizada.' : 'Turma criada.');
        _loadTurmas(_selectedClientSlug);
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  // ---- Items ----

  function _loadItems() {
    var el = document.getElementById('items-list');
    el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    callWorker({ action: 'ct_list_items' }).then(function(data) {
      _items = data.items || [];
      _renderItems();
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar itens.</div>';
    });
  }

  function _renderItems() {
    var el = document.getElementById('items-list');
    if (!_items.length) {
      el.innerHTML = '<div class="ct-empty">Nenhum item na biblioteca.</div>';
      return;
    }
    el.innerHTML = _items.map(function(item) {
      var meta = _typeMeta(item.type);
      var tagsHtml = (item.tags && item.tags.length)
        ? '<span class="ct-item-tags">' + item.tags.map(function(t) {
            return '<span class="ct-tag-chip ct-tag-chip-mini">' + _esc(t.label) + '</span>';
          }).join('') + '</span>'
        : '';
      return '<div class="ct-item-row" onclick="CT_ADMIN.openItem(' + item.id + ')">' +
        '<span class="ct-item-type-icon">' + meta.icon + '</span>' +
        '<div class="ct-item-info">' +
          '<div class="ct-item-title">' + _esc(item.title) + '</div>' +
          '<div class="ct-item-sub">' + _esc(meta.label) +
            ' · ' + new Date(item.updated_at * 1000).toLocaleDateString('pt-BR') +
          '</div>' +
          tagsHtml +
        '</div>' +
        '<button class="ct-btn ct-btn-sm ct-btn-danger" onclick="event.stopPropagation();CT_ADMIN.deleteItem(' + item.id + ')">Excluir</button>' +
      '</div>';
    }).join('');
  }

  function _openItemEditor(item) {
    var isEdit = !!item;
    var initialType = isEdit ? item.type : (_types[0] && _types[0].slug) || 'prompt';
    var initialTagIds = (isEdit && Array.isArray(item.tags)) ? item.tags.map(function(t) { return t.id; }) : [];
    var html = '<div class="ct-editor">' +
      '<div class="ct-editor-header">' +
        '<span class="ct-editor-title">' + (isEdit ? 'Editar item' : 'Novo item') + '</span>' +
        '<button class="ct-btn ct-btn-sm" id="ie-close">Fechar</button>' +
      '</div>' +
      '<div class="ct-editor-body">' +
        '<div class="ct-field"><label>Título</label>' +
          '<input type="text" id="ie-title" value="' + _esc(isEdit ? item.title : '') + '" placeholder="Título do item">' +
        '</div>' +
        '<div class="ct-field"><label>Tipo</label>' +
          '<select id="ie-type">' + _renderTypeOptions(initialType) + '</select>' +
        '</div>' +
        '<div class="ct-field"><label>Resumo (opcional)</label>' +
          '<input type="text" id="ie-summary" value="' + _esc(isEdit ? (item.summary || '') : '') + '" placeholder="Uma linha descrevendo o item">' +
        '</div>' +
        '<div class="ct-field"><label>Tags</label>' +
          '<div class="ct-tag-picker" id="ie-tag-picker"></div>' +
        '</div>' +
        '<div class="ct-field"><label>Corpo em Markdown</label>' +
          '<textarea id="ie-body" rows="10" placeholder="Cole ou escreva o conteúdo. Pode pedir à IA para formatá-lo em Markdown.">' + _esc(isEdit ? (item.body_md || '') : '') + '</textarea>' +
          '<div class="ct-editor-toolbar">' +
            '<button class="ct-btn ct-btn-sm" id="ie-ai-btn" type="button">&#9889; Formatar com IA</button>' +
            '<button class="ct-btn ct-btn-sm" id="ie-preview-btn" type="button">Visualizar preview</button>' +
          '</div>' +
          '<div class="ct-preview-area" id="ie-preview" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-editor-footer">' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="ie-cancel">Cancelar</button>' +
          '<button class="ct-btn ct-btn-primary" id="ie-save">' + (isEdit ? 'Salvar' : 'Criar') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html);
    var selectedTagIds = new Set(initialTagIds);

    // Defeat the global utils.js Enter-submit handler so Enter creates newlines in the body textarea.
    bd.querySelector('#ie-body').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') e.stopPropagation();
    });

    // Type select: trigger create-new flow when "+ Criar novo tipo..." is picked.
    var typeSel = bd.querySelector('#ie-type');
    var lastTypeValue = initialType;
    typeSel.addEventListener('change', function() {
      if (typeSel.value !== '__new__') { lastTypeValue = typeSel.value; return; }
      _openTypeCreateForm(function(newSlug) {
        if (newSlug) {
          typeSel.innerHTML = _renderTypeOptions(newSlug);
          lastTypeValue = newSlug;
        } else {
          typeSel.value = lastTypeValue;
        }
      });
    });

    _renderTagPicker(bd.querySelector('#ie-tag-picker'), selectedTagIds);

    bd.querySelector('#ie-close').addEventListener('click', _closeModal);
    bd.querySelector('#ie-cancel').addEventListener('click', _closeModal);
    bd.querySelector('#ie-ai-btn').addEventListener('click', async function() {
      var ta = bd.querySelector('#ie-body');
      var raw = ta.value.trim();
      if (!raw) { _toast('Cole ou digite o texto antes de pedir à IA.'); return; }
      var btn = this;
      var prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '&#9203; Formatando...';
      try {
        var res = await AIClient.generate({
          action: 'ai_chat',
          system: 'Você é um especialista em formatação Markdown para material didático. Converta o texto recebido em Markdown bem estruturado. Use cabeçalhos (##, ###), listas, negrito (**), itálico (*), blocos de código com ``` e citações (>) quando apropriado. Preserve fielmente o significado do conteúdo, sem inventar nem resumir. Retorne APENAS o Markdown final, sem explicações nem comentários.',
          messages: [{ role: 'user', content: raw }],
          temperature: 0.3,
          max_tokens: 3000
        });
        if (!res || !res.text) { _toast('IA não retornou conteúdo. Tente novamente.'); return; }
        ta.value = res.text.trim();
        // Refresh preview if open.
        var pre = bd.querySelector('#ie-preview');
        if (pre && pre.style.display !== 'none') _renderMarkdown(ta.value, pre);
        _toast('Markdown gerado.');
      } catch (e) {
        _toast('Erro ao chamar IA: ' + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
    bd.querySelector('#ie-preview-btn').addEventListener('click', function() {
      var pre = bd.querySelector('#ie-preview');
      var body = bd.querySelector('#ie-body').value;
      if (pre.style.display === 'none') {
        pre.style.display = '';
        _renderMarkdown(body, pre);
        this.textContent = 'Fechar preview';
      } else {
        pre.style.display = 'none';
        this.textContent = 'Visualizar preview';
      }
    });
    bd.querySelector('#ie-save').addEventListener('click', function() {
      var title = bd.querySelector('#ie-title').value.trim();
      var type = typeSel.value;
      if (type === '__new__') { _toast('Selecione um tipo.'); return; }
      var summary = bd.querySelector('#ie-summary').value.trim();
      var body_md = bd.querySelector('#ie-body').value;
      if (!title) { _toast('Título obrigatório.'); return; }
      var action = isEdit ? 'ct_update_item' : 'ct_create_item';
      var params = {
        action: action,
        type: type,
        title: title,
        summary: summary || null,
        body_md: body_md,
        tag_ids: Array.from(selectedTagIds)
      };
      if (isEdit) params.id = item.id;
      callWorker(params).then(function() {
        _closeModal();
        _toast(isEdit ? 'Item atualizado.' : 'Item criado.');
        _loadItems();
        _loadTags();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    });
  }

  // ---- Tag picker (chip selector + free-text add) ----

  function _renderTagPicker(container, selectedTagIds) {
    function render() {
      var chips = _tags.map(function(t) {
        var active = selectedTagIds.has(t.id);
        return '<button type="button" class="ct-tag-chip' + (active ? ' active' : '') +
          '" data-id="' + t.id + '">' + _esc(t.label) + '</button>';
      }).join('');
      container.innerHTML =
        '<div class="ct-tag-chip-row">' + chips + '</div>' +
        '<div class="ct-tag-add">' +
          '<input type="text" class="ct-tag-add-input" placeholder="+ Nova tag (Enter para adicionar)">' +
        '</div>';

      container.querySelectorAll('.ct-tag-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = parseInt(btn.dataset.id);
          if (selectedTagIds.has(id)) selectedTagIds.delete(id);
          else selectedTagIds.add(id);
          btn.classList.toggle('active');
        });
      });

      var input = container.querySelector('.ct-tag-add-input');
      input.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        var label = input.value.trim();
        if (!label) return;
        callWorker({ action: 'ct_create_tag', label: label }).then(function(res) {
          if (res.tag) {
            var existing = _tags.find(function(x) { return x.id === res.tag.id; });
            if (!existing) _tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
            _tags.sort(function(a, b) { return a.label.localeCompare(b.label); });
            selectedTagIds.add(res.tag.id);
            input.value = '';
            render();
            container.querySelector('.ct-tag-add-input').focus();
          }
        }).catch(function(err) { _toast('Erro ao criar tag: ' + (err.message || err)); });
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
    var bd = _openModal(html);
    function close(slug) {
      bd.parentNode.removeChild(bd);
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
      '<div class="ct-tag-manager-list" id="tm-list"></div>' +
      '<div class="ct-modal-actions">' +
        '<button class="ct-btn ct-btn-primary" id="tm-close">Fechar</button>' +
      '</div>' +
    '</div>';
    var bd = _openModal(html);
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

  function _populateRelClientSelect() {
    var sel = document.getElementById('rel-client-select');
    var prev = sel.value;
    sel.innerHTML = '<option value="">Selecione o cliente...</option>' +
      _clients.filter(function(c) { return c.status !== 'archived'; }).map(function(c) {
        return '<option value="' + _esc(c.slug) + '">' + _esc(c.display_name || c.name) + '</option>';
      }).join('');
    if (prev) sel.value = prev;
  }

  function _loadRelTurmas(clientSlug) {
    var sel = document.getElementById('rel-turma-select');
    sel.innerHTML = '<option value="">Carregando...</option>';
    sel.disabled = true;
    callWorker({ action: 'ct_list_turmas', client_slug: clientSlug }).then(function(data) {
      var turmas = (data.turmas || []).filter(function(t) { return t.status !== 'archived'; });
      sel.innerHTML = '<option value="">Selecione a turma...</option>' +
        turmas.map(function(t) {
          return '<option value="' + _esc(t.slug) + '">' + _esc(t.display_name || t.name) + '</option>';
        }).join('');
      sel.disabled = false;
    });
  }

  function _loadReleases(clientSlug, turmaSlug) {
    _relClientSlug = clientSlug;
    _relTurmaSlug = turmaSlug;
    var el = document.getElementById('releases-list');
    el.innerHTML = '<div class="ct-empty">Carregando...</div>';
    Promise.all([
      callWorker({ action: 'ct_list_items' }),
      callWorker({ action: 'ct_list_turmas', client_slug: clientSlug })
    ]).then(function(results) {
      var allItems = (results[0].items || []);
      var turma = (results[1].turmas || []).find(function(t) { return t.slug === turmaSlug; });
      if (!turma) { el.innerHTML = '<div class="ct-empty">Turma não encontrada.</div>'; return; }
      return callWorker({
        action: 'ct_get_turma_view',
        client_slug: clientSlug,
        turma_slug: turmaSlug,
        token: turma.token
      }).then(function(vd) {
        _relItems = allItems;
        _relReleased = (vd.items || []).map(function(i) { return i.id; });
        _renderReleases(allItems, vd.items || []);
      }).catch(function() {
        _relItems = allItems;
        _relReleased = [];
        _renderReleases(allItems, []);
      });
    }).catch(function() {
      el.innerHTML = '<div class="ct-empty">Erro ao carregar dados.</div>';
    });
  }

  function _renderReleases(allItems, releasedItems) {
    var el = document.getElementById('releases-list');
    if (!allItems.length) {
      el.innerHTML = '<div class="ct-empty">Nenhum item na biblioteca.</div>';
      return;
    }
    var relIds = releasedItems.map(function(i) { return i.id; });
    // Build ordered list: released items first (in position order), then unreleased
    var rows = releasedItems.map(function(i) { return { id: i.id, title: i.title, released: true }; });
    allItems.forEach(function(i) {
      if (relIds.indexOf(i.id) === -1) rows.push({ id: i.id, title: i.title, released: false });
    });
    el.innerHTML = rows.map(function(r) {
      var cls = r.released ? ' released' : '';
      return '<div class="ct-rel-row' + cls + '" data-id="' + r.id + '" draggable="' + r.released + '">' +
        '<span class="ct-drag-handle" aria-hidden="true">&#8942;&#8942;</span>' +
        '<span class="ct-rel-title">' + _esc(r.title) + '</span>' +
        '<label class="ct-toggle">' +
          '<input type="checkbox" ' + (r.released ? 'checked' : '') + ' data-id="' + r.id + '">' +
          '<span class="ct-toggle-slider"></span>' +
        '</label>' +
      '</div>';
    }).join('');

    // Wire toggles
    el.querySelectorAll('.ct-toggle input').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var itemId = parseInt(cb.dataset.id);
        var action = cb.checked ? 'ct_release_item' : 'ct_unrelease_item';
        callWorker({ action: action, client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_id: itemId }).then(function() {
          _loadReleases(_relClientSlug, _relTurmaSlug);
        }).catch(function(err) {
          cb.checked = !cb.checked;
          _toast('Erro: ' + (err.message || err));
        });
      });
    });

    // Wire drag-and-drop on released items
    _wireDragDrop(el);
  }

  function _wireDragDrop(container) {
    var dragging = null;
    container.querySelectorAll('.ct-rel-row.released').forEach(function(row) {
      row.addEventListener('dragstart', function() { dragging = row; row.classList.add('dragging'); });
      row.addEventListener('dragend', function() { row.classList.remove('dragging'); dragging = null; });
      row.addEventListener('dragover', function(e) { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', function() { row.classList.remove('drag-over'); });
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (!dragging || dragging === row) return;
        container.insertBefore(dragging, row);
        _saveRelOrder(container);
      });
    });
  }

  function _saveRelOrder(container) {
    var ids = Array.from(container.querySelectorAll('.ct-rel-row.released')).map(function(r) { return parseInt(r.dataset.id); });
    callWorker({ action: 'ct_reorder_releases', client_slug: _relClientSlug, turma_slug: _relTurmaSlug, item_ids: ids }).then(function() {
      _toast('Ordem salva.');
    }).catch(function(err) { _toast('Erro ao salvar ordem: ' + (err.message || err)); });
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
        if (id === 'releases') {
          callWorker({ action: 'ct_list_clients' }).then(function(d) {
            _clients = d.clients || [];
            _populateRelClientSelect();
          });
        }
      });
    });
  }

  // ---- Releases selectors wiring ----

  function _initReleasesSelectors() {
    var clientSel = document.getElementById('rel-client-select');
    var turmaSel = document.getElementById('rel-turma-select');
    clientSel.addEventListener('change', function() {
      turmaSel.innerHTML = '<option value="">Selecione a turma...</option>';
      turmaSel.disabled = true;
      document.getElementById('releases-list').innerHTML = '<div class="ct-empty">Selecione uma turma.</div>';
      if (clientSel.value) _loadRelTurmas(clientSel.value);
    });
    turmaSel.addEventListener('change', function() {
      if (clientSel.value && turmaSel.value) _loadReleases(clientSel.value, turmaSel.value);
    });
  }

  // ---- Public API ----

  return {
    init: function() {
      _initTabs();
      _initReleasesSelectors();
      document.getElementById('btn-new-client').addEventListener('click', function() { _openClientForm(null); });
      document.getElementById('btn-new-turma').addEventListener('click', function() { _openTurmaForm(null); });
      document.getElementById('btn-new-item').addEventListener('click', function() { _openItemEditor(null); });
      var manageTagsBtn = document.getElementById('btn-manage-tags');
      if (manageTagsBtn) manageTagsBtn.addEventListener('click', _openTagManager);
      _loadClients();
      _loadTypes();
      _loadTags();
    },

    openTagManager: _openTagManager,

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
      callWorker({ action: 'ct_delete_item', id: id }).then(function() {
        _toast('Item excluído.');
        _loadItems();
      }).catch(function(err) { _toast('Erro: ' + (err.message || err)); });
    }
  };
})();
