'use strict';

// ============================================================
// NexoAnswer, mountable ClassPulse answer experience
//
// Mirrors the full /go/index.html "session-screen" body so the
// trilha page can swap its content area for the live answer UI
// when the turma's ClassPulse session is open. Trilha's chrome
// (pensoia-header, WhatsApp pill, A−/A+) stays visible.
//
// /go/index.html is intentionally NOT touched; it keeps the
// legacy join-screen + this same answer surface inline. This
// module is trilha-only for now. A future bundle can fold /go
// into the same module once stable.
//
// Public API (on window.NexoAnswer):
//   mount(host, opts)
//     host        : HTMLElement to fill with the answer body
//     opts.sessionCode : 4-char session code (never surfaced as text)
//     opts.studentName : optional; falls back to bs_anon_id
//   unmount()     : remove all answer DOM + body class + qa-bar
//
// Side surfaces it touches:
//   - document.body              : qa-bar + qa-backdrop nodes
//   - document.body.classList    : qa-bar-on toggle
//   - localStorage cl_ans_<qid>  : per-question answer memo
//   - localStorage bs_anon_id    : persistent anon student name
//
// Strings: pt-BR. Comments: English (matches workspace convention).
// ============================================================

(function () {

  var STRINGS = {
    errSubmit:    'Falha ao enviar. Tente novamente.',
    errTimeout:   'Tempo esgotado para esta pergunta.',
    errConnection:'Erro de conexão. Tente novamente.',
  };

  var ROOT_ID    = 'nx-answer-root';
  var QA_BAR_ID  = 'qa-bar';
  var QA_BACK_ID = 'qa-backdrop';

  var _state = null; // { host, sessionCode, studentName, listeners, activeQuestion, els }

  function mount(host, opts) {
    if (_state) unmount();
    opts = opts || {};
    var sessionCode = String(opts.sessionCode || '').toUpperCase();
    if (!host || !sessionCode) return;

    var studentName = opts.studentName || _ensureAnonName();

    // Build session-screen body inside host (mirrors /go/index.html lines ~130-175).
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="nx-answer-screen">' +
        '<div id="state-waiting" class="nx-state state-center" style="display:none">' +
          '<div class="state-icon">⏳</div>' +
          '<div class="state-title">Aguardando próxima pergunta…</div>' +
          '<div class="dot-wrap"><div class="refresh-dot" id="dot-waiting"></div></div>' +
        '</div>' +

        '<div id="state-cpq" class="nx-state panel-card" style="display:none; padding-bottom: 24px;">' +
          '<h2 id="cpq-q-text" class="question-text"></h2>' +
          '<classpulse-question id="cpq" mode="student"></classpulse-question>' +
          '<p id="answer-sending-msg" style="display:none;font-size:0.82rem;color:var(--text-secondary);text-align:center;margin-top:10px">Enviando...</p>' +
          '<div class="error-msg" id="answer-error" style="margin-top: 10px;"></div>' +
          '<div id="results-footer" class="results-next" style="display:none; margin-top:20px;">Próxima pergunta em breve…</div>' +
        '</div>' +

        '<div id="state-answered" class="nx-state state-center" style="display:none">' +
          '<div class="state-icon">✓</div>' +
          '<div class="state-title">Resposta enviada!</div>' +
          '<div class="state-sub">Aguardando o resultado…</div>' +
          '<div class="dot-wrap"><div class="refresh-dot" id="dot-answered"></div></div>' +
        '</div>' +

        '<div id="state-closed" class="nx-state state-center" style="display:none">' +
          '<div class="state-icon">✓</div>' +
          '<div class="state-title">Sessão encerrada</div>' +
          '<div class="state-sub">Obrigado pela participação!</div>' +
        '</div>' +

        '<div id="state-student-qa" class="nx-state cp-sqa-card" style="display:none">' +
          '<div class="cp-sqa-label">Pergunta do aluno</div>' +
          '<div class="cp-sqa-meta" id="sqa-meta"></div>' +
          '<div class="cp-sqa-text" id="sqa-text"></div>' +
          '<div id="sqa-answer-wrap" class="cp-sqa-answer" style="display:none">' +
            '<div class="cp-sqa-answer-label">Resposta</div>' +
            '<div class="cp-sqa-answer-text" id="sqa-answer"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    host.appendChild(root);

    // Build qa-bar + backdrop at body level (mirrors /go/index.html lines 178-196).
    var backdrop = document.createElement('div');
    backdrop.id = QA_BACK_ID;
    backdrop.className = 'cp-qa-backdrop';
    document.body.appendChild(backdrop);

    var qaBar = document.createElement('div');
    qaBar.id = QA_BAR_ID;
    qaBar.className = 'cp-qa-bar';
    qaBar.innerHTML =
      '<div id="qa-toast" class="cp-qa-toast">Pergunta enviada.</div>' +
      '<div id="qa-bar-collapsed" class="cp-qa-bar-collapsed">' +
        '<span class="cp-qa-bar-placeholder">Pergunta para o instrutor…</span>' +
        '<span class="cp-qa-bar-send" aria-hidden="true">➤</span>' +
      '</div>' +
      '<div class="cp-qa-editor">' +
        '<textarea id="qa-editor-input" class="cp-qa-editor-textarea" maxlength="200" placeholder="Pergunta para o instrutor…"></textarea>' +
        '<div class="cp-qa-editor-footer">' +
          '<span id="qa-editor-charcount" class="cp-qa-editor-charcount">0/200</span>' +
          '<div class="cp-qa-editor-actions">' +
            '<button id="qa-editor-cancel" class="cp-qa-editor-btn">Cancelar</button>' +
            '<button id="qa-editor-send" class="cp-qa-editor-btn primary">Enviar</button>' +
          '</div>' +
        '</div>' +
        '<div id="qa-editor-error" class="cp-qa-editor-error"></div>' +
      '</div>';
    document.body.appendChild(qaBar);

    // Cache element handles.
    var els = {
      cpq:           document.getElementById('cpq'),
      qText:         document.getElementById('cpq-q-text'),
      ansErr:        document.getElementById('answer-error'),
      ansSending:    document.getElementById('answer-sending-msg'),
      resultsFooter: document.getElementById('results-footer'),
      sqaMeta:       document.getElementById('sqa-meta'),
      sqaText:       document.getElementById('sqa-text'),
      sqaAnsWrap:    document.getElementById('sqa-answer-wrap'),
      sqaAns:        document.getElementById('sqa-answer'),
      qaBar:         qaBar,
      qaBackdrop:    backdrop,
      qaCollapsed:   document.getElementById('qa-bar-collapsed'),
      qaEditorIn:    document.getElementById('qa-editor-input'),
      qaCharCount:   document.getElementById('qa-editor-charcount'),
      qaCancelBtn:   document.getElementById('qa-editor-cancel'),
      qaSendBtn:     document.getElementById('qa-editor-send'),
      qaEdErr:       document.getElementById('qa-editor-error'),
      qaToast:       document.getElementById('qa-toast'),
    };

    // Wire the classpulse-question custom element to start polling.
    if (els.cpq) {
      els.cpq.setAttribute('session', sessionCode);
    }

    _state = {
      host: host,
      sessionCode: sessionCode,
      studentName: studentName,
      activeQuestion: null,
      els: els,
      listeners: [],
    };

    _wireEvents();
    _showState('waiting');
  }

  function unmount() {
    if (!_state) return;
    var s = _state;

    // Detach listeners.
    s.listeners.forEach(function (l) {
      try { l.el.removeEventListener(l.type, l.fn); } catch (_) {}
    });

    // Tell the cpq element to stop polling by removing the session attr.
    if (s.els.cpq && s.els.cpq.removeAttribute) {
      try { s.els.cpq.removeAttribute('session'); } catch (_) {}
    }

    // Remove root + qa-bar + backdrop.
    var root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    var qaBar = document.getElementById(QA_BAR_ID);
    if (qaBar && qaBar.parentNode) qaBar.parentNode.removeChild(qaBar);
    var bd = document.getElementById(QA_BACK_ID);
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);

    // Reset body classes.
    if (document.body && document.body.classList) {
      document.body.classList.remove('qa-bar-on');
    }

    _state = null;
  }

  // ── helpers ────────────────────────────────────────────────────────────
  function _ensureAnonName() {
    try {
      var existing = localStorage.getItem('bs_anon_id');
      if (existing) return existing;
      var fresh = 'Anon_' + Math.random().toString(36).slice(2, 5).toUpperCase();
      localStorage.setItem('bs_anon_id', fresh);
      return fresh;
    } catch (_) {
      return 'Anon';
    }
  }

  function _showState(name) {
    if (!_state) return;
    ['waiting', 'cpq', 'answered', 'closed', 'student-qa'].forEach(function (s) {
      var el = document.getElementById('state-' + s);
      if (el) el.style.display = (s === name) ? '' : 'none';
    });
  }

  function _pulseDot(id) {
    var dot = document.getElementById(id);
    if (!dot) return;
    dot.classList.add('active');
    setTimeout(function () { dot.classList.remove('active'); }, 500);
  }

  function _on(el, type, fn) {
    if (!el) return;
    el.addEventListener(type, fn);
    if (_state) _state.listeners.push({ el: el, type: type, fn: fn });
  }

  // ── event wiring ───────────────────────────────────────────────────────
  function _wireEvents() {
    if (!_state) return;
    var s = _state;
    var els = s.els;

    // cpq-data: master state update from the polling custom element.
    _on(els.cpq, 'cpq-data', function (e) {
      var data = e.detail;
      if (!data || !data.session || data.session.status === 'closed') {
        _showState('closed');
        if (els.qaBar) els.qaBar.classList.remove('visible');
        _collapseQa();
        return;
      }
      _pulseDot('dot-waiting');
      _pulseDot('dot-answered');
      _syncQa(data);
      _syncStudentQa(data);
    });

    // cpq-idle: no active question (between questions).
    _on(els.cpq, 'cpq-idle', function () {
      _showState('waiting');
      if (_state) _state.activeQuestion = null;
    });

    // cpq-inactivity-pause: clear the question text and revert to cpq state.
    _on(els.cpq, 'cpq-inactivity-pause', function () {
      if (els.qText) els.qText.textContent = '';
      if (els.resultsFooter) els.resultsFooter.style.display = 'none';
      _showState('cpq');
    });

    // cpq-question: a new question arrived.
    _on(els.cpq, 'cpq-question', function (e) {
      var row = e.detail;
      if (row && row.type === 'student_qa') return; // handled by syncStudentQa
      if (!_state) return;
      _state.activeQuestion = { id: row.id, text: row.text, options: row.options, type: row.type };
      if (els.qText) els.qText.textContent = row.text;
      if (els.ansErr) els.ansErr.textContent = '';
      if (els.resultsFooter) els.resultsFooter.style.display = 'none';

      var myAnswer = null;
      try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) {}
      if (myAnswer !== null) {
        _showState('answered');
      } else {
        if (els.cpq && els.cpq.removeAttribute) els.cpq.removeAttribute('my-answer');
        _showState('cpq');
      }
    });

    // cpq-revealed: host revealed the answer; show the question again with results.
    _on(els.cpq, 'cpq-revealed', function (e) {
      var row = e.detail;
      if (row && row.type === 'student_qa') return;
      if (els.qText) els.qText.textContent = row.text;
      if (els.resultsFooter) els.resultsFooter.style.display = 'block';
      if (els.ansSending) els.ansSending.style.display = 'none';
      if (els.ansErr) els.ansErr.textContent = '';

      var myAnswer = null;
      try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) {}
      if (myAnswer !== null && els.cpq && els.cpq.setAttribute) {
        els.cpq.setAttribute('my-answer', myAnswer);
      }
      _showState('cpq');
    });

    // cpq-submit: student tapped an option / rated / typed an answer.
    _on(els.cpq, 'cpq-submit', function (e) {
      var detail = e.detail;
      if (detail.type === 'indices')      _submitMulti(detail.value);
      else if (detail.type === 'index')   _submitIndex(detail.value, detail.el);
      else                                _submitValue(detail.value);
    });

    // QA bar handlers.
    _on(els.qaCollapsed,  'click',   _expandQa);
    _on(els.qaBackdrop,   'click',   _collapseQa);
    _on(els.qaCancelBtn,  'click',   _collapseQa);
    _on(els.qaEditorIn,   'input',   function () {
      if (els.qaCharCount) els.qaCharCount.textContent = els.qaEditorIn.value.length + '/200';
    });
    _on(els.qaEditorIn,   'keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitStudentQ(); }
      else if (e.key === 'Escape') { _collapseQa(); }
    });
    _on(els.qaSendBtn,    'click',   _submitStudentQ);
  }

  // ── sync helpers ───────────────────────────────────────────────────────
  function _syncQa(data) {
    if (!_state) return;
    var qaOn = !!data.qa_enabled;
    var els = _state.els;
    if (els.qaBar) els.qaBar.classList.toggle('visible', qaOn);
    if (document.body && document.body.classList) document.body.classList.toggle('qa-bar-on', qaOn);
    if (!qaOn) _collapseQa();
  }

  function _syncStudentQa(data) {
    if (!_state) return;
    var els = _state.els;
    var aq = data.active_question;
    if (aq && aq.type === 'student_qa') {
      var metaParts = [aq.student_name || 'Anônimo', _fmtTime(aq.student_time)].filter(Boolean);
      if (els.sqaMeta) els.sqaMeta.textContent = metaParts.join(' · ');
      if (els.sqaText) els.sqaText.textContent = aq.text || '';
      var ans = (aq.student_answer || '').trim();
      if (ans) {
        if (els.sqaAns) els.sqaAns.textContent = ans;
        if (els.sqaAnsWrap) els.sqaAnsWrap.style.display = '';
      } else {
        if (els.sqaAnsWrap) els.sqaAnsWrap.style.display = 'none';
      }
      _showState('student-qa');
    } else {
      var el = document.getElementById('state-student-qa');
      if (el && el.style.display !== 'none') el.style.display = 'none';
    }
  }

  function _fmtTime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  // ── QA bar ─────────────────────────────────────────────────────────────
  function _expandQa() {
    if (!_state) return;
    var els = _state.els;
    if (els.qaBar) els.qaBar.classList.add('expanded');
    if (els.qaBackdrop) els.qaBackdrop.classList.add('visible');
    if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
    setTimeout(function () { if (els.qaEditorIn) els.qaEditorIn.focus(); }, 30);
  }

  function _collapseQa() {
    if (!_state) return;
    var els = _state.els;
    if (els.qaBar) els.qaBar.classList.remove('expanded');
    if (els.qaBackdrop) els.qaBackdrop.classList.remove('visible');
    if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
  }

  function _showToast() {
    if (!_state) return;
    var toast = _state.els.qaToast;
    if (!toast) return;
    toast.classList.add('visible');
    setTimeout(function () { toast.classList.remove('visible'); }, 2500);
  }

  async function _submitStudentQ() {
    if (!_state) return;
    var els = _state.els;
    var text = (els.qaEditorIn && els.qaEditorIn.value || '').trim();
    if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
    if (!text) return;
    if (els.qaSendBtn) els.qaSendBtn.disabled = true;
    try {
      var res = await callWorker({
        action: 'submit_student_question',
        session_code: _state.sessionCode,
        student_name: _state.studentName,
        text: text,
      });
      if (res && res.ok) {
        if (els.qaEditorIn) els.qaEditorIn.value = '';
        if (els.qaCharCount) els.qaCharCount.textContent = '0/200';
        _collapseQa();
        _showToast();
      } else {
        if (els.qaEdErr) {
          els.qaEdErr.textContent = (res && res.error) || STRINGS.errSubmit;
          els.qaEdErr.classList.add('visible');
        }
      }
    } catch (_e) {
      if (els.qaEdErr) {
        els.qaEdErr.textContent = STRINGS.errConnection;
        els.qaEdErr.classList.add('visible');
      }
    } finally {
      if (els.qaSendBtn) els.qaSendBtn.disabled = false;
    }
  }

  // ── submit answers ─────────────────────────────────────────────────────
  async function _submitIndex(answerIndex, btn) {
    if (!_state || !_state.activeQuestion) return;
    var els = _state.els;
    var qId = _state.activeQuestion.id;
    document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = true; });
    if (btn && btn.classList) btn.classList.add('selected');
    if (els.ansErr) els.ansErr.textContent = '';
    if (els.ansSending) els.ansSending.style.display = '';

    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:  qId,
        session_code: _state.sessionCode,
        student_name: _state.studentName,
        answer_index: answerIndex,
      });
      if (result.ok || result.error === 'Você já enviou resposta.') {
        try { localStorage.setItem('cl_ans_' + qId, String(answerIndex)); } catch (_) {}
        _showState('answered');
      } else {
        document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = false; });
        if (btn && btn.classList) btn.classList.remove('selected');
        if (els.ansSending) els.ansSending.style.display = 'none';
        if (els.ansErr) {
          els.ansErr.textContent = result.error === 'question is not active'
            ? STRINGS.errTimeout : STRINGS.errSubmit;
        }
      }
    } catch (_) {
      document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = false; });
      if (btn && btn.classList) btn.classList.remove('selected');
      if (els.ansSending) els.ansSending.style.display = 'none';
      if (els.ansErr) els.ansErr.textContent = STRINGS.errConnection;
    }
  }

  async function _submitMulti(indices) {
    if (!_state || !_state.activeQuestion) return;
    if (!Array.isArray(indices) || indices.length === 0) return;
    var els = _state.els;
    var qId = _state.activeQuestion.id;
    document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = true; });
    var submitBtn = document.querySelector('.qr-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (els.ansErr) els.ansErr.textContent = '';
    if (els.ansSending) els.ansSending.style.display = '';

    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:    qId,
        session_code:   _state.sessionCode,
        student_name:   _state.studentName,
        answer_indices: indices,
      });
      if (result.ok || result.error === 'Você já enviou resposta.') {
        try { localStorage.setItem('cl_ans_' + qId, JSON.stringify(indices)); } catch (_) {}
        _showState('answered');
      } else {
        document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = false; });
        if (submitBtn) submitBtn.disabled = false;
        if (els.ansSending) els.ansSending.style.display = 'none';
        if (els.ansErr) {
          els.ansErr.textContent = result.error === 'VALIDATION_FAILED'
            ? result.message : STRINGS.errSubmit;
        }
      }
    } catch (_) {
      document.querySelectorAll('.qr-option-btn').forEach(function (b) { b.disabled = false; });
      if (submitBtn) submitBtn.disabled = false;
      if (els.ansSending) els.ansSending.style.display = 'none';
      if (els.ansErr) els.ansErr.textContent = STRINGS.errConnection;
    }
  }

  async function _submitValue(value) {
    if (!_state || !_state.activeQuestion) return;
    if (!value || typeof value !== 'string') return;
    var els = _state.els;
    var qId = _state.activeQuestion.id;
    var btn = document.querySelector('.qr-submit-btn') || document.querySelector('.qr-rating-btn.selected');
    if (btn) btn.disabled = true;
    if (els.ansErr) els.ansErr.textContent = '';
    if (els.ansSending) els.ansSending.style.display = '';

    try {
      var result = await callWorker({
        action: 'submit_answer',
        question_id:  qId,
        session_code: _state.sessionCode,
        student_name: _state.studentName,
        answer_value: value,
      });
      if (result.ok || result.error === 'Você já enviou resposta.') {
        try { localStorage.setItem('cl_ans_' + qId, '1'); } catch (_) {}
        _showState('answered');
      } else {
        if (btn) btn.disabled = false;
        if (els.ansSending) els.ansSending.style.display = 'none';
        if (els.ansErr) {
          els.ansErr.textContent =
            result.error === 'Question is closed' ? STRINGS.errTimeout :
            result.error === 'VALIDATION_FAILED'  ? result.message :
            STRINGS.errSubmit;
        }
      }
    } catch (_) {
      if (btn) btn.disabled = false;
      if (els.ansSending) els.ansSending.style.display = 'none';
      if (els.ansErr) els.ansErr.textContent = STRINGS.errConnection;
    }
  }

  // ── export ─────────────────────────────────────────────────────────────
  window.NexoAnswer = { mount: mount, unmount: unmount };

})();
