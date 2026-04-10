'use strict';

// ============================================================
// ClassPulse Embed
// Scans for .cf-classpulse-embed[data-session][data-question-id]
// and polls the Worker every 3s to render live results.
//
// Depends on: api-client.js (callWorker), question-renderer.js (QR)
// Exposes: window.ClassPulseEmbed = { scan, stopAll }
// ============================================================

(function() {
  var POLL_MS = 3000;
  var _timers = [];

  function stopAll() {
    _timers.forEach(function(id) { clearInterval(id); });
    _timers = [];
  }

  function startEmbed(container) {
    var session    = container.dataset.session;
    var questionId = container.dataset.questionId;

    if (!session) return;

    function showWaiting() {
      if (container.dataset.state === 'waiting') return;
      container.dataset.state = 'waiting';
      container.innerHTML = '<p style="text-align:center;opacity:.6;font-size:0.9em">Aguardando questão...</p>';
    }

    function poll() {
      if (!container.isConnected) return;
      callWorker({ action: 'get_session_state', code: session }).then(function(data) {
        if (!container.isConnected) return;
        var aq = data.active_question;
        if (!aq) { showWaiting(); return; }
        // Match by questionId if not placeholder
        if (questionId && questionId !== 'PLACEHOLDER' && aq.id !== questionId) {
          showWaiting(); return;
        }
        container.dataset.state = 'active';
        QR.renderResults(aq, aq.answer_counts || [], container, { mode: 'display' });
      }).catch(function() {
        if (container.isConnected) showWaiting();
      });
    }

    showWaiting();
    poll();
    var id = setInterval(function() {
      if (!container.isConnected) { clearInterval(id); return; }
      poll();
    }, POLL_MS);
    _timers.push(id);
  }

  function scan() {
    var els = document.querySelectorAll('.cf-classpulse-embed[data-session][data-question-id]');
    els.forEach(function(el) {
      if (el.dataset.embedStarted) return;
      el.dataset.embedStarted = '1';
      startEmbed(el);
    });
  }

  document.addEventListener('DOMContentLoaded', scan);

  window.ClassPulseEmbed = { scan: scan, stopAll: stopAll };
}());
