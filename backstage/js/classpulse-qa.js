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
    var _activeStudentQuestionId = null;
    var _activeQuestionId = null;
    var _activeQuestionText = null;
    var _drafts = {};
    var _focusedRowId = null;
    var _resolvedOpen = false;
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
      if (!toggleEl) return;
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
        render();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      });
    }

    function render() {
      // D2: skip full re-render while the user is typing in any answer textarea.
      // Drafts are still hoisted (D1) so a later render will repopulate them.
      if (_focusedRowId !== null) {
        updateBadgeOnly();
        return;
      }

      // Read current "Ver resolvidas" open state before we replace innerHTML, so the poll tick
      // doesn't collapse the details on the user.
      var prevDetails = feedEl.querySelector('details.cp-qa-resolved');
      if (prevDetails) _resolvedOpen = prevDetails.open;

      var pending  = _questions.filter(function(q) { return q.status === 'pending'; });
      var resolved = _questions.filter(function(q) { return q.status !== 'pending'; }).reverse();

      updateBadge(pending.length);

      var html = '';
      if (pending.length === 0 && resolved.length === 0) {
        html = '<p class="cp-qa-empty">Nenhuma pergunta ainda.</p>';
      } else {
        pending.forEach(function(q) { html += renderRow(q, true); });
        if (resolved.length) {
          html += '<details class="cp-qa-resolved"' + (_resolvedOpen ? ' open' : '') + '><summary>Ver resolvidas (' + resolved.length + ')</summary>';
          resolved.forEach(function(q) { html += renderRow(q, false); });
          html += '</details>';
        }
      }
      feedEl.innerHTML = html;
      restoreDrafts();
      wireRowEvents();
      wireResolvedToggle();
    }

    function wireResolvedToggle() {
      var d = feedEl.querySelector('details.cp-qa-resolved');
      if (!d) return;
      d.addEventListener('toggle', function() { _resolvedOpen = d.open; });
    }

    function updateBadgeOnly() {
      var pending = _questions.filter(function(q) { return q.status === 'pending'; });
      updateBadge(pending.length);
    }

    function updateBadge(count) {
      if (!badgeEl) return;
      badgeEl.textContent = count ? String(count) : '';
      badgeEl.style.display = count ? '' : 'none';
    }

    function renderRow(q, showActions) {
      var onDisplay = _activeStudentQuestionId === q.id;
      var rowClasses = 'cp-qa-row cp-qa-' + q.status + (onDisplay ? ' cp-qa-pinned' : '');
      var html = '<div class="' + rowClasses + '" data-qa-row-id="' + escHtml(q.id) + '">'
        + '<div class="cp-qa-meta-row">'
        +   '<span class="cp-qa-meta">' + escHtml(q.student_name) + ' &middot; ' + formatTime(q.created_at) + '</span>'
        +   (onDisplay ? '<span class="cp-qa-pin-badge">No display</span>' : '')
        + '</div>'
        + '<p class="cp-qa-text">' + escHtml(q.text) + '</p>';

      if (q.answer && q.status !== 'pending') {
        html += '<p class="cp-qa-answer-text"><strong>Resposta:</strong> ' + escHtml(q.answer) + '</p>';
      }

      if (showActions && onDisplay) {
        html += '<div class="cp-qa-actions"><div class="cp-qa-action-buttons">'
          + '<button class="host-btn host-btn-danger cp-qa-btn-sm" data-qa-action="close-active" data-qa-id="' + escHtml(q.id) + '">Encerrar pergunta no display</button>'
          + '</div></div>';
      } else if (showActions) {
        html += '<div class="cp-qa-actions">'
          + '<textarea class="cp-qa-answer-input" data-qa-answer-input="' + escHtml(q.id) + '" placeholder="Resposta direta (opcional, sem ir para o display)..." maxlength="500" rows="2"></textarea>'
          + '<div class="cp-qa-action-buttons">'
          +   '<button class="host-btn host-btn-primary cp-qa-btn-sm" data-qa-action="promote" data-qa-id="' + escHtml(q.id) + '">Mostrar no display</button>'
          +   '<button class="host-btn host-btn-ghost cp-qa-btn-sm" data-qa-action="answer" data-qa-id="' + escHtml(q.id) + '">Responder aqui</button>'
          +   '<button class="host-btn host-btn-ghost cp-qa-btn-sm" data-qa-action="dismiss" data-qa-id="' + escHtml(q.id) + '">Ignorar</button>'
          +   '<button class="host-btn host-btn-danger cp-qa-btn-sm" data-qa-action="delete" data-qa-id="' + escHtml(q.id) + '" title="Apagar pergunta">Apagar</button>'
          + '</div>'
          + '</div>';
      } else if (q.status !== 'pending') {
        html += '<div class="cp-qa-actions"><div class="cp-qa-action-buttons">'
          + '<button class="host-btn host-btn-ghost cp-qa-btn-sm" data-qa-action="promote" data-qa-id="' + escHtml(q.id) + '">Mostrar no display</button>'
          + '<button class="host-btn host-btn-danger cp-qa-btn-sm" data-qa-action="delete" data-qa-id="' + escHtml(q.id) + '" title="Apagar pergunta">Apagar</button>'
          + '</div></div>';
      }
      html += '</div>';
      return html;
    }

    function restoreDrafts() {
      var inputs = feedEl.querySelectorAll('[data-qa-answer-input]');
      for (var i = 0; i < inputs.length; i++) {
        var rowId = inputs[i].dataset.qaAnswerInput;
        if (_drafts[rowId]) inputs[i].value = _drafts[rowId];
      }
    }

    function wireRowEvents() {
      var inputs = feedEl.querySelectorAll('[data-qa-answer-input]');
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', onInputChange);
        inputs[i].addEventListener('focus', onInputFocus);
        inputs[i].addEventListener('blur', onInputBlur);
      }
      var buttons = feedEl.querySelectorAll('[data-qa-action]');
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].addEventListener('click', onActionClick);
      }
    }

    function onInputChange(ev) {
      var rowId = ev.currentTarget.dataset.qaAnswerInput;
      _drafts[rowId] = ev.currentTarget.value;
    }

    function onInputFocus(ev) {
      _focusedRowId = ev.currentTarget.dataset.qaAnswerInput;
    }

    function onInputBlur(ev) {
      var rowId = ev.currentTarget.dataset.qaAnswerInput;
      _drafts[rowId] = ev.currentTarget.value;
      if (_focusedRowId === rowId) _focusedRowId = null;
      // re-poll so any deferred updates land
      poll();
    }

    function onActionClick(ev) {
      var btn = ev.currentTarget;
      var action = btn.dataset.qaAction;
      var id = btn.dataset.qaId;
      if (!action || !id || _busy) return;

      if (action === 'answer') {
        doUpdate(id, 'answered', _drafts[id] || '');
        delete _drafts[id];
      } else if (action === 'dismiss') {
        doUpdate(id, 'dismissed', null);
        delete _drafts[id];
      } else if (action === 'promote') {
        doPromote(id);
      } else if (action === 'close-active') {
        doCloseActive();
      } else if (action === 'delete') {
        doDelete(id);
      }
    }

    function doDelete(id) {
      if (!window.confirm('Apagar esta pergunta para sempre? A ação não pode ser desfeita.')) return;
      _busy = true;
      callWorkerFn({
        action: 'delete_student_question',
        auth_token: authToken,
        id: id
      }).then(function(res) {
        if (!res || !res.ok) {
          onError((res && res.error) || 'Falha ao apagar pergunta.');
        } else {
          delete _drafts[id];
        }
        poll();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      }).finally(function() { _busy = false; });
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

    function doPromote(id) {
      // If a different question is already active (instructor-launched OR a different student_qa),
      // explain that it'll be closed before we promote.
      if (_activeQuestionId && _activeStudentQuestionId !== id) {
        var snippet = (_activeQuestionText || '').replace(/\s+/g, ' ').trim();
        if (snippet.length > 90) snippet = snippet.slice(0, 87) + '...';
        var msg = 'Há uma pergunta ativa no display:\n\n"' + snippet + '"\n\nEncerrar essa pergunta e mostrar a pergunta do aluno no lugar dela?';
        if (!window.confirm(msg)) return;
      }
      _busy = true;
      callWorkerFn({
        action: 'promote_student_question',
        auth_token: authToken,
        id: id, session_code: sessionCode
      }).then(function(res) {
        if (!res || !res.ok) {
          onError((res && res.error) || 'Falha ao promover pergunta.');
        }
        poll();
        if (typeof opts.onPromoted === 'function') opts.onPromoted();
      }).catch(function(err) {
        onError(err && err.message ? err.message : String(err));
      }).finally(function() { _busy = false; });
    }

    function doCloseActive() {
      if (!_activeQuestionId) return;
      _busy = true;
      callWorkerFn({
        action: 'close_question',
        auth_token: authToken,
        id: _activeQuestionId,
        session_code: sessionCode,
        show_results: false,
        reveal_answer: false
      }).then(function(res) {
        if (!res || !res.ok) onError((res && res.error) || 'Falha ao encerrar pergunta.');
        poll();
        if (typeof opts.onClosedActive === 'function') opts.onClosedActive();
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

    if (toggleEl) {
      toggleEl.addEventListener('click', onToggleClick);
      setEnabled(false);
    } else {
      // No toggle UI = Q&A is implicitly always on. Force server state to
      // match so students can submit without an explicit teacher action.
      callWorkerFn({
        action: 'toggle_qa',
        auth_token: authToken,
        code: sessionCode,
        enabled: 1
      }).catch(function() {});
      setEnabled(true);
    }

    return {
      syncFromState: function(state) {
        if (!state) return;
        // Only follow server qa_enabled when the teacher has a toggle UI.
        // No toggle = Q&A is implicitly always on, ignore server reports.
        if (toggleEl && typeof state.qa_enabled !== 'undefined') {
          var serverEnabled = !!state.qa_enabled;
          if (serverEnabled !== _qaEnabled) setEnabled(serverEnabled);
        }
        var prevActive = _activeStudentQuestionId;
        var prevActiveQ = _activeQuestionId;
        if (state.active_question) {
          _activeQuestionId   = state.active_question.id;
          _activeQuestionText = state.active_question.text || '';
          _activeStudentQuestionId = state.active_question.type === 'student_qa'
            ? (state.active_question.student_question_id || null)
            : null;
        } else {
          _activeStudentQuestionId = null;
          _activeQuestionId = null;
          _activeQuestionText = null;
        }
        if (prevActive !== _activeStudentQuestionId || prevActiveQ !== _activeQuestionId) {
          render();
        }
      },
      setSessionCode: function(code) {
        sessionCode = code;
        if (_qaEnabled) poll();
      },
      destroy: function() {
        _attached = false;
        stopPoll();
        if (toggleEl) toggleEl.removeEventListener('click', onToggleClick);
      }
    };
  }

  window.ClassPulseQA = { attach: attach };
})();
