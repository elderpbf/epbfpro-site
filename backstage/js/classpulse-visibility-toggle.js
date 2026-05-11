(function() {
  'use strict';

  function attach(opts) {
    var buttonEl      = opts.buttonEl;
    var getActiveQId  = opts.getActiveQId;
    var getSessionCode = opts.getSessionCode;
    var authToken     = opts.authToken;
    var callWorkerFn  = opts.callWorker;
    var labels        = opts.labels || {
      visible: 'Esconder resultados',
      hidden:  'Mostrar resultados'
    };
    var onError       = typeof opts.onError === 'function' ? opts.onError : function() {};

    // Build switch + label structure inside the button.
    buttonEl.innerHTML =
      '<span class="cp-toggle-switch" aria-hidden="true"><span class="cp-toggle-knob"></span></span>' +
      '<span class="cp-toggle-label"></span>';
    var labelEl = buttonEl.querySelector('.cp-toggle-label');

    // Default state matches Worker's default (show_results='true' at launch).
    var visible = true;

    function applyState() {
      buttonEl.setAttribute('aria-pressed', visible ? 'true' : 'false');
      labelEl.textContent = visible ? labels.visible : labels.hidden;
    }

    applyState();

    function onClick() {
      var qId = getActiveQId();
      if (!qId) return;
      var nextVisible = !visible;
      buttonEl.disabled = true;
      callWorkerFn({
        action: 'set_question_visibility',
        auth_token: authToken,
        id: qId,
        session_code: getSessionCode(),
        show_results: nextVisible
      })
        .then(function(res) {
          if (res && res.ok) {
            visible = nextVisible;
            applyState();
          } else {
            onError((res && res.error) || 'Erro ao atualizar visibilidade.');
          }
        })
        .catch(function(err) {
          onError(err && err.message ? err.message : String(err));
        })
        .finally(function() {
          buttonEl.disabled = false;
        });
    }

    buttonEl.addEventListener('click', onClick);

    function reset() {
      visible = true;
      applyState();
      buttonEl.disabled = false;
    }

    function syncFromQuestion(q) {
      visible = !(q && q.show_results === false);
      applyState();
    }

    function destroy() {
      buttonEl.removeEventListener('click', onClick);
    }

    return { reset: reset, syncFromQuestion: syncFromQuestion, destroy: destroy };
  }

  window.CPVisibilityToggle = { attach: attach };
})();
