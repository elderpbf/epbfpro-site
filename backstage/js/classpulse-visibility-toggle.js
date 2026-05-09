(function() {
  'use strict';

  function attach(opts) {
    var buttonEl      = opts.buttonEl;
    var getActiveQId  = opts.getActiveQId;
    var getSessionCode = opts.getSessionCode;
    var authToken     = opts.authToken;
    var callWorkerFn  = opts.callWorker;
    var labels        = opts.labels || { show: 'Mostrar resultados no projetor', hide: 'Esconder resultados no projetor' };
    var onError       = typeof opts.onError === 'function' ? opts.onError : function() {};

    var barsVisible = false;

    buttonEl.textContent = labels.show;

    function onClick() {
      var qId = getActiveQId();
      if (!qId) return;
      buttonEl.disabled = true;
      var next = !barsVisible;
      callWorkerFn({ action: 'set_question_visibility', auth_token: authToken, id: qId, session_code: getSessionCode(), show_results: next })
        .then(function(res) {
          if (res && res.ok) {
            barsVisible = next;
            buttonEl.textContent = barsVisible ? labels.hide : labels.show;
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
      barsVisible = false;
      buttonEl.textContent = labels.show;
      buttonEl.disabled = false;
    }

    function syncFromQuestion(q) {
      if (q && q.show_results === true) {
        barsVisible = true;
        buttonEl.textContent = labels.hide;
      } else {
        barsVisible = false;
        buttonEl.textContent = labels.show;
      }
    }

    function destroy() {
      buttonEl.removeEventListener('click', onClick);
    }

    return { reset: reset, syncFromQuestion: syncFromQuestion, destroy: destroy };
  }

  window.CPVisibilityToggle = { attach: attach };
})();
