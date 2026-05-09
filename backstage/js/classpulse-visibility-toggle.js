(function() {
  'use strict';

  function attach(opts) {
    var buttonEl      = opts.buttonEl;
    var getActiveQId  = opts.getActiveQId;
    var getSessionCode = opts.getSessionCode;
    var authToken     = opts.authToken;
    var callWorkerFn  = opts.callWorker;
    var labels        = opts.labels || {
      visible: 'Esconder resultados no projetor',
      hidden:  'Mostrar resultados no projetor'
    };
    var onError       = typeof opts.onError === 'function' ? opts.onError : function() {};

    // Default state matches Worker's default (show_results='true' at launch).
    var visible = true;

    function applyState() {
      if (visible) {
        buttonEl.textContent = labels.visible;
        buttonEl.classList.add('host-btn-primary');
        buttonEl.classList.remove('host-btn-ghost');
        buttonEl.setAttribute('aria-pressed', 'true');
      } else {
        buttonEl.textContent = labels.hidden;
        buttonEl.classList.add('host-btn-ghost');
        buttonEl.classList.remove('host-btn-primary');
        buttonEl.setAttribute('aria-pressed', 'false');
      }
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
