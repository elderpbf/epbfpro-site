(function() {
  'use strict';

  function attach(opts) {
    var checkboxEl    = opts.checkboxEl;
    var getActiveQId  = opts.getActiveQId;
    var getSessionCode = opts.getSessionCode;
    var authToken     = opts.authToken;
    var callWorkerFn  = opts.callWorker;
    var onError       = typeof opts.onError === 'function' ? opts.onError : function() {};

    // Internal state mirrors checkbox: hidden === checkbox.checked
    var hidden = false;
    checkboxEl.checked = false;

    function onChange() {
      var qId = getActiveQId();
      if (!qId) {
        checkboxEl.checked = hidden;
        return;
      }
      var nextHidden = checkboxEl.checked;
      checkboxEl.disabled = true;
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
          } else {
            checkboxEl.checked = hidden;
            onError((res && res.error) || 'Erro ao atualizar visibilidade.');
          }
        })
        .catch(function(err) {
          checkboxEl.checked = hidden;
          onError(err && err.message ? err.message : String(err));
        })
        .finally(function() {
          checkboxEl.disabled = false;
        });
    }

    checkboxEl.addEventListener('change', onChange);

    function reset() {
      hidden = false;
      checkboxEl.checked = false;
      checkboxEl.disabled = false;
    }

    function syncFromQuestion(q) {
      if (q && q.show_results === false) {
        hidden = true;
        checkboxEl.checked = true;
      } else {
        hidden = false;
        checkboxEl.checked = false;
      }
    }

    function destroy() {
      checkboxEl.removeEventListener('change', onChange);
    }

    return { reset: reset, syncFromQuestion: syncFromQuestion, destroy: destroy };
  }

  window.CPVisibilityToggle = { attach: attach };
})();
