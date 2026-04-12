'use strict';

// ============================================================
// ClassPulse Embed
// Scans for .cf-classpulse-embed[data-session][data-question-id]
// or .cf-classpulse-embed[data-slug] and polls the Worker every 3s
// to render live results.
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
    var slug       = container.dataset.slug;

    function showWaiting() {
      if (container.dataset.state === 'waiting') return;
      container.dataset.state = 'waiting';
      container.innerHTML = '<p style="text-align:center;opacity:.6;font-size:0.9em">Aguardando quest\u00e3o...</p>';
    }

    function poll() {
      if (!container.isConnected) return;
      callWorker({ action: 'get_session_state', code: session, _silent: true }).then(function(data) {
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

    function armPoll() {
      showWaiting();
      poll();
      var id = setInterval(function() {
        if (!container.isConnected) { clearInterval(id); return; }
        poll();
      }, POLL_MS);
      _timers.push(id);
    }

    // Slug-mode: resolve session code dynamically; retries every 10s until a session is linked
    if (slug && !session) {
      var tryResolveSlug = function tryResolveSlug() {
        if (!container.isConnected) return;
        callWorker({ action: 'get_linked_session', slug: slug, _silent: true }).then(function(data) {
          if (!container.isConnected) return;
          if (!data.session) {
            container.innerHTML = '<p style="text-align:center;opacity:.6;font-size:0.9em">Aguardando sess\u00e3o vinculada\u2026</p>';
            setTimeout(tryResolveSlug, 10000);
            return;
          }
          session = data.session.code;
          armPoll();
        }).catch(function() {
          if (container.isConnected) setTimeout(tryResolveSlug, 10000);
        });
      };
      tryResolveSlug();
      return;
    }

    if (!session) return;
    armPoll();
  }

  function scan() {
    var els = document.querySelectorAll('.cf-classpulse-embed[data-session][data-question-id], .cf-classpulse-embed[data-slug]');
    els.forEach(function(el) {
      if (el.dataset.embedStarted) return;
      el.dataset.embedStarted = '1';
      startEmbed(el);
    });
  }

  document.addEventListener('DOMContentLoaded', scan);

  window.ClassPulseEmbed = { scan: scan, stopAll: stopAll };
}());
