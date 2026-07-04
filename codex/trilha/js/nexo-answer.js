// codex/trilha/js/nexo-answer.js
// Live-question answer experience for the Trail (cdx- port of the legacy backstage
// NexoAnswer global, with the live-question renderer DE-FORKED). The screen body,
// QA bar, state machine, and inbox polling are faithful to the legacy; the two
// deliberate changes are:
//
//   1. The polling/render engine is the Codex <codex-question> element
//      (questions/question-element.js + question-render.js), NOT the legacy
//      <classpulse-question> fork. Its scoped callback properties (onData /
//      onActive / onRevealed / onIdle / onInactivityPause / onSubmit) replace the
//      legacy cpq-* document event bus, and it renders .cdx-qr-* (styled by
//      questions.css) instead of the legacy .qr-* (question-types.css).
//   2. Answer/Q&A/inbox submits go through the Trail facade (trail.submitAnswer /
//      submitStudentQ / studentInbox), never raw callWorker.
//
// Public API: mount(host, { sessionCode, studentName }) / unmount().
// The pure helpers (audienceLabel / submitDispatch) are unit-tested; the mounted
// DOM + the live render are verified on staging.
import { register, TAG as QTAG } from '../../questions/question-element.js';
import { trail } from './api.js';

register(); // define <codex-question> once (idempotent)

const STRINGS = {
  errSubmit: 'Falha ao enviar. Tente novamente.',
  errTimeout: 'Tempo esgotado para esta pergunta.',
  errConnection: 'Erro de conexão. Tente novamente.',
};
const ALREADY_ANSWERED = 'Você já enviou resposta.';

const ROOT_ID = 'nx-answer-root';
const QA_BAR_ID = 'qa-bar';
const QA_BACK_ID = 'qa-backdrop';

let _state = null;

// PURE. Audience-facing label: anonymous device handles (Anon_*) collapse to
// "Anônimo"; a typed/real name shows as-is. (Mirrors questions/identity.js.)
export function audienceLabel(name) {
  const s = String(name == null ? '' : name).trim();
  return (!s || s === 'Anônimo' || /^anon[_-]/i.test(s)) ? 'Anônimo' : s;
}

// PURE. Map a cpq onSubmit detail to the submit kind. The element emits
// { type: 'index' | 'indices' | 'value', value, el }.
export function submitDispatch(detail) {
  if (!detail) return null;
  if (detail.type === 'indices') return { kind: 'multi', value: detail.value };
  if (detail.type === 'index') return { kind: 'index', value: detail.value, el: detail.el };
  return { kind: 'value', value: detail.value };
}

export function mount(host, opts) {
  if (_state) unmount();
  opts = opts || {};
  const sessionCode = String(opts.sessionCode || '').toUpperCase();
  if (!host || !sessionCode) return;

  const studentName = opts.studentName || _ensureAnonName();

  // Build session-screen body (identical markup to the legacy NexoAnswer; the only
  // change is the <codex-question> tag in place of <classpulse-question>).
  const root = document.createElement('div');
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
        '<' + QTAG + ' id="cpq" mode="student"></' + QTAG + '>' +
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

      '<div id="state-my-answer" class="nx-state cp-sqa-card" style="display:none">' +
        '<div class="cp-sqa-label">Sua pergunta</div>' +
        '<div class="cp-sqa-text" id="mya-text"></div>' +
        '<div class="cp-sqa-answer">' +
          '<div class="cp-sqa-answer-label">Resposta do instrutor</div>' +
          '<div class="cp-sqa-answer-text" id="mya-answer"></div>' +
        '</div>' +
        '<div class="state-sub" style="margin-top:16px">Aguardando próxima pergunta…</div>' +
      '</div>' +
    '</div>';
  host.appendChild(root);

  const backdrop = document.createElement('div');
  backdrop.id = QA_BACK_ID;
  backdrop.className = 'cp-qa-backdrop';
  document.body.appendChild(backdrop);

  const qaBar = document.createElement('div');
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

  const els = {
    cpq: document.getElementById('cpq'),
    qText: document.getElementById('cpq-q-text'),
    ansErr: document.getElementById('answer-error'),
    ansSending: document.getElementById('answer-sending-msg'),
    resultsFooter: document.getElementById('results-footer'),
    sqaMeta: document.getElementById('sqa-meta'),
    sqaText: document.getElementById('sqa-text'),
    sqaAnsWrap: document.getElementById('sqa-answer-wrap'),
    sqaAns: document.getElementById('sqa-answer'),
    myaText: document.getElementById('mya-text'),
    myaAns: document.getElementById('mya-answer'),
    qaBar,
    qaBackdrop: backdrop,
    qaCollapsed: document.getElementById('qa-bar-collapsed'),
    qaEditorIn: document.getElementById('qa-editor-input'),
    qaCharCount: document.getElementById('qa-editor-charcount'),
    qaCancelBtn: document.getElementById('qa-editor-cancel'),
    qaSendBtn: document.getElementById('qa-editor-send'),
    qaEdErr: document.getElementById('qa-editor-error'),
    qaToast: document.getElementById('qa-toast'),
  };

  _state = {
    host, sessionCode, studentName,
    activeQuestion: null, els, listeners: [], current: null,
    myAnswer: null, lastSeenAnsKey: null, inboxTimer: null,
    // Orchestrator (nexo.js) callback: fired once when the element reports the session
    // closed, so the trilha is restored in ~2s instead of on the orchestrator's own poll.
    onSessionClosed: (opts && typeof opts.onSessionClosed === 'function') ? opts.onSessionClosed : null,
    closedNotified: false,
  };
  try { _state.lastSeenAnsKey = localStorage.getItem('nx_seen_ans_' + sessionCode) || null; } catch (_) { /* noop */ }

  _wireQuestionElement();
  _wireQaBar();
  _showState('waiting');

  // Start the element polling, and poll the asker's private inbox independently.
  if (els.cpq && typeof els.cpq.start === 'function') els.cpq.start(sessionCode);
  _pollInbox();
  _state.inboxTimer = setInterval(_pollInbox, 4000);
}

export function unmount() {
  if (!_state) return;
  const s = _state;
  if (s.inboxTimer) { try { clearInterval(s.inboxTimer); } catch (_) { /* noop */ } s.inboxTimer = null; }
  s.listeners.forEach((l) => { try { l.el.removeEventListener(l.type, l.fn); } catch (_) { /* noop */ } });

  // Tear down the element (clears its poll timer + listeners) and drop callbacks.
  if (s.els.cpq) {
    try { if (typeof s.els.cpq.teardown === 'function') s.els.cpq.teardown(); } catch (_) { /* noop */ }
    s.els.cpq.onData = s.els.cpq.onActive = s.els.cpq.onRevealed = null;
    s.els.cpq.onIdle = s.els.cpq.onInactivityPause = s.els.cpq.onSubmit = null;
  }

  const root = document.getElementById(ROOT_ID);
  if (root && root.parentNode) root.parentNode.removeChild(root);
  const qaBar = document.getElementById(QA_BAR_ID);
  if (qaBar && qaBar.parentNode) qaBar.parentNode.removeChild(qaBar);
  const bd = document.getElementById(QA_BACK_ID);
  if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
  if (document.body && document.body.classList) document.body.classList.remove('qa-bar-on');

  _state = null;
}

// ── helpers ────────────────────────────────────────────────────────────────
function _ensureAnonName() {
  try {
    const existing = localStorage.getItem('bs_anon_id');
    if (existing) return existing;
    const fresh = 'Anon_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem('bs_anon_id', fresh);
    return fresh;
  } catch (_) {
    return 'Anon';
  }
}

function _showState(name) {
  if (!_state) return;
  _state.current = name;
  ['waiting', 'cpq', 'answered', 'closed', 'student-qa', 'my-answer'].forEach((s) => {
    const el = document.getElementById('state-' + s);
    if (el) el.style.display = (s === name) ? '' : 'none';
  });
}

function _isMine(name) {
  return !!(_state && name && _state.studentName &&
    String(name).trim() === String(_state.studentName).trim());
}

function _showIdle() {
  _showState((_state && _state.myAnswer) ? 'my-answer' : 'waiting');
}

function _pulseDot(id) {
  const dot = document.getElementById(id);
  if (!dot) return;
  dot.classList.add('active');
  setTimeout(() => dot.classList.remove('active'), 500);
}

function _on(el, type, fn) {
  if (!el) return;
  el.addEventListener(type, fn);
  if (_state) _state.listeners.push({ el, type, fn });
}

// ── question-element wiring (scoped callbacks replace the cpq-* event bus) ────
function _wireQuestionElement() {
  if (!_state) return;
  const els = _state.els;
  const cpq = els.cpq;
  if (!cpq) return;

  // onData: master state update on every poll (was cpq-data).
  cpq.onData = (data) => {
    if (!data || !data.session || data.session.status === 'closed') {
      _showState('closed');
      if (els.qaBar) els.qaBar.classList.remove('visible');
      _collapseQa();
      // Tell the orchestrator once so it restores the trilha now, not on its slow poll.
      // Deferred via microtask so the teardown runs AFTER this poll cycle unwinds.
      if (_state && _state.onSessionClosed && !_state.closedNotified) {
        _state.closedNotified = true;
        const cb = _state.onSessionClosed;
        queueMicrotask(() => { try { cb(); } catch (_) { /* noop */ } });
      }
      return;
    }
    _pulseDot('dot-waiting');
    _pulseDot('dot-answered');
    _syncQa(data);
    _syncStudentQa(data);
  };

  // onIdle: no active question between questions (was cpq-idle).
  cpq.onIdle = () => {
    _showIdle();
    if (_state) _state.activeQuestion = null;
  };

  // onInactivityPause: clear text, revert to cpq state (was cpq-inactivity-pause).
  cpq.onInactivityPause = () => {
    if (els.qText) els.qText.textContent = '';
    if (els.resultsFooter) els.resultsFooter.style.display = 'none';
    _showState('cpq');
  };

  // onActive: a new active question arrived (was cpq-question).
  cpq.onActive = (row) => {
    if (row && row.type === 'student_qa') return; // handled by syncStudentQa
    if (!_state) return;
    _state.activeQuestion = { id: row.id, text: row.text, options: row.options, type: row.type };
    if (els.qText) els.qText.textContent = row.text;
    if (els.ansErr) els.ansErr.textContent = '';
    if (els.resultsFooter) els.resultsFooter.style.display = 'none';

    let myAnswer = null;
    try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) { /* noop */ }
    if (myAnswer !== null) {
      _showState('answered');
    } else {
      if (cpq.removeAttribute) cpq.removeAttribute('my-answer');
      _showState('cpq');
    }
  };

  // onRevealed: host revealed the answer; show the question with results (was cpq-revealed).
  cpq.onRevealed = (row) => {
    if (row && row.type === 'student_qa') return;
    if (els.qText) els.qText.textContent = row.text;
    if (els.resultsFooter) els.resultsFooter.style.display = 'block';
    if (els.ansSending) els.ansSending.style.display = 'none';
    if (els.ansErr) els.ansErr.textContent = '';

    let myAnswer = null;
    try { myAnswer = localStorage.getItem('cl_ans_' + row.id); } catch (_) { /* noop */ }
    if (myAnswer !== null && cpq.setAttribute) cpq.setAttribute('my-answer', myAnswer);
    _showState('cpq');
  };

  // onSubmit: student tapped an option / rated / typed (was cpq-submit).
  cpq.onSubmit = (detail) => {
    const d = submitDispatch(detail);
    if (!d) return;
    if (d.kind === 'multi') _submitMulti(d.value);
    else if (d.kind === 'index') _submitIndex(d.value, d.el);
    else _submitValue(d.value);
  };
}

// ── QA bar wiring ────────────────────────────────────────────────────────────
function _wireQaBar() {
  if (!_state) return;
  const els = _state.els;
  _on(els.qaCollapsed, 'click', _expandQa);
  _on(els.qaBackdrop, 'click', _collapseQa);
  _on(els.qaCancelBtn, 'click', _collapseQa);
  _on(els.qaEditorIn, 'input', () => {
    if (els.qaCharCount) els.qaCharCount.textContent = els.qaEditorIn.value.length + '/200';
  });
  _on(els.qaEditorIn, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitStudentQ(); }
    else if (e.key === 'Escape') { _collapseQa(); }
  });
  _on(els.qaSendBtn, 'click', _submitStudentQ);
}

// ── sync helpers ─────────────────────────────────────────────────────────────
function _syncQa(data) {
  if (!_state) return;
  const qaOn = !!data.qa_enabled;
  const els = _state.els;
  if (els.qaBar) els.qaBar.classList.toggle('visible', qaOn);
  if (document.body && document.body.classList) document.body.classList.toggle('qa-bar-on', qaOn);
  if (!qaOn) _collapseQa();
}

function _syncStudentQa(data) {
  if (!_state) return;
  const els = _state.els;
  const aq = data.active_question;
  if (aq && aq.type === 'student_qa') {
    if (!_isMine(aq.student_name)) {
      const elx = document.getElementById('state-student-qa');
      if (elx && elx.style.display !== 'none') elx.style.display = 'none';
      _showIdle();
      return;
    }
    const metaParts = [audienceLabel(aq.student_name), _fmtTime(aq.student_time)].filter(Boolean);
    if (els.sqaMeta) els.sqaMeta.textContent = metaParts.join(' · ');
    if (els.sqaText) els.sqaText.textContent = aq.text || '';
    const ans = (aq.student_answer || '').trim();
    if (ans) {
      if (els.sqaAns) els.sqaAns.textContent = ans;
      if (els.sqaAnsWrap) els.sqaAnsWrap.style.display = '';
    } else if (els.sqaAnsWrap) {
      els.sqaAnsWrap.style.display = 'none';
    }
    _showState('student-qa');
  } else {
    const el = document.getElementById('state-student-qa');
    if (el && el.style.display !== 'none') el.style.display = 'none';
  }
}

function _fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

// ── QA bar ───────────────────────────────────────────────────────────────────
function _expandQa() {
  if (!_state) return;
  const els = _state.els;
  if (els.qaBar) els.qaBar.classList.add('expanded');
  if (els.qaBackdrop) els.qaBackdrop.classList.add('visible');
  if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
  setTimeout(() => { if (els.qaEditorIn) els.qaEditorIn.focus(); }, 30);
}

function _collapseQa() {
  if (!_state) return;
  const els = _state.els;
  if (els.qaBar) els.qaBar.classList.remove('expanded');
  if (els.qaBackdrop) els.qaBackdrop.classList.remove('visible');
  if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
}

function _showToast(msg) {
  if (!_state) return;
  const toast = _state.els.qaToast;
  if (!toast) return;
  if (msg) toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ── inbox + Q&A submit (Trail facade) ────────────────────────────────────────
async function _pollInbox() {
  if (!_state) return;
  try {
    const res = await trail.studentInbox({
      session_code: _state.sessionCode,
      student_name: _state.studentName,
      _silent: true,
    });
    if (!_state || !res || !res.ok || !Array.isArray(res.questions)) return;
    const answered = res.questions.filter((q) => q.answer && String(q.answer).trim());
    if (!answered.length) return;
    const latest = answered[answered.length - 1];
    _state.myAnswer = { id: latest.id, text: latest.text || '', answer: latest.answer || '' };
    if (_state.els.myaText) _state.els.myaText.textContent = _state.myAnswer.text;
    if (_state.els.myaAns) _state.els.myaAns.textContent = _state.myAnswer.answer;

    const key = String(latest.id) + ':' + String(latest.answer);
    if (key !== _state.lastSeenAnsKey) {
      _state.lastSeenAnsKey = key;
      try { localStorage.setItem('nx_seen_ans_' + _state.sessionCode, key); } catch (_) { /* noop */ }
      _showToast('Sua pergunta foi respondida.');
    }
    if (_state.current === 'waiting' || _state.current === 'my-answer') _showState('my-answer');
  } catch (_) { /* swallow; next tick retries */ }
}

async function _submitStudentQ() {
  if (!_state) return;
  const els = _state.els;
  const text = (els.qaEditorIn && els.qaEditorIn.value || '').trim();
  if (els.qaEdErr) els.qaEdErr.classList.remove('visible');
  if (!text) return;
  if (els.qaSendBtn) els.qaSendBtn.disabled = true;
  try {
    const res = await trail.submitStudentQ({
      session_code: _state.sessionCode,
      student_name: _state.studentName,
      text,
    });
    if (res && res.ok) {
      if (els.qaEditorIn) els.qaEditorIn.value = '';
      if (els.qaCharCount) els.qaCharCount.textContent = '0/200';
      _collapseQa();
      _showToast('Pergunta enviada.');
    } else if (els.qaEdErr) {
      els.qaEdErr.textContent = (res && res.error) || STRINGS.errSubmit;
      els.qaEdErr.classList.add('visible');
    }
  } catch (e) {
    if (els.qaEdErr) {
      els.qaEdErr.textContent = (e && e.data && e.data.error) || STRINGS.errConnection;
      els.qaEdErr.classList.add('visible');
    }
  } finally {
    if (els.qaSendBtn) els.qaSendBtn.disabled = false;
  }
}

// ── answer submits (Trail facade; .cdx-qr-* option buttons) ──────────────────
function _disableOptions() {
  document.querySelectorAll('.cdx-qr-option-btn').forEach((b) => { b.disabled = true; });
}
function _enableOptions() {
  document.querySelectorAll('.cdx-qr-option-btn').forEach((b) => { b.disabled = false; });
}

async function _submitIndex(answerIndex, btn) {
  if (!_state || !_state.activeQuestion) return;
  const els = _state.els;
  const qId = _state.activeQuestion.id;
  _disableOptions();
  if (btn && btn.classList) btn.classList.add('is-selected');
  if (els.ansErr) els.ansErr.textContent = '';
  if (els.ansSending) els.ansSending.style.display = '';

  try {
    await trail.submitAnswer({
      question_id: qId,
      session_code: _state.sessionCode,
      student_name: _state.studentName,
      answer_index: answerIndex,
    });
    try { localStorage.setItem('cl_ans_' + qId, String(answerIndex)); } catch (_) { /* noop */ }
    _showState('answered');
  } catch (e) {
    const err = e && e.data && e.data.error;
    if (err === ALREADY_ANSWERED) {
      try { localStorage.setItem('cl_ans_' + qId, String(answerIndex)); } catch (_) { /* noop */ }
      _showState('answered');
      return;
    }
    _enableOptions();
    if (btn && btn.classList) btn.classList.remove('is-selected');
    if (els.ansSending) els.ansSending.style.display = 'none';
    if (els.ansErr) els.ansErr.textContent = err === 'question is not active' ? STRINGS.errTimeout : STRINGS.errSubmit;
  }
}

async function _submitMulti(indices) {
  if (!_state || !_state.activeQuestion) return;
  if (!Array.isArray(indices) || indices.length === 0) return;
  const els = _state.els;
  const qId = _state.activeQuestion.id;
  _disableOptions();
  const submitBtn = document.querySelector('.cdx-qr-submit-btn');
  if (submitBtn) submitBtn.disabled = true;
  if (els.ansErr) els.ansErr.textContent = '';
  if (els.ansSending) els.ansSending.style.display = '';

  try {
    await trail.submitAnswer({
      question_id: qId,
      session_code: _state.sessionCode,
      student_name: _state.studentName,
      answer_indices: indices,
    });
    try { localStorage.setItem('cl_ans_' + qId, JSON.stringify(indices)); } catch (_) { /* noop */ }
    _showState('answered');
  } catch (e) {
    const err = e && e.data && e.data.error;
    if (err === ALREADY_ANSWERED) {
      try { localStorage.setItem('cl_ans_' + qId, JSON.stringify(indices)); } catch (_) { /* noop */ }
      _showState('answered');
      return;
    }
    _enableOptions();
    if (submitBtn) submitBtn.disabled = false;
    if (els.ansSending) els.ansSending.style.display = 'none';
    if (els.ansErr) els.ansErr.textContent = err === 'VALIDATION_FAILED' ? (e.data.message || STRINGS.errSubmit) : STRINGS.errSubmit;
  }
}

async function _submitValue(value) {
  if (!_state || !_state.activeQuestion) return;
  if (!value || typeof value !== 'string') return;
  const els = _state.els;
  const qId = _state.activeQuestion.id;
  const btn = document.querySelector('.cdx-qr-submit-btn');
  const ratingBtns = document.querySelectorAll('.cdx-qr-rating-btn');
  if (btn) btn.disabled = true;
  ratingBtns.forEach((b) => { b.disabled = true; });
  if (els.ansErr) els.ansErr.textContent = '';
  if (els.ansSending) els.ansSending.style.display = '';

  try {
    await trail.submitAnswer({
      question_id: qId,
      session_code: _state.sessionCode,
      student_name: _state.studentName,
      answer_value: value,
    });
    try { localStorage.setItem('cl_ans_' + qId, '1'); } catch (_) { /* noop */ }
    _showState('answered');
  } catch (e) {
    const err = e && e.data && e.data.error;
    if (err === ALREADY_ANSWERED) {
      try { localStorage.setItem('cl_ans_' + qId, '1'); } catch (_) { /* noop */ }
      _showState('answered');
      return;
    }
    if (btn) btn.disabled = false;
    ratingBtns.forEach((b) => { b.disabled = false; });
    if (els.ansSending) els.ansSending.style.display = 'none';
    if (els.ansErr) {
      els.ansErr.textContent =
        err === 'Question is closed' ? STRINGS.errTimeout :
        err === 'VALIDATION_FAILED' ? (e.data.message || STRINGS.errSubmit) :
        STRINGS.errSubmit;
    }
  }
}
