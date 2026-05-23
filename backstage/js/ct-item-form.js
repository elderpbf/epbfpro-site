'use strict';

// Shared item editor form. Consumers: ClassTrail admin (modal mount) and
// PensoCodex / ClassVault (right-pane mount). Owns all type-specific field
// rendering, tag picker, asset upload chain, save flow.
//
// Mount-time options:
//   container     DOM element to render into
//   item          existing item for edit mode; null/undefined → create mode
//   prefill       initial values for create mode (e.g., from AI step-1)
//   aiContext     { rawInput, firstOutput, addEmojis } to enable Refazer button
//   types         array of ct_types rows (slug, label, icon)
//   tags          array of ct_tags rows (id, label) — module mutates this in place
//                 when user creates a new tag inline
//   titleLabel    header text (e.g., 'Editar item', 'Adicionar item')
//   saveLabel     primary button text (e.g., 'Salvar', 'Criar', 'Adicionar')
//   closeLabel    secondary close-without-saving button text; '' to hide
//   createAction  'ct_create_item' | 'cv_create_item' (default 'ct_create_item')
//   createExtraParams  extra params merged into the create call (e.g. client_slug/turma_slug for cv_create_item)
//   onSave(savedItem)  fires after a successful save+upload chain
//   onCancel()         fires when the close/cancel button is clicked
//   onDirtyChange(isDirty)  fires when the dirty flag flips
//   onCreateType(callback)  fires when user picks "__new__" in type select.
//                           Caller opens its own type-create modal, invokes
//                           callback(slug) on success (with new slug) or callback(null) on cancel.
//                           If not provided, "+ Criar novo tipo..." option is hidden.
//   excludeTypes            array of type slugs to hide from the dropdown. Used
//                           to keep dedicated authoring surfaces (e.g., conteudo
//                           imports, tarefa builder) out of the generic flow.
//                           In edit mode, callers should pass [] so the existing
//                           type stays selectable.
//
// Returned handle:
//   isDirty()     → boolean
//   getState()    → { type, title, summary, body_md, meta_json, tag_ids }
//   destroy()     → unmount + free listeners
window.CTItemForm = (function() {

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _toast(msg) {
    if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
  }

  function _readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var result = e.target.result;
        var b64 = result.split(',')[1] || result;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  function _renderTypeOptions(types, selectedSlug, includeNewOption, excludeTypes) {
    var excluded = excludeTypes && excludeTypes.length ? excludeTypes : null;
    var visible = excluded
      ? types.filter(function(t) { return excluded.indexOf(t.slug) < 0; })
      : types;
    var opts = visible.map(function(t) {
      var sel = t.slug === selectedSlug ? ' selected' : '';
      var icon = t.icon ? t.icon + ' ' : '';
      return '<option value="' + _esc(t.slug) + '"' + sel + '>' + _esc(icon + t.label) + '</option>';
    }).join('');
    var isExcludedSlug = excluded && excluded.indexOf(selectedSlug) >= 0;
    if (selectedSlug && !isExcludedSlug && !visible.find(function(t) { return t.slug === selectedSlug; })) {
      // Slug not in the visible list AND not in the excluded list → unregistered.
      // Prepend as a selectable fallback (edit mode safety net).
      opts = '<option value="' + _esc(selectedSlug) + '" selected>' +
        _esc(selectedSlug + ' (não registrado)') + '</option>' + opts;
    }
    if (includeNewOption) {
      opts += '<option value="__new__">+ Criar novo tipo...</option>';
    }
    return opts;
  }

  function _buildTypeBlock(typeSlug, body_md, meta) {
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
    return '<div class="ct-type-block">' + hasBody + '</div>';
  }

  function _wireTypeBlockEvents(block, onFileSelected) {
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

    block.querySelectorAll('textarea').forEach(function(ta) {
      ta.addEventListener('keydown', function(e) { if (e.key === 'Enter') e.stopPropagation(); });
    });

    var platformToggle = block.querySelector('#ie-platform-toggle');
    if (platformToggle) {
      platformToggle.addEventListener('change', function() {
        var wrap = block.querySelector('#ie-platform-tabs-wrap');
        if (wrap) wrap.style.display = platformToggle.checked ? '' : 'none';
      });
    }

    var materialFile = block.querySelector('#ie-material-file');
    if (materialFile) {
      materialFile.addEventListener('change', function() {
        var f = materialFile.files[0];
        if (f) onFileSelected(f, 'attachment_url');
      });
    }

    var paperPdf = block.querySelector('#ie-paper-pdf');
    if (paperPdf) {
      paperPdf.addEventListener('change', function() {
        var f = paperPdf.files[0];
        if (f) onFileSelected(f, 'pdf_url');
      });
    }
  }

  function _collectTypeData(root, typeSlug) {
    var body_md = '';
    var meta_json = null;
    var bodyEl = root.querySelector('#ie-body');
    if (bodyEl) body_md = bodyEl.value;

    if (typeSlug === 'prompt') {
      // body_md only
    } else if (typeSlug === 'guide') {
      var platformToggle = root.querySelector('#ie-platform-toggle');
      if (platformToggle && platformToggle.checked) {
        meta_json = {
          platform_tabs: {
            windows: (root.querySelector('#ie-pt-windows') || {}).value || '',
            mac:     (root.querySelector('#ie-pt-mac') || {}).value || '',
            linux:   (root.querySelector('#ie-pt-linux') || {}).value || ''
          }
        };
      }
    } else if (typeSlug === 'material') {
      meta_json = {};
    } else if (typeSlug === 'paper') {
      meta_json = {
        authors:  (root.querySelector('#ie-paper-authors') || {}).value || null,
        year:     (root.querySelector('#ie-paper-year') || {}).value || null,
        abstract: (root.querySelector('#ie-paper-abstract') || {}).value || null
      };
    } else if (typeSlug === 'model_info') {
      var strengthsEl = root.querySelector('#ie-mi-strengths');
      var strengthsArr = strengthsEl
        ? strengthsEl.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean)
        : [];
      meta_json = {
        provider:       (root.querySelector('#ie-mi-provider') || {}).value || null,
        model_id:       (root.querySelector('#ie-mi-model-id') || {}).value || null,
        context_window: (root.querySelector('#ie-mi-context') || {}).value || null,
        strengths:      strengthsArr,
        doc_url:        (root.querySelector('#ie-mi-doc-url') || {}).value || null
      };
      body_md = '';
    }
    return { body_md: body_md, meta_json: meta_json };
  }

  function _renderTagPicker(container, tags, selectedTagIds, onChange) {
    function render() {
      var chips = tags.map(function(t) {
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
          if (onChange) onChange();
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
              if (!tags.find(function(x) { return x.id === res.tag.id; })) {
                tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
                tags.sort(function(a, b) { return a.label.localeCompare(b.label, 'pt-BR'); });
              }
              selectedTagIds.add(res.tag.id);
            }
            render();
            if (onChange) onChange();
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

  async function _tagsByLabels(tags, labels) {
    var ids = [];
    for (var i = 0; i < labels.length; i++) {
      var label = (labels[i] || '').trim();
      if (!label) continue;
      var existing = tags.find(function(t) { return t.label.toLowerCase() === label.toLowerCase(); });
      if (existing) { ids.push(existing.id); continue; }
      try {
        var res = await callWorker({ action: 'ct_create_tag', label: label });
        if (res && res.tag) {
          if (!tags.find(function(t) { return t.id === res.tag.id; })) {
            tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
          }
          ids.push(res.tag.id);
        }
      } catch (e) {}
    }
    return ids;
  }

  // ───────────────────── public API ─────────────────────

  function mount(container, opts) {
    opts = opts || {};
    var item = opts.item || null;
    var prefill = opts.prefill || null;
    var aiContext = opts.aiContext || null;
    var types = opts.types || [];
    var tags = opts.tags || [];
    var titleLabel = opts.titleLabel || (item ? 'Editar item' : 'Novo item');
    var saveLabel = opts.saveLabel || (item ? 'Salvar' : 'Criar');
    var closeLabel = opts.closeLabel != null ? opts.closeLabel : 'Fechar';
    var createAction = opts.createAction || 'ct_create_item';
    var createExtraParams = opts.createExtraParams || {};
    var onSave = opts.onSave || function() {};
    var onCancel = opts.onCancel || function() {};
    var onDirtyChange = opts.onDirtyChange || function() {};
    var onCreateType = opts.onCreateType || null;
    var excludeTypes = Array.isArray(opts.excludeTypes) ? opts.excludeTypes : [];

    var isEdit = !!item;
    var src = prefill || item || {};
    var _firstVisibleType = excludeTypes.length
      ? types.find(function(t) { return excludeTypes.indexOf(t.slug) < 0; })
      : types[0];
    var initialType = src.type || (isEdit ? item.type : null) || (_firstVisibleType && _firstVisibleType.slug) || 'prompt';
    var initialTitle = src.title != null ? src.title : '';
    var initialSummary = src.summary != null ? src.summary : '';
    var initialBody = src.body_md != null ? src.body_md : '';
    var initialMeta = (isEdit && item.meta_json)
      ? (typeof item.meta_json === 'string' ? JSON.parse(item.meta_json) : item.meta_json)
      : {};
    var initialTagIds = Array.isArray(src.tag_ids)
      ? src.tag_ids
      : (isEdit && Array.isArray(item.tags) ? item.tags.map(function(t) { return t.id; }) : []);

    var refazerBtn = aiContext
      ? '<button class="ct-btn" id="ie-refazer-btn" type="button">&#9889; Refazer com IA</button>'
      : '';

    var closeBtn = closeLabel
      ? '<button class="ct-btn ct-btn-sm" id="ie-close">' + _esc(closeLabel) + '</button>'
      : '';

    var html = '<div class="ct-editor">' +
      '<div class="ct-editor-header">' +
        '<span class="ct-editor-title">' + _esc(titleLabel) + '</span>' +
        closeBtn +
      '</div>' +
      '<div class="ct-editor-body">' +
        '<div class="ct-field"><label>Título</label>' +
          '<input type="text" id="ie-title" value="' + _esc(initialTitle) + '" placeholder="Título do item">' +
        '</div>' +
        '<div class="ct-field"><label>Tipo</label>' +
          '<select id="ie-type">' + _renderTypeOptions(types, initialType, !!onCreateType, excludeTypes) + '</select>' +
        '</div>' +
        '<div class="ct-field"><label>Resumo</label>' +
          '<input type="text" id="ie-summary" value="' + _esc(initialSummary) + '" placeholder="Uma linha descrevendo o item">' +
        '</div>' +
        '<div class="ct-field"><label>Tags</label>' +
          '<div class="ct-tag-picker" id="ie-tag-picker"></div>' +
        '</div>' +
        '<div id="ie-type-block"></div>' +
      '</div>' +
      '<div class="ct-editor-footer">' +
        '<div class="ct-modal-actions">' +
          '<button class="ct-btn" id="ie-cancel">Cancelar</button>' +
          refazerBtn +
          '<button class="ct-btn ct-btn-primary" id="ie-save">' + _esc(saveLabel) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;
    var root = container;

    var selectedTagIds = new Set(initialTagIds);
    var _pendingAssetFile = null;
    var _pendingAssetField = null;
    var typeSel = root.querySelector('#ie-type');
    var lastTypeValue = initialType;
    var isDirty = false;

    function markDirty() {
      if (!isDirty) {
        isDirty = true;
        onDirtyChange(true);
      }
    }
    function clearDirty() {
      if (isDirty) {
        isDirty = false;
        onDirtyChange(false);
      }
    }

    function renderTypeBlock(typeSlug) {
      var block = root.querySelector('#ie-type-block');
      block.innerHTML = _buildTypeBlock(typeSlug, initialBody, initialMeta);
      _wireTypeBlockEvents(block, function(file, field) {
        _pendingAssetFile = file;
        _pendingAssetField = field;
        markDirty();
      });
      block.querySelectorAll('input, textarea, select').forEach(function(el) {
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
      });
    }

    renderTypeBlock(initialType);

    typeSel.addEventListener('change', function() {
      if (typeSel.value === '__new__') {
        if (onCreateType) {
          onCreateType(function(newSlug) {
            if (newSlug) {
              typeSel.innerHTML = _renderTypeOptions(types, newSlug, !!onCreateType, excludeTypes);
              lastTypeValue = newSlug;
              renderTypeBlock(newSlug);
              markDirty();
            } else {
              typeSel.value = lastTypeValue;
            }
          });
        } else {
          typeSel.value = lastTypeValue;
        }
        return;
      }
      lastTypeValue = typeSel.value;
      renderTypeBlock(typeSel.value);
      markDirty();
    });

    _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);

    // Top-level inputs (title / summary) dirty-tracking
    root.querySelector('#ie-title').addEventListener('input', markDirty);
    root.querySelector('#ie-summary').addEventListener('input', markDirty);

    var closeBtnEl = root.querySelector('#ie-close');
    if (closeBtnEl) closeBtnEl.addEventListener('click', function() { onCancel(); });
    root.querySelector('#ie-cancel').addEventListener('click', function() { onCancel(); });

    if (aiContext) {
      root.querySelector('#ie-refazer-btn').addEventListener('click', async function() {
        var btn = this;
        var prev = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '&#9889; Refazendo...';
        try {
          var currentTagIds = Array.from(selectedTagIds);
          var currentTagLabels = currentTagIds.map(function(id) {
            var t = tags.find(function(x) { return x.id === id; });
            return t ? t.label : null;
          }).filter(Boolean);

          var bodyEl = root.querySelector('#ie-body');
          var current = {
            title: root.querySelector('#ie-title').value.trim(),
            summary: root.querySelector('#ie-summary').value.trim(),
            type: root.querySelector('#ie-type').value,
            body_md: bodyEl ? bodyEl.value : '',
            tag_labels: currentTagLabels
          };
          var diff = CT_AI_SPEC.computeEditDiff(aiContext.firstOutput, current);
          var systemPrompt = CT_AI_SPEC.buildRefineSystemPrompt({ addEmojis: aiContext.addEmojis });
          var userMsg = CT_AI_SPEC.buildRefineUserMessage(aiContext.rawInput, aiContext.firstOutput, diff);

          var res = await AIClient.generate({
            action: 'ai_chat',
            system: systemPrompt,
            messages: [{ role: 'user', content: userMsg }],
            temperature: 0.3,
            max_tokens: CT_AI_SPEC.MAX_TOKENS
          });
          if (!res || !res.text) { _toast('IA não retornou conteúdo.'); return; }
          var parsed = CT_AI_SPEC.parseModelJson(res.text);
          if (!parsed || !parsed.body_md) { _toast('IA retornou formato inesperado.'); return; }
          parsed = CT_AI_SPEC.enforcePromptVerbatim(parsed, aiContext.rawInput);

          aiContext.firstOutput = parsed;

          root.querySelector('#ie-title').value = parsed.title || '';
          root.querySelector('#ie-summary').value = parsed.summary || '';
          if (parsed.type) root.querySelector('#ie-type').value = parsed.type;
          if (bodyEl) bodyEl.value = parsed.body_md || '';
          var newTagIds = await _tagsByLabels(tags, parsed.tag_labels || []);
          selectedTagIds.clear();
          newTagIds.forEach(function(id) { selectedTagIds.add(id); });
          _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);
          var pre = root.querySelector('#ie-preview');
          if (pre && pre.style.display !== 'none') _renderMarkdown(parsed.body_md || '', pre);
          markDirty();
          _toast('Item refeito.');
        } catch (e) {
          _toast('Erro: ' + (e.message || e));
        } finally {
          btn.disabled = false;
          btn.innerHTML = prev;
        }
      });
    }

    function getState() {
      var type = typeSel.value;
      var title = root.querySelector('#ie-title').value.trim();
      var summary = root.querySelector('#ie-summary').value.trim();
      var typeData = _collectTypeData(root, type);
      return {
        type: type,
        title: title,
        summary: summary,
        body_md: typeData.body_md,
        meta_json: typeData.meta_json,
        tag_ids: Array.from(selectedTagIds)
      };
    }

    root.querySelector('#ie-save').addEventListener('click', async function() {
      var state = getState();
      if (state.type === '__new__') { _toast('Selecione um tipo.'); return; }
      if (!state.title) { _toast('Título obrigatório.'); return; }

      var action = isEdit ? 'ct_update_item' : createAction;
      var params = Object.assign({}, isEdit ? {} : createExtraParams, {
        action: action,
        type: state.type,
        title: state.title,
        summary: state.summary || null,
        body_md: state.body_md,
        meta_json: state.meta_json ? JSON.stringify(state.meta_json) : null,
        tag_ids: state.tag_ids
      });
      if (isEdit) params.id = item.id;

      var saveBtn = this;
      saveBtn.disabled = true;
      try {
        var saveRes = await callWorker(params);
        if (saveRes && saveRes.error) throw new Error(saveRes.error);
        var savedItem = saveRes && saveRes.item ? saveRes.item : null;
        var savedId = isEdit
          ? item.id
          : (savedItem ? savedItem.id : (saveRes && saveRes.id ? saveRes.id : null));

        if (_pendingAssetFile && savedId) {
          var progressEl = root.querySelector('.ct-upload-progress');
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
            var updatedMeta = Object.assign({}, state.meta_json || {});
            updatedMeta[_pendingAssetField] = assetUrl;
            await callWorker({
              action: 'ct_update_item',
              id: savedId,
              meta_json: JSON.stringify(updatedMeta)
            });
            if (savedItem) savedItem.meta_json = JSON.stringify(updatedMeta);
          }
          if (progressEl) progressEl.textContent = '';
        }

        clearDirty();
        onSave(savedItem || { id: savedId });
      } catch (err) {
        _toast('Erro: ' + (err.message || err));
        saveBtn.disabled = false;
      }
    });

    return {
      isDirty: function() { return isDirty; },
      getState: getState,
      destroy: function() {
        container.innerHTML = '';
      }
    };
  }

  return { mount: mount };

})();
