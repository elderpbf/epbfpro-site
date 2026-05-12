(function() {
  'use strict';

  function attach(opts) {
    var buttonEl      = opts.buttonEl;
    var getActiveQId  = opts.getActiveQId;
    var getSessionCode = opts.getSessionCode;
    var authToken     = opts.authToken;
    var callWorkerFn  = opts.callWorker;
    var onError       = typeof opts.onError === 'function' ? opts.onError : function() {};

    buttonEl.innerHTML =
      '<span class="cp-toggle-switch" aria-hidden="true"><span class="cp-toggle-knob"></span></span>' +
      '<span class="cp-toggle-label">Esconder resposta</span>';

    // hidden=true → switch ON → results not shown to students.
    var hidden = true;

    function applyState() {
      buttonEl.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    }

    applyState();

    function onClick() {
      var qId = getActiveQId();
      if (!qId) return;
      var nextHidden = !hidden;
      buttonEl.disabled = true;
      callWorkerFn({
        action: 'set_question_visibility',
        auth_token: authToken,
        id: qId,
        session_code: getSessionCode(),
        show_results: !nextHidden
      })
        .then(function(res) {
          if (res && res.ok) {
            hidden = nextHidden;
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
      hidden = true;
      applyState();
      buttonEl.disabled = false;
    }

    function syncFromQuestion(q) {
      hidden = !(q && q.show_results === true);
      applyState();
    }

    function destroy() {
      buttonEl.removeEventListener('click', onClick);
    }

    return { reset: reset, syncFromQuestion: syncFromQuestion, destroy: destroy };
  }

  window.CPVisibilityToggle = { attach: attach };
})();
