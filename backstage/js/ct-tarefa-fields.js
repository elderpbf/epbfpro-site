'use strict';

// ClassTrail tarefa field-type registry.
// Mirrors the CPQuestionTypes pattern: one descriptor per kind of answer field.
// Consumers: admin tarefa editor (chip strip + per-field config), student submit
// modal (renderForm + readValue). Phase 5 ships 'text' only; the others are
// declared with disabled:true so the chip strip can preview future support
// without enabling submission.

window.CTTarefaFields = (function() {

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // --- text ---------------------------------------------------------------
  // payload: { text: string }
  var TEXT = {
    slug: 'text',
    label: 'Texto livre',
    disabled: false,
    // Render the answer form into a container. Returns nothing; modal reads
    // the value via readValue(container).
    renderForm: function(container, opts) {
      opts = opts || {};
      var placeholder = opts.placeholder || 'Escreva sua resposta aqui...';
      var initial = (opts.initial && opts.initial.text) || '';
      container.innerHTML =
        '<textarea class="ct-tarefa-answer ct-tarefa-answer-text" rows="8" ' +
        'placeholder="' + _esc(placeholder) + '">' + _esc(initial) + '</textarea>';
    },
    readValue: function(container) {
      var ta = container.querySelector('.ct-tarefa-answer-text');
      var text = (ta && ta.value || '').trim();
      if (!text) return null;
      return { text: text };
    },
    validate: function(value) {
      if (!value || !value.text) return 'Escreva uma resposta antes de enviar.';
      return null;
    },
    // Admin-side display of a stored answer (the respostas list card).
    renderStored: function(answer_json) {
      var v = _parse(answer_json);
      return '<div class="ct-resp-text">' + _esc((v && v.text) || '') + '</div>';
    },
    // CSV cell for export (single value column).
    toCsvValue: function(answer_json) {
      var v = _parse(answer_json);
      return (v && v.text) || '';
    }
  };

  // --- upload (future) ----------------------------------------------------
  var UPLOAD = {
    slug: 'upload',
    label: 'Upload de arquivo',
    disabled: true,
    renderForm: _disabledForm,
    readValue: function() { return null; },
    validate: function() { return 'Tipo ainda não disponível.'; },
    renderStored: function() { return '<div class="ct-resp-empty">tipo não suportado</div>'; },
    toCsvValue: function() { return ''; }
  };

  // --- mc (future) --------------------------------------------------------
  var MC = {
    slug: 'mc',
    label: 'Múltipla escolha',
    disabled: true,
    renderForm: _disabledForm,
    readValue: function() { return null; },
    validate: function() { return 'Tipo ainda não disponível.'; },
    renderStored: function() { return '<div class="ct-resp-empty">tipo não suportado</div>'; },
    toCsvValue: function() { return ''; }
  };

  // --- rating (future) ----------------------------------------------------
  var RATING = {
    slug: 'rating',
    label: 'Nota / Rating',
    disabled: true,
    renderForm: _disabledForm,
    readValue: function() { return null; },
    validate: function() { return 'Tipo ainda não disponível.'; },
    renderStored: function() { return '<div class="ct-resp-empty">tipo não suportado</div>'; },
    toCsvValue: function() { return ''; }
  };

  function _disabledForm(container) {
    container.innerHTML =
      '<div class="ct-tarefa-field-disabled">' +
      'Este tipo de campo ainda não está disponível na Phase 5. Use \'Texto livre\'.' +
      '</div>';
  }

  function _parse(answer_json) {
    if (!answer_json) return null;
    if (typeof answer_json !== 'string') return answer_json;
    try { return JSON.parse(answer_json); } catch (_) { return null; }
  }

  var REGISTRY = {
    text:   TEXT,
    upload: UPLOAD,
    mc:     MC,
    rating: RATING
  };

  function get(slug) {
    return REGISTRY[slug] || TEXT;
  }

  function list() {
    return [TEXT, UPLOAD, MC, RATING];
  }

  return { get: get, list: list };
})();
