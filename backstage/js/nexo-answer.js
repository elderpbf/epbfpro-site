'use strict';

// ============================================================
// NexoAnswer
//
// Inline student-side answer panel for live ClassPulse sessions.
// Extracted from the legacy /go/index.html flow so that both
// trilha (primary, in-place takeover) and /go (legacy shim) can
// share the same UI.
//
// Usage:
//   NexoAnswer.mount({
//     container:    HTMLElement,   // required: where to render
//     sessionCode:  '5K78',        // required
//     sessionTitle: 'Aula 3',      // optional
//     studentName:  'Anônimo',     // optional; defaults to bs_anon_id
//     onClose:      function() {}, // optional: called when session ends
//   });
//   NexoAnswer.unmount();
//
// The mount is idempotent: calling mount() with a new sessionCode
// replaces any existing mount.
// ============================================================

(function () {

  var STRINGS = {
    btnRetry:      'Tentar novamente',
    errSubmit:     'Falha ao enviar. Tente novamente.',
    errTimeout:    'Tempo esgotado para esta pergunta.',
    errConnection: 'Erro de conexão. Tente novamente.',
  };

  var _state = null; // { container, sessionCode, ... }

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _ensureAnonName() {
    var KEY = 'bs_anon_id';
    var name = null;
    try { name = localStorage.getItem(KEY); } catch (_) {}
    if (!name) {
      name = 'Anon_' + Math.random().toString(36).slice(2, 5).toUpperCase();
      try { localStorage.setItem(KEY, name); } catch (_) {}
    }
    return name;
  }

  function _buildShell(sessionTitle) {
    // Light-DOM markup. Re-uses .nx-answer-* classes defined in
    // trilha.css (or any future host page that wants the same shell).
    var titleHtml = sessionTitle
      ? '<div class="nx-answer-title">' + _esc(sessionTitle) + '</div>'
      : '';
    return (
      '<div class="nx-answer-shell">' +
        '<div class="nx-answer-header">' +
          '<div class="nx-answer-eyebrow">' +
            '<span class="nx-pill-dot" aria-hidden="true"></span>' +
            'Pergunta ao vivo' +
          '</div>' +
          titleHtml +
        '</div>' +
        '<div class="nx-answer-body">' +
          '<div class="nx-state nx-state-waiting nx-active">' +
            '<div class="nx-state-icon" aria-hidden="true">⏳</div>' +
            '<div class="nx-state-title">Aguardando próxima pergunta…</div>' +
          '</div>' +
          '<div class="nx-state nx-state-cpq">' +
            '<h2 class="nx-q-text"></h2>' +
            '<classpulse-question class="nx-cpq" mode="student"></classpulse-question>' +
            '<p class="nx-sending" hidden>Enviando…</p>' +
            '<div class="nx-answer-error" role="alert"></div>' +
            '<div class="nx-results-footer" hidden>Próxima pergunta em breve…</div>' +
          '</div>' +
          '<div class="nx-state nx-state-answered">' +
            '<div class="nx-state-icon" aria-hidden="true">✓</div>' +
            '<div class="nx-state-title">Resposta enviada!</div>' +
            '<div class="nx-state-sub">Aguardando o resultado…</div>' +
          '</div>' +
          '<div class="nx-state nx-state-closed">' +
            '<div class="nx-state-icon" aria-hidden="true">✓</div>' +
            '<div class="nx-state-title">Sessão encerrada</div>' +
            '<div class="nx-state-sub">Obrigado pela participação!</div>' +
          '</div>' +
          '<div class="nx-state nx-state-student-qa nx-sqa-card">' +
            '<div class="nx-sqa-label">Pergunta do aluno</div>' +
            '<div class="nx-sqa-meta"></div>' +
            '<div class="nx-sqa-text"></div>' +
            '<div class="nx-sqa-answer-wrap" hidden>' +
              '<div class="nx-sqa-answer-label">Resposta</div>' +
              '<div class="nx-sqa-answer-text"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function _showState(name) {
    if (!_state) return;
    var states = ['waiting', 'cpq', 'answered', 'closed', 'student-qa'];
    states.forEach(function (s) {
      var el = _state.container.querySelector('.nx-state-' + s);
      if (!el) return;
      var on = (s === name);
      el.classList.toggle('nx-active', on);
      // querySelector returns native nodes — style.display ensures display
      // even if CSS for .nx-active isn't loaded yet.
      el.style.display = on ? '' : 'none';
    });
  }

  function _formatStudentQaTime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function _syncStudentQa(data) {
    if (!_state) return;
    var aq = data && data.active_question;
    if (aq && aq.type === 'student_qa') {
      var metaEl = _state.container.querySelector('.nx-sqa-meta');
      var textEl = _state.container.querySelector('.nx-sqa-text');
      var ansWrap = _state.container.querySelector('.nx-sqa-answer-wrap');
      var ansEl  = _state.container.querySelector('.nx-sqa-answer-text');
      var meta = [aq.student_name || 'Anônimo', _formatStudentQaTime(aq.student_time)].filter(Boolean).join(' · ');
      if (metaEl) metaEl.textContent = meta;
      if (textEl) textEl.textContent = aq.text || '';
      var ans = (aq.student_answer || '').trim();
      if (ans) {
        if (ansEl) ansEl.textContent = ans;
        if (ansWrap) ansWrap.hidden = false;
      } else {
        if (ansWrap) ansWrap.hidden = true;
      }
      _showState('student-qa');
      return true;
    }
    return false;
  }

  function _wireCpq() {
    if (!_state) return;
    var container = _state.container;
    var cpqEl = container.querySelector('.nx-cpq');
    if (!cpqEl) return;
    _state.cpqEl = cpqEl;

    cpqEl.addEventListener('cpq-data', function (e) {
      var data = e.detail;
      if (!data || !data.session || data.session.status === 'closed') {
        _showState('closed');
        if (typeof _state.onClose === 'function') {
          try { _state.onClose(); } catch (_) {}
        }
        return;
      }
      // student_qa active questions render via _syncStudentQa, not the cpq pipeline.
      if (_syncStudentQa(data)) return;
    });

    cpqEl.addEventListener('cpq-idle', function () {
      _showState('waiting');
      _state.activeQ = null;
    });

    cpqEl.addEventListener('cpq-inactivity-pause', function () {
      var qTextEl = container.querySelector('.nx-q-text');
      var footer = container.querySelector('.nx-results-footer');
      if (qTextEl) qTextEl.textContent = '';
      if (footer) footer.hidden = true;
      _showState('cpq');
    });

    cpqEl.addEventListener('cpq-question', function (e) {
      var row = e.detail;
      if (row && row.type === 'student_qa') return;
      _state.activeQ = { id: row.id, text: row.text, options: row.options, type: row.type };
      var qTextEl = container.querySelector('.nx-q-text');
      var errEl   = container.querySelector('.nx-answer-error');
      var footer  = container.querySelector('.nx-results-footer');
      if (qTextEl) qTextEl.textContent = row.text;
      if (errEl)   errEl.textContent = '';
      if (footer)  footer.hidden = true;

      var myAnswer = null;
      try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) {}
      if (myAnswer !== null) {
        _showState('answered');
      } else {
        cpqEl.removeAttribute('my-answer');
        _showState('cpq');
      }
    });

    cpqEl.addEventListener('cpq-revealed', function (e) {
      var row = e.detail;
      if (row && row.type === 'student_qa') return;
      var qTextEl = container.querySelector('.nx-q-text');
      var footer  = container.querySelector('.nx-results-footer');
      var sending = container.querySelector('.nx-sending');
      var errEl   = container.querySelector('.nx-answer-error');
      if (qTextEl) qTextEl.textContent = row.text;
      if (footer)  footer.hidden = false;
      if (sending) sending.hidden = true;
      if (errEl)   errEl.textContent = '';

      var myAnswer = null;
      try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) {}
      if (myAnswer !== null) cpqEl.setAttribute('my-answer', myAnswer);
      _showState('cpq');
    });

    cpqEl.addEventListener('cpq-submit', function (e) {
      var detail = e.detail;
      if (detail.type === 'indices')      _submitMulti(detail.value);
      else if (detail.type === 'index')   _submitIndex(detail.value, detail.el);
      else                                _submitValue(detail.value);
    });
  }

  async function _submitIndex(answerIndex, btn) {
    if (!_state || !_state.activeQ) return;
    var container = _state.container;
    var allBtns = container.querySelectorAll('.qr-option-btn');
    Array.prototype.forEach.call(allBtns, function (b) { b.disabled = true; });
    if (btn) btn.classList.add('selected');
    var sending = container.querySelector('.nx-sending');
    var errEl   = container.querySelector('.nx-answer-error');
    if (errEl)   errEl.textContent = '';
    if (sending) sending.hidden = false;
    var qId = _state.activeQ.id;
    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:  qId,
        session_code: _state.sessionCode,
        student_name: _state.studentName,
        answer_index: answerIndex
      });
      if (result.ok || result.error === 'already answered') {
        try { localStorage.setItem('cl_ans_' + qId, String(answerIndex)); } catch (_) {}
        _showState('answered');
      } else {
        Array.prototype.forEach.call(allBtns, function (b) { b.disabled = false; });
        if (btn) btn.classList.remove('selected');
        if (sending) sending.hidden = true;
        if (errEl) errEl.textContent =
          result.error === 'question is not active' ? STRINGS.errTimeout : STRINGS.errSubmit;
      }
    } catch (_) {
      Array.prototype.forEach.call(allBtns, function (b) { b.disabled = false; });
      if (btn) btn.classList.remove('selected');
      if (sending) sending.hidden = true;
      if (errEl) errEl.textContent = STRINGS.errConnection;
    }
  }

  async function _submitMulti(indices) {
    if (!_state || !_state.activeQ || !Array.isArray(indices) || !indices.length) return;
    var container = _state.container;
    var allBtns = container.querySelectorAll('.qr-option-btn');
    Array.prototype.forEach.call(allBtns, function (b) { b.disabled = true; });
    var submitBtn = container.querySelector('.qr-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    var sending = container.querySelector('.nx-sending');
    var errEl   = container.querySelector('.nx-answer-error');
    if (errEl)   errEl.textContent = '';
    if (sending) sending.hidden = false;
    var qId = _state.activeQ.id;
    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:    qId,
        session_code:   _state.sessionCode,
        student_name:   _state.studentName,
        answer_indices: indices
      });
      if (result.ok || result.error === 'Você já enviou resposta.') {
        try { localStorage.setItem('cl_ans_' + qId, JSON.stringify(indices)); } catch (_) {}
        _showState('answered');
      } else {
        Array.prototype.forEach.call(allBtns, function (b) { b.disabled = false; });
        if (submitBtn) submitBtn.disabled = false;
        if (sending) sending.hidden = true;
        if (errEl) errEl.textContent =
          result.error === 'VALIDATION_FAILED' ? result.message : STRINGS.errSubmit;
      }
    } catch (_) {
      Array.prototype.forEach.call(allBtns, function (b) { b.disabled = false; });
      if (submitBtn) submitBtn.disabled = false;
      if (sending) sending.hidden = true;
      if (errEl) errEl.textContent = STRINGS.errConnection;
    }
  }

  async function _submitValue(value) {
    if (!_state || !_state.activeQ) return;
    if (!value || typeof value !== 'string') return;
    var container = _state.container;
    var btn = container.querySelector('.qr-submit-btn') ||
              container.querySelector('.qr-rating-btn.selected');
    if (btn) btn.disabled = true;
    var sending = container.querySelector('.nx-sending');
    var errEl   = container.querySelector('.nx-answer-error');
    if (errEl)   errEl.textContent = '';
    if (sending) sending.hidden = false;
    var qId = _state.activeQ.id;
    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:  qId,
        session_code: _state.sessionCode,
        student_name: _state.studentName,
        answer_value: value
      });
      if (result.ok || result.error === 'Você já enviou resposta.') {
        try { localStorage.setItem('cl_ans_' + qId, '1'); } catch (_) {}
        _showState('answered');
      } else {
        if (btn) btn.disabled = false;
        if (sending) sending.hidden = true;
        if (errEl) errEl.textContent =
          result.error === 'Question is closed' ? STRINGS.errTimeout :
          result.error === 'VALIDATION_FAILED'  ? result.message :
          STRINGS.errSubmit;
      }
    } catch (_) {
      if (btn) btn.disabled = false;
      if (sending) sending.hidden = true;
      if (errEl) errEl.textContent = STRINGS.errConnection;
    }
  }

  // ---- public API ---------------------------------------------------------

  function mount(opts) {
    opts = opts || {};
    if (!opts.container) return;
    if (!opts.sessionCode) return;

    // If we're already mounted on the same session, do nothing — the
    // classpulse-question component owns the live state.
    if (_state &&
        _state.container === opts.container &&
        _state.sessionCode === opts.sessionCode) {
      return;
    }
    if (_state) unmount();

    var studentName = opts.studentName || _ensureAnonName();

    opts.container.innerHTML = _buildShell(opts.sessionTitle);

    _state = {
      container:    opts.container,
      sessionCode:  opts.sessionCode,
      sessionTitle: opts.sessionTitle || '',
      studentName:  studentName,
      onClose:      typeof opts.onClose === 'function' ? opts.onClose : null,
      cpqEl:        null,
      activeQ:      null,
    };

    _wireCpq();

    // Boot the live polling
    if (_state.cpqEl) {
      _state.cpqEl.setAttribute('session', opts.sessionCode);
    }
    _showState('waiting');
  }

  function unmount() {
    if (!_state) return;
    if (_state.cpqEl) {
      // Stop polling by removing the session attribute.
      try { _state.cpqEl.removeAttribute('session'); } catch (_) {}
    }
    try { _state.container.innerHTML = ''; } catch (_) {}
    _state = null;
  }

  window.NexoAnswer = {
    mount:   mount,
    unmount: unmount,
  };

})();
