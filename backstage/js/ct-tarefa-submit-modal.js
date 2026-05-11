'use strict';

// ClassTrail tarefa submit modal (student-side).
// Public API:
//   CTTarefaSubmitModal.open({ item, clientSlug, turmaSlug, token, onSubmitted })
// Dependencies: CTRenderer (instructions preview), CTTarefaFields (field renderer),
// callWorker (api-client), localStorage.

window.CTTarefaSubmitModal = (function() {

  var LS_NAME = 'ct_student_name';

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function submittedKey(itemId, turmaSlug) {
    return 'ct_tarefa_submitted_' + itemId + '_' + turmaSlug;
  }

  function hasSubmitted(itemId, turmaSlug) {
    try { return localStorage.getItem(submittedKey(itemId, turmaSlug)) != null; }
    catch (_) { return false; }
  }

  function markSubmitted(itemId, turmaSlug) {
    try { localStorage.setItem(submittedKey(itemId, turmaSlug), String(Date.now())); }
    catch (_) {}
  }

  function open(opts) {
    if (!opts || !opts.item) return;
    var item = opts.item;
    var clientSlug = opts.clientSlug;
    var turmaSlug = opts.turmaSlug;
    var token = opts.token;
    var onSubmitted = opts.onSubmitted || function() {};

    var meta = _parseMeta(item.meta_json);
    var fieldType = meta.field_type || 'text';
    var allowAnon = !!meta.allow_anonymous;
    var savedName = '';
    try { savedName = localStorage.getItem(LS_NAME) || ''; } catch (_) {}

    var bd = document.createElement('div');
    bd.className = 'tr-modal-backdrop tr-tarefa-submit-backdrop';
    bd.innerHTML =
      '<div class="tr-modal tr-tarefa-submit">' +
        '<button class="tr-modal-close" type="button" aria-label="Fechar">×</button>' +
        '<h2 class="tr-modal-title">' + _esc(item.title) + '</h2>' +
        '<div class="tr-tarefa-instructions"></div>' +
        '<div class="tr-tarefa-form">' +
          '<label class="tr-tarefa-field-label">Sua resposta</label>' +
          '<div class="tr-tarefa-field"></div>' +
          '<div class="tr-tarefa-identity">' +
            '<label class="tr-tarefa-name-label">Seu nome</label>' +
            '<input type="text" class="tr-tarefa-name" placeholder="Digite seu nome completo" value="' + _esc(savedName) + '">' +
            (allowAnon
              ? '<label class="tr-tarefa-anon-row">' +
                  '<input type="checkbox" class="tr-tarefa-anon-cb">' +
                  '<span>Enviar como anônimo</span>' +
                '</label>'
              : '<p class="tr-tarefa-hint">Identificação obrigatória para esta tarefa.</p>'
            ) +
          '</div>' +
          '<div class="tr-tarefa-actions">' +
            '<button type="button" class="tr-btn tr-btn-ghost tr-tarefa-cancel">Cancelar</button>' +
            '<button type="button" class="tr-btn tr-btn-primary tr-tarefa-submit">Enviar resposta</button>' +
          '</div>' +
          '<div class="tr-tarefa-error" aria-live="polite"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    document.body.classList.add('tr-modal-open');

    var instr = bd.querySelector('.tr-tarefa-instructions');
    if (window.CTRenderer && item.body_md) {
      CTRenderer.render(item, instr, { preview: true });
    } else {
      instr.innerHTML = item.body_md ? '<pre>' + _esc(item.body_md) + '</pre>' : '';
    }

    var fieldEl = bd.querySelector('.tr-tarefa-field');
    var field = window.CTTarefaFields ? CTTarefaFields.get(fieldType) : null;
    if (field) {
      field.renderForm(fieldEl, {});
    } else {
      fieldEl.innerHTML = '<div class="tr-tarefa-error">Tipo de campo desconhecido.</div>';
    }

    var nameInput = bd.querySelector('.tr-tarefa-name');
    var anonCb = bd.querySelector('.tr-tarefa-anon-cb');
    var identityRow = bd.querySelector('.tr-tarefa-identity');
    var errorEl = bd.querySelector('.tr-tarefa-error');
    var submitBtn = bd.querySelector('.tr-tarefa-submit');
    var cancelBtn = bd.querySelector('.tr-tarefa-cancel');
    var closeBtn = bd.querySelector('.tr-modal-close');

    function close() {
      if (bd.parentNode) bd.parentNode.removeChild(bd);
      document.body.classList.remove('tr-modal-open');
      document.removeEventListener('keydown', escHandler);
    }
    var escHandler = function(e) {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escHandler);
    bd.addEventListener('click', function(e) { if (e.target === bd) close(); });
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    if (anonCb) {
      anonCb.addEventListener('change', function() {
        if (anonCb.checked) {
          nameInput.disabled = true;
          nameInput.classList.add('disabled');
        } else {
          nameInput.disabled = false;
          nameInput.classList.remove('disabled');
        }
      });
    }

    submitBtn.addEventListener('click', function() {
      errorEl.textContent = '';
      var isAnon = !!(anonCb && anonCb.checked);
      var name = isAnon ? '' : (nameInput.value || '').trim();
      if (!isAnon && !name) {
        errorEl.textContent = 'Informe seu nome ou marque "Enviar como anônimo".';
        return;
      }
      var value = field ? field.readValue(fieldEl) : null;
      var validation = field ? field.validate(value) : 'Campo inválido.';
      if (validation) {
        errorEl.textContent = validation;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      if (!isAnon && name) {
        try { localStorage.setItem(LS_NAME, name); } catch (_) {}
      }

      callWorker({
        action: 'ct_submit_tarefa',
        client_slug: clientSlug,
        turma_slug: turmaSlug,
        token: token,
        item_id: item.id,
        student_name: isAnon ? null : name,
        answer_type: fieldType,
        answer_json: JSON.stringify(value),
        _silent: true
      }).then(function(res) {
        if (res && res.error) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar resposta';
          errorEl.textContent = _errorMessage(res.error);
          return;
        }
        markSubmitted(item.id, turmaSlug);
        close();
        onSubmitted();
      }).catch(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar resposta';
        errorEl.textContent = 'Não foi possível enviar a resposta. Verifique sua conexão e tente novamente.';
      });
    });

    setTimeout(function() {
      var first = bd.querySelector('.tr-tarefa-field textarea, .tr-tarefa-field input');
      if (first) first.focus();
    }, 80);
  }

  function _errorMessage(code) {
    if (code === 'already_submitted') return 'Você já enviou uma resposta para esta tarefa. Cada aluno só pode enviar uma vez.';
    if (code === 'anon_not_allowed') return 'Esta tarefa exige identificação. Informe seu nome.';
    if (code === 'forbidden') return 'Acesso negado. Recarregue a página e tente novamente.';
    if (code === 'not_a_tarefa') return 'Este item não aceita respostas.';
    if (code === 'not_found') return 'Tarefa não encontrada.';
    return 'Erro ao enviar: ' + code;
  }

  function _parseMeta(metaJson) {
    if (!metaJson) return {};
    if (typeof metaJson !== 'string') return metaJson || {};
    try { return JSON.parse(metaJson) || {}; } catch (_) { return {}; }
  }

  return {
    open: open,
    hasSubmitted: hasSubmitted
  };
})();
