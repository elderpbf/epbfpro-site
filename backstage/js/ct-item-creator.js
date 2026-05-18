'use strict';

// Shared "content-first" item creation step. Consumers: ClassTrail admin
// (modal mount) and PensoCodex / ClassVault (right-pane mount).
//
// Mount-time options:
//   container     DOM element to render the step-1 form into
//   types         array of ct_types rows (slug, label, icon)
//   tags          array of ct_tags rows (id, label) — used by AI tag-label resolution
//   titleLabel    header text (default: 'Novo item · 1 de 2')
//   closeLabel    text on the close (X) button; '' to hide (default: 'Fechar')
//   onClose()     fires when the user clicks the close (X) button
//   onCancel()    fires when the user clicks Cancelar
//   onManual({ body_md })           user picked "Continuar manualmente"
//   onAIComplete({ prefill, aiContext, tagLabels })
//                                   AI step succeeded. Caller resolves tagLabels
//                                   to tag_ids (creating any missing tags) and
//                                   then mounts CTItemForm with the prefill +
//                                   aiContext for the "Refazer com IA" button.
//
// Returned handle:
//   destroy()     clears the container and detaches listeners
window.CTItemCreator = (function() {

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _toast(msg) {
    if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
  }

  function mount(container, opts) {
    opts = opts || {};
    var types = opts.types || [];
    var tags = opts.tags || [];
    var titleLabel = opts.titleLabel || 'Novo item · 1 de 2';
    var closeLabel = opts.closeLabel != null ? opts.closeLabel : 'Fechar';
    var onClose = opts.onClose || function() {};
    var onCancel = opts.onCancel || function() {};
    var onManual = opts.onManual || function() {};
    var onAIComplete = opts.onAIComplete || function() {};

    var closeBtn = closeLabel
      ? '<button class="ct-btn ct-btn-sm" id="cf-close">' + _esc(closeLabel) + '</button>'
      : '';

    container.innerHTML =
      '<div class="ct-editor">' +
        '<div class="ct-editor-header">' +
          '<span class="ct-editor-title">' + _esc(titleLabel) + '</span>' +
          closeBtn +
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

    var rawEl = container.querySelector('#cf-raw');
    rawEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') e.stopPropagation();
    });

    var closeEl = container.querySelector('#cf-close');
    if (closeEl) closeEl.addEventListener('click', onClose);
    container.querySelector('#cf-cancel').addEventListener('click', onCancel);

    // GDoc single-item loader: fetches body_md and pastes it into the raw textarea
    container.querySelector('#cf-gdoc-load').addEventListener('click', function() {
      var url = container.querySelector('#cf-gdoc-url').value.trim();
      if (!url) { _toast('Informe a URL do Google Docs.'); return; }
      var btn = container.querySelector('#cf-gdoc-load');
      btn.disabled = true;
      btn.textContent = 'Carregando...';
      callWorker({ action: 'ct_ingest_gdoc', url: url, mode: 'single' }).then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Carregar';
        if (res && res.preview && res.preview.body_md) {
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

    container.querySelector('#cf-manual').addEventListener('click', function() {
      var raw = rawEl.value;
      onManual({ body_md: raw });
    });

    container.querySelector('#cf-ai').addEventListener('click', async function() {
      var raw = rawEl.value.trim();
      if (!raw) { _toast('Cole ou digite seu conteúdo primeiro.'); return; }
      var addEmojis = container.querySelector('#cf-emoji-toggle').checked;
      var btn = this;
      var prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '&#9889; Gerando...';
      try {
        var systemPrompt = CT_AI_SPEC.buildSystemPrompt(types, tags, { addEmojis: addEmojis });
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
        var prefill = {
          title:    parsed.title    || '',
          summary:  parsed.summary  || '',
          type:     parsed.type     || (types[0] && types[0].slug),
          body_md:  parsed.body_md  || raw
        };
        var aiContext = {
          rawInput:    raw,
          firstOutput: parsed,
          addEmojis:   addEmojis
        };
        onAIComplete({ prefill: prefill, aiContext: aiContext, tagLabels: parsed.tag_labels || [] });
      } catch (e) {
        _toast('Erro: ' + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });

    return {
      destroy: function() {
        container.innerHTML = '';
      }
    };
  }

  return { mount: mount };
})();
