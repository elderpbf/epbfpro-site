// questions/question-element.js
// Codex-owned, faithful port of the legacy <classpulse-question> custom element
// (backstage/js/classpulse-question.min.js). A self-contained custom element with
// a LOADING / IDLE / ACTIVE / REVEALED / CLOSED state machine and its OWN poll
// timer, rendering through the Codex question renderer. Host AND student modes
// are kept intact so a future Trilha can reuse the same render.
//
// Three deliberate departures from the legacy element, per the Codex contract:
//  1. Backend ONLY through the codex-api facade (api.sessionState / links.forSlug),
//     never callWorker directly.
//  2. The legacy document `cpq-data` event BUS is replaced by SCOPED callback
//     properties (onData / onActive / onRevealed / onIdle / onClosed / onSubmit /
//     onRemoveAnswer / onInactivityPause). The host wires plain functions; nothing
//     leaks onto document, so a tab switch cannot leave a phantom listener behind.
//  3. Every user-facing string flows through t(); authored classes are `cdx-`.
//
// Teardown is airtight: disconnectedCallback()/teardown() clear the poll timer,
// the slug-resolution timer, the no-question timeout, and the student-mode
// visibility listener. This is the #1 technical risk for Q2 and is covered by
// tests/questions-unmount.test.mjs (the release blocker).
//
// Globals: none. (HTMLElement / customElements / document are platform; in tests
// they are stubbed before register() runs.)
import * as QR from './question-render.js';
import { questions as api, links } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

export const TAG = 'codex-question';

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function answersLabel(n) {
  return n + ' ' + (n === 1 ? t('questions.qr_answer') : t('questions.qr_answers'));
}

// Resolve the superclass at module load so importing this file never throws in a
// non-DOM context (Node test runs that touch it transitively, e.g. via the
// Sessions module). In the browser it is the real HTMLElement (a true custom
// element); under the test harness it is the stubbed element; with neither it
// degrades to a plain base that is simply never instantiated.
const ElementBase = (typeof HTMLElement !== 'undefined') ? HTMLElement : class {};

export class QuestionElement extends ElementBase {
  static get observedAttributes() {
    return ['session', 'mode', 'question-id', 'slug', 'poll-interval'];
  }

  constructor() {
    super();
    this._pollTimer = null;
    this._slugTimer = null;
    this._state = 'LOADING'; // LOADING, IDLE, ACTIVE, REVEALED, CLOSED
    this._activeQId = null;
    this._lastAnsCountsStr = '';
    this._lastData = null;
    this._session = null;
    this._feedExpanded = false;
    // Inactivity pause (student mode only)
    this._lastSeenActiveQuestionTs = Date.now();
    this._pauseAfterMs = 5 * 60 * 1000;
    this._isPausedForInactivity = false;
    this._isPausedForVisibility = false;
    this._visListener = null;
    this._noQuestionTimeout = null;
    // Scoped callbacks (set by the host). Replace the legacy cpq-* event bus.
    this.onData = null;
    this.onActive = null;
    this.onRevealed = null;
    this.onIdle = null;
    this.onClosed = null;
    this.onSubmit = null;
    this.onRemoveAnswer = null;
    this.onInactivityPause = null;
  }

  connectedCallback() {
    this._updateConfig();
    this.innerHTML = '';
    this.classList.add('cdx-cpq-container');

    if (this._mode === 'student') this._setupVisibilityListener();

    if (this._slug && !this._session) this._startSlugResolution();
    else this.startPolling();
  }

  disconnectedCallback() { this.teardown(); }

  // Single idempotent teardown for both DOM removal and explicit host unmount.
  teardown() {
    this.stopPolling();
    if (this._slugTimer) { clearInterval(this._slugTimer); this._slugTimer = null; }
    if (this._noQuestionTimeout) { clearTimeout(this._noQuestionTimeout); this._noQuestionTimeout = null; }
    this._teardownVisibilityListener();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._updateConfig();
    if (name === 'session') {
      if (this._slugTimer) { clearInterval(this._slugTimer); this._slugTimer = null; }
      this._forceNextRender();
      if (this.isConnected) this.startPolling();
    }
  }

  _updateConfig() {
    this._session = this.getAttribute('session') || null;
    this._mode = this.getAttribute('mode') || 'display'; // display, embed, student, host
    this._fixedQuestionId = this.getAttribute('question-id') || null;
    this._slug = this.getAttribute('slug') || null;
    const pInt = parseInt(this.getAttribute('poll-interval') || '0', 10);
    this._pollInterval = pInt > 0 ? pInt : 3000;
  }

  _forceNextRender() {
    this._activeQId = null;
    this._lastAnsCountsStr = '';
    this._state = 'LOADING';
  }

  startPolling() {
    this.stopPolling();
    if (!this._session) return;
    if (this._isPausedForVisibility || this._isPausedForInactivity) return;
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), this._pollInterval);
  }

  stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  // Explicit start for a programmatic host (live-host.js): point the element at a
  // session and begin polling, without depending on the browser-only attribute /
  // connected lifecycle. Idempotent (startPolling stops any prior loop first).
  start(sessionCode) {
    if (sessionCode) this.setAttribute('session', sessionCode);
    this._updateConfig();
    this._forceNextRender();
    this.startPolling();
  }

  // ----- Inactivity pause + Page Visibility (student mode only) -----

  _setupVisibilityListener() {
    if (this._visListener) return;
    this._visListener = () => this._handleVisibilityChange();
    document.addEventListener('visibilitychange', this._visListener);
  }

  _teardownVisibilityListener() {
    if (this._visListener) {
      document.removeEventListener('visibilitychange', this._visListener);
      this._visListener = null;
    }
  }

  _handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this._isPausedForVisibility = true;
      this.stopPolling();
      return;
    }
    if (!this._isPausedForVisibility) return;
    this._isPausedForVisibility = false;
    if (this._isPausedForInactivity) return;
    this.startPolling();
  }

  _checkInactivityPause() {
    if (this._mode !== 'student') return;
    if (this._isPausedForInactivity) return;
    if (this._state === 'CLOSED') return;
    if (this._lastData && this._lastData.active_question) {
      this._lastSeenActiveQuestionTs = Date.now();
      return;
    }
    if (Date.now() - this._lastSeenActiveQuestionTs > this._pauseAfterMs) this._enterInactivityPause();
  }

  _enterInactivityPause() {
    this._isPausedForInactivity = true;
    this.stopPolling();
    this._renderInactivityPause();
    if (typeof this.onInactivityPause === 'function') this.onInactivityPause();
  }

  _exitInactivityPause() {
    this._isPausedForInactivity = false;
    this._lastSeenActiveQuestionTs = Date.now();
    if (this._noQuestionTimeout) { clearTimeout(this._noQuestionTimeout); this._noQuestionTimeout = null; }
    if (!this._isPausedForVisibility) this.startPolling();
  }

  async _handleResumeTap() {
    this._renderCheckingPause();
    try { await this._poll(); } catch (e) { /* _poll catches its own errors */ }
    if (this._lastData && this._lastData.active_question) {
      this._exitInactivityPause();
    } else {
      this._renderNoQuestionYet();
      if (this._noQuestionTimeout) clearTimeout(this._noQuestionTimeout);
      this._noQuestionTimeout = setTimeout(() => {
        this._noQuestionTimeout = null;
        if (this._isPausedForInactivity) this._renderInactivityPause();
      }, 2500);
    }
  }

  _renderInactivityPause() {
    this.innerHTML = '<div class="cdx-cpq-resume-overlay" role="button" tabindex="0">'
      + '<div class="cdx-cpq-resume-title">' + escHtml(t('questions.qr_paused')) + '</div>'
      + '<button type="button" class="cdx-cpq-resume-btn">' + escHtml(t('questions.qr_tap_next')) + '</button>'
      + '</div>';
    this._wireResumeOverlay();
  }

  _renderCheckingPause() {
    this.innerHTML = '<div class="cdx-cpq-resume-overlay"><div class="cdx-cpq-resume-checking">' + escHtml(t('questions.qr_checking')) + '</div></div>';
  }

  _renderNoQuestionYet() {
    this.innerHTML = '<div class="cdx-cpq-resume-overlay" role="button" tabindex="0">'
      + '<div class="cdx-cpq-resume-wait">' + escHtml(t('questions.qr_wait_teacher')) + '</div>'
      + '<button type="button" class="cdx-cpq-resume-btn">' + escHtml(t('questions.qr_retry')) + '</button>'
      + '</div>';
    this._wireResumeOverlay();
  }

  _wireResumeOverlay() {
    const overlay = this.querySelector('.cdx-cpq-resume-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', () => this._handleResumeTap());
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._handleResumeTap(); }
    });
  }

  getActiveQuestion() {
    return this._lastData && this._lastData.active_question ? this._lastData.active_question : null;
  }

  getState() { return this._state; }

  async _startSlugResolution() {
    this._renderIdleState(t('questions.qr_no_linked_session'));
    const check = async () => {
      try {
        const res = await links.forSlug({ slug: this._slug, _silent: true });
        if (res && res.ok && res.session) {
          clearInterval(this._slugTimer);
          this._slugTimer = null;
          this.setAttribute('session', res.session.code);
        }
      } catch (e) { /* ignore */ }
    };
    await check();
    if (!this._session) this._slugTimer = setInterval(check, 10000);
  }

  async _poll() {
    if (!this._session) return;
    try {
      const data = await api.sessionState({ code: this._session, _silent: true });
      this._lastData = data;

      // Broadcast the complete state to the host via the scoped callback.
      if (typeof this.onData === 'function') this.onData(data);

      if (!data.session || data.session.status === 'closed') {
        this._transitionState('CLOSED');
        this.stopPolling();
        return;
      }

      let qToRender = null;
      let isRevealed = false;

      if (this._mode === 'embed' && this._fixedQuestionId) {
        qToRender = data.active_question && data.active_question.id === this._fixedQuestionId
          ? data.active_question
          : (data.history || []).find((q) => q.id === this._fixedQuestionId);
        if (qToRender) isRevealed = qToRender.status === 'closed' && qToRender.reveal_answer === true;
      } else {
        if (data.active_question) {
          qToRender = data.active_question;
        } else if (this._mode !== 'student') {
          const lastClosed = (data.history || [])[0];
          if (lastClosed && lastClosed.show_results) {
            qToRender = lastClosed;
            isRevealed = lastClosed.reveal_answer === true;
          }
        }
      }

      if (!qToRender) { this._transitionState('IDLE'); return; }

      const newState = isRevealed ? 'REVEALED' : (qToRender.status === 'active' ? 'ACTIVE' : 'REVEALED');

      let countsStr = qToRender.answer_counts ? JSON.stringify(qToRender.answer_counts) : '';
      if (['open', 'wordcloud', 'rating', 'numeric'].includes(qToRender.type)) {
        countsStr = qToRender.text_answers ? qToRender.text_answers.length + '' : '0';
      }
      countsStr += '|sr:' + (qToRender.show_results ? '1' : '0');

      if (this._state !== newState || this._activeQId !== qToRender.id || this._lastAnsCountsStr !== countsStr) {
        this._activeQId = qToRender.id;
        this._lastAnsCountsStr = countsStr;
        this._state = newState;

        if (newState === 'ACTIVE') {
          if (typeof this.onActive === 'function') this.onActive(qToRender);
        } else if (newState === 'REVEALED') {
          if (typeof this.onRevealed === 'function') this.onRevealed(qToRender);
        }

        this._renderQuestion(qToRender, isRevealed);
      }
    } catch (err) {
      /* poll swallows its own errors; the next tick retries */
    } finally {
      this._checkInactivityPause();
    }
  }

  _transitionState(state) {
    if (this._state === state) return;
    this._state = state;
    this._activeQId = null;
    if (state === 'IDLE') {
      if (typeof this.onIdle === 'function') this.onIdle();
      this._renderIdleState();
    } else if (state === 'CLOSED') {
      if (typeof this.onClosed === 'function') this.onClosed();
      this._renderIdleState(t('questions.qr_session_closed'));
    }
  }

  _renderIdleState(msgOverride) {
    this.innerHTML = '';
    if (this._mode === 'host' || this._mode === 'student') return;
    const msg = msgOverride || t('questions.qr_waiting_question');
    this.innerHTML = '<div class="cdx-qr-center-state">'
      + '<span class="cdx-qr-state-icon">&#8987;</span>'
      + '<span class="cdx-qr-state-text">' + escHtml(msg) + '</span>'
      + '</div>';
  }

  _renderQuestion(q, isRevealed) {
    this.innerHTML = '';
    const container = document.createElement('div');

    if (this._mode === 'display' || this._mode === 'embed') {
      container.className = 'cdx-qr-display';
      const textWrapper = document.createElement('div');
      textWrapper.className = 'cdx-qr-question-area';

      const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
      const total = (['open', 'wordcloud', 'rating', 'numeric'].includes(q.type) && q.text_answers)
        ? q.text_answers.length
        : counts.reduce((a, b) => a + b, 0);

      const badgeClass = q.status === 'active' ? 'live' : 'closed';
      const badgeLabel = q.status === 'active' ? t('questions.qr_live') : t('questions.qr_finished');

      textWrapper.innerHTML =
        '<div class="cdx-qr-question-status">'
        + '<span class="cdx-qr-status-badge ' + badgeClass + '">' + escHtml(badgeLabel) + '</span>'
        + '<span class="cdx-qr-answer-count">' + answersLabel(total) + '</span>'
        + '</div>'
        + '<div class="cdx-qr-question-text-display">' + escHtml(q.text) + '</div>';
      this.appendChild(textWrapper);

      const showResults = q.show_results === true;
      QR.renderResults(q, counts, container, { mode: 'display', showResults, revealAnswer: isRevealed, correctAnswers: q.correct_answers || [], voterCount: q.voter_count });
      this.appendChild(container);
    } else if (this._mode === 'student') {
      if (q.status === 'active') {
        QR.renderInput(q, container, {
          mode: 'student',
          onSelect: (index, el) => { if (typeof this.onSubmit === 'function') this.onSubmit({ type: 'index', value: index, el }); },
          onSubmitIndices: (indices) => { if (typeof this.onSubmit === 'function') this.onSubmit({ type: 'indices', value: indices }); },
          onSubmit: (value) => { if (typeof this.onSubmit === 'function') this.onSubmit({ type: 'value', value }); },
        });
      } else {
        const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
        container.className = 'cdx-qr-student';
        let myAns = this.getAttribute('my-answer');
        myAns = myAns === null ? null : parseInt(myAns, 10);
        QR.renderResults(q, counts, container, {
          mode: 'student',
          revealAnswer: isRevealed,
          correctAnswers: q.correct_answers || [],
          myAnswerIndex: Number.isNaN(myAns) ? null : myAns,
          voterCount: q.voter_count,
        });
      }
      this.appendChild(container);
    } else if (this._mode === 'host') {
      const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
      container.className = 'cdx-qr-host';
      const removeOpts = {
        mode: 'host',
        showResults: true,
        revealAnswer: false,
        correctAnswers: q.correct_answers || [],
        voterCount: q.voter_count,
        onRemoveAnswer: (id, el) => { if (typeof this.onRemoveAnswer === 'function') this.onRemoveAnswer({ id, el }); },
      };

      if (['open', 'wordcloud'].includes(q.type)) {
        const total = (q.text_answers || []).length;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'cdx-qr-feed-toggle';
        const label = () => (this._feedExpanded ? '▼' : '▶') + ' ' + t('questions.qr_see_answers') + ' (' + total + ')';
        toggle.textContent = label();
        const feedBox = document.createElement('div');
        if (!this._feedExpanded) feedBox.hidden = true;
        toggle.addEventListener('click', () => {
          this._feedExpanded = !this._feedExpanded;
          feedBox.hidden = !this._feedExpanded;
          toggle.textContent = label();
        });
        QR.renderResults(q, counts, feedBox, removeOpts);
        container.appendChild(toggle);
        container.appendChild(feedBox);
      } else {
        QR.renderResults(q, counts, container, removeOpts);
      }
      this.appendChild(container);
    }
  }
}

// Idempotent registration. Import is side-effect-free so tests can stub the
// platform globals BEFORE the element is defined.
export function register(tag = TAG) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, QuestionElement);
  }
  return tag;
}
