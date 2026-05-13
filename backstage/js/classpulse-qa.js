(function() {
  'use strict';

  var POLL_MS = 4000;

  function attach(opts) {
    var sessionCode  = opts.sessionCode;
    var authToken    = opts.authToken;
    var callWorkerFn = opts.callWorker;
    var containerEl  = opts.containerEl;
    var toggleEl     = opts.toggleEl;
    var badgeEl      = opts.badgeEl;
    var feedEl       = opts.feedEl;
    var onError      = typeof opts.onError === 'function' ? opts.onError : function() {};

    var _qaEnabled = false;
    var _busy      = false;
    var _questions = [];
    var _pinnedId  = null;
    var _pollTimer = null;
    var _attached  = true;

    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatTime(iso) {
      try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
      catch (_) { return ''; }
    }

    function setToggleUI(enabled, disabled) {
      toggleEl.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      toggleEl.dataset.qaEnabled = enabled ? '1' : '0';
      toggleEl.textContent = enabled ? 'Desativar Q&A' : 'Ativar Q&A';
      toggleEl.disabled = !!disabled;
    }

    function setEnabled(enabled) {
      _qaEnabled = !!enabled;
      setToggleUI(_qaEnabled, false);
      containerEl.style.display = _qaEnabled ? '' : 'none';
      if (_qaEnabled) {
        startPoll();
      } else {
        stopPoll();
        _questions = [];
        _pinnedId = null;
        render();
      }
    }

    function startPoll() {
      if (_pollTimer) return;
      poll();
      _pollTimer = setInterval(poll, POLL_MS);
    }

    function stopPoll() {
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    function poll() {
      if (!_attached || !_qaEnabled) return;
      callWorkerFn({
        action: 'list_student_questions',
        auth_token: authToken,
        session_code: sessionCode
      }).then(function(res) {
        if (!res || !res.ok) return;
        _questions = res.questions || [];
        var pinnedNow = _questions.find(function(q) { return q.pinned === 1 || q.pinned === '1' || q.pinned === true; });
        _pinnedId = pinnedNow ? pinnedNow.id : null;
        render();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      });
    }

    function render() {
      var pending  = _questions.filter(function(q) { return q.status === 'pending'; });
      var resolved = _questions.filter(function(q) { return q.status !== 'pending'; });

      badgeEl.textContent = pending.length ? String(pending.length) : '';
      badgeEl.style.display = pending.length ? '' : 'none';

      var html = '';
      if (pending.length === 0 && resolved.length === 0) {
        html = '<p class="cp-qa-empty">Nenhuma pergunta ainda.</p>';
      } else {
        pending.forEach(function(q) { html += renderRow(q, true); });
        if (resolved.length) {
          html += '<details class="cp-qa-resolved"><summary>Ver resolvidas (' + resolved.length + ')</summary>';
          resolved.forEach(function(q) { html += renderRow(q, false); });
          html += '</details>';
        }
      }
      feedEl.innerHTML = html;
      wireRowButtons();
    }

    function renderRow(q, showActions) {
      var isPinned = q.pinned === 1 || q.pinned === '1' || q.pinned === true;
      var rowClasses = 'cp-qa-row cp-qa-' + q.status + (isPinned ? ' cp-qa-pinned' : '');
      var html = '<div class="' + rowClasses + '" data-qa-row-id="' + escHtml(q.id) + '">'
        + '<div class="cp-qa-meta-row">'
        +   '<span class="cp-qa-meta">' + escHtml(q.student_name) + ' &middot; ' + formatTime(q.created_at) + '</span>'
        +   (isPinned ? '<span class="cp-qa-pin-badge">No display</span>' : '')
        + '</div>'
        + '<p class="cp-qa-text">' + escHtml(q.text) + '</p>';

      if (q.status === 'answered' && q.answer) {
        html += '<p class="cp-qa-answer-text"><strong>Resposta:</strong> ' + escHtml(q.answer) + '</p>';
      }

      if (showActions) {
        html += '<div class="cp-qa-actions">'
          + '<textarea class="cp-qa-answer-input" data-qa-answer-input="' + escHtml(q.id) + '" placeholder="Resposta (opcional)..." maxlength="500" rows="2"></textarea>'
          + '<div class="cp-qa-action-buttons">'
          +   '<button class="host-btn host-btn-primary cp-qa-btn-sm" data-qa-action="answer" data-qa-id="' + escHtml(q.id) + '">Responder</button>'
          +   '<button class="host-btn host-btn-ghost cp-qa-btn-sm" data-qa-action="' + (isPinned ? 'unpin' : 'pin') + '" data-qa-id="' + escHtml(q.id) + '">'
          +     (isPinned ? 'Tirar do display' : 'Mostrar no display')
          +   '</button>'
          +   '<button class="host-btn host-btn-danger cp-qa-btn-sm" data-qa-action="dismiss" data-qa-id="' + escHtml(q.id) + '">Ignorar</button>'
          + '</div>'
          + '</div>';
      } else if (isPinned) {
        html += '<div class="cp-qa-actions"><div class="cp-qa-action-buttons">'
          + '<button class="host-btn host-btn-ghost cp-qa-btn-sm" data-qa-action="unpin" data-qa-id="' + escHtml(q.id) + '">Tirar do display</button>'
          + '</div></div>';
      }
      html += '</div>';
      return html;
    }

    function wireRowButtons() {
      var buttons = feedEl.querySelectorAll('[data-qa-action]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', onActionClick);
      }
    }

    function onActionClick(ev) {
      var btn = ev.currentTarget;
      var action = btn.dataset.qaAction;
      var id = btn.dataset.qaId;
      if (!action || !id || _busy) return;

      if (action === 'answer') {
        var input = feedEl.querySelector('[data-qa-answer-input="' + id + '"]');
        var answerText = input ? input.value.trim() : '';
        doUpdate(id, 'answered', answerText);
      } else if (action === 'dismiss') {
        doUpdate(id, 'dismissed', null);
      } else if (action === 'pin') {
        doPin(id);
      } else if (action === 'unpin') {
        doUnpin();
      }
    }

    function doUpdate(id, status, answer) {
      _busy = true;
      callWorkerFn({
        action: 'update_student_question',
        auth_token: authToken,
        id: id, status: status, answer: answer
      }).then(function(res) {
        if (!res || !res.ok) onError((res && res.error) || 'Falha ao atualizar pergunta.');
        poll();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      }).finally(function() { _busy = false; });
    }

    function doPin(id) {
      _busy = true;
      callWorkerFn({
        action: 'pin_student_question',
        auth_token: authToken,
        id: id, session_code: sessionCode
      }).then(function(res) {
        if (!res || !res.ok) onError((res && res.error) || 'Falha ao fixar pergunta.');
        poll();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      }).finally(function() { _busy = false; });
    }

    function doUnpin() {
      _busy = true;
      callWorkerFn({
        action: 'unpin_student_question',
        auth_token: authToken,
        session_code: sessionCode
      }).then(function(res) {
        if (!res || !res.ok) onError((res && res.error) || 'Falha ao desafixar pergunta.');
        poll();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      }).finally(function() { _busy = false; });
    }

    function onToggleClick() {
      var next = !_qaEnabled;
      toggleEl.disabled = true;
      callWorkerFn({
        action: 'toggle_qa',
        auth_token: authToken,
        code: sessionCode,
        enabled: next ? 1 : 0
      }).then(function(res) {
        if (res && res.ok) {
          setEnabled(!!res.qa_enabled);
        } else {
          onError((res && res.error) || 'Falha ao alternar Q&A.');
          setToggleUI(_qaEnabled, false);
        }
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
        setToggleUI(_qaEnabled, false);
      });
    }

    toggleEl.addEventListener('click', onToggleClick);
    setEnabled(false);

    return {
      syncFromState: function(state) {
        if (!state || typeof state.qa_enabled === 'undefined') return;
        var serverEnabled = !!state.qa_enabled;
        if (serverEnabled !== _qaEnabled) setEnabled(serverEnabled);
      },
      setSessionCode: function(code) {
        sessionCode = code;
        if (_qaEnabled) poll();
      },
      destroy: function() {
        _attached = false;
        stopPoll();
        toggleEl.removeEventListener('click', onToggleClick);
      }
    };
  }

  window.ClassPulseQA = { attach: attach };
})();
