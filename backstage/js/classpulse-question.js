(function() {
  'use strict';

  class ClasspulseQuestion extends HTMLElement {
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
    }

    connectedCallback() {
      this._updateConfig();
      if (typeof window.callWorker === 'undefined') {
        console.warn('ClasspulseQuestion requires api-client.js');
      }
      this.innerHTML = '';
      this.classList.add('cpq-container');
      
      if (this._slug && !this._session) {
        this._startSlugResolution();
      } else {
        this.startPolling();
      }
    }

    disconnectedCallback() {
      this.stopPolling();
      if (this._slugTimer) {
        clearInterval(this._slugTimer);
        this._slugTimer = null;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      this._updateConfig();
      if (name === 'session') {
        if (this._slugTimer) {
          clearInterval(this._slugTimer);
          this._slugTimer = null;
        }
        this._forceNextRender();
        if (this.isConnected) {
          this.startPolling();
        }
      }
    }

    _updateConfig() {
      this._session = this.getAttribute('session') || null;
      this._mode = this.getAttribute('mode') || 'display'; // display, embed, student, host
      this._fixedQuestionId = this.getAttribute('question-id') || null;
      this._slug = this.getAttribute('slug') || null;
      let pInt = parseInt(this.getAttribute('poll-interval') || '0', 10);
      this._pollInterval = pInt > 0 ? pInt : (this._mode === 'student' ? 3000 : 4000);
    }

    _forceNextRender() {
      this._activeQId = null;
      this._lastAnsCountsStr = '';
      this._state = 'LOADING';
    }

    startPolling() {
      this.stopPolling();
      if (!this._session) return;
      this._poll();
      this._pollTimer = setInterval(() => this._poll(), this._pollInterval);
    }

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }

    getActiveQuestion() {
      return this._lastData && this._lastData.active_question ? this._lastData.active_question : null;
    }

    getState() {
      return this._state;
    }

    async _startSlugResolution() {
      this._renderIdleState('Aguardando sessão vinculada...');
      const check = async () => {
        try {
          const res = await callWorker({ action: 'get_linked_session', slug: this._slug, _silent: true });
          if (res.ok && res.session) {
            clearInterval(this._slugTimer);
            this._slugTimer = null;
            this.setAttribute('session', res.session.code);
            // attributeChangedCallback will trigger polling
          }
        } catch (e) { /* ignore */ }
      };
      await check();
      if (!this._session) {
        this._slugTimer = setInterval(check, 10000); // 10 seconds retry loop
      }
    }

    async _poll() {
      if (!this._session) return;
      try {
        const data = await callWorker({ action: 'get_session_state', code: this._session, _silent: true });
        this._lastData = data;
        
        // Broadcast complete API response (B.1 fix)
        this.dispatchEvent(new CustomEvent('cpq-data', { detail: data }));

        if (!data.session || data.session.status === 'closed') {
          this._transitionState('CLOSED');
          this.stopPolling();
          return;
        }

        let qToRender = null;
        let isRevealed = false;

        // Determine target question
        if (this._mode === 'embed' && this._fixedQuestionId) {
          qToRender = data.active_question && data.active_question.id === this._fixedQuestionId 
            ? data.active_question 
            : (data.history || []).find(q => q.id === this._fixedQuestionId);
            
          if (qToRender) {
             isRevealed = qToRender.status === 'closed' && qToRender.reveal_answer === true;
          }
        } else {
          if (data.active_question) {
            qToRender = data.active_question;
          } else {
            const lastClosed = (data.history || [])[0];
            if (lastClosed && lastClosed.show_results) {
              qToRender = lastClosed;
              isRevealed = lastClosed.reveal_answer === true;
            }
          }
        }

        if (!qToRender) {
          this._transitionState('IDLE');
          return;
        }

        const newState = isRevealed ? 'REVEALED' : (qToRender.status === 'active' ? 'ACTIVE' : 'REVEALED');
        
        let countsStr = qToRender.answer_counts ? JSON.stringify(qToRender.answer_counts) : '';
        if (['open','wordcloud'].includes(qToRender.type)) {
           countsStr = qToRender.text_answers ? qToRender.text_answers.length + '' : '0';
        }

        // Deep dependency tracking to limit destructive DOM writes
        if (this._state !== newState || this._activeQId !== qToRender.id || this._lastAnsCountsStr !== countsStr) {
          this._activeQId = qToRender.id;
          this._lastAnsCountsStr = countsStr;
          this._state = newState;
          
          if (newState === 'ACTIVE') {
            this.dispatchEvent(new CustomEvent('cpq-question', { detail: qToRender }));
          } else if (newState === 'REVEALED') {
            this.dispatchEvent(new CustomEvent('cpq-revealed', { detail: qToRender }));
          }

          this._renderQuestion(qToRender, isRevealed);
        }

      } catch (err) {
        if (typeof dbg !== 'undefined') dbg('error', 'cpq-poll: ' + err.message);
      }
    }

    _transitionState(state) {
      if (this._state !== state) {
        this._state = state;
        this._activeQId = null;
        if (state === 'IDLE') {
          this.dispatchEvent(new CustomEvent('cpq-idle'));
          this._renderIdleState();
        } else if (state === 'CLOSED') {
          this.dispatchEvent(new CustomEvent('cpq-closed'));
          this._renderIdleState('Sessão encerrada.');
        }
      }
    }

    _renderIdleState(msgOverride) {
      this.innerHTML = '';
      if (this._mode === 'host' || this._mode === 'student') return; 

      const msg = msgOverride || 'Aguardando pergunta...';
      this.innerHTML = `<div class="center-state">
          <span class="state-icon">&#8987;</span>
          <span class="state-text">${msg}</span>
      </div>`;
    }

    _renderQuestion(q, isRevealed) {
      this.innerHTML = '';
      const container = document.createElement('div');
      
      if (this._mode === 'display' || this._mode === 'embed') {
        container.className = 'qr-display';
        const textWrapper = document.createElement('div');
        textWrapper.className = 'question-area';
        
        const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
        const total = (['open','wordcloud'].includes(q.type) && q.text_answers) 
           ? q.text_answers.length 
           : counts.reduce((a,b)=>a+b, 0);
           
        const badgeClass = q.status === 'active' ? 'live' : 'closed';
        const badgeLabel = q.status === 'active' ? 'AO VIVO' : 'FINALIZADA';
        const answersStr = total + ' resposta' + (total !== 1 ? 's' : '');

        textWrapper.innerHTML = `
          <div class="question-status">
            <span class="status-badge ${badgeClass}">${badgeLabel}</span>
            <span class="answer-count">${answersStr}</span>
          </div>
          <div class="question-text-display">${escHtml(q.text)}</div>
        `;
        this.appendChild(textWrapper);
        
        const showResults = q.status === 'active' || q.show_results === true;
        container.className = 'qr-results';
        QR.renderResults(q, counts, container, { mode: 'display', showResults, revealAnswer: isRevealed, correctAnswer: q.correct_answer });
        this.appendChild(container);
      } 
      else if (this._mode === 'student') {
        if (q.status === 'active') {
          QR.renderInput(q, container, {
            mode: 'student',
            onSelect: (index, el) => { this.dispatchEvent(new CustomEvent('cpq-submit', { detail: { type: 'index', value: index, el } })); },
            onSubmit: (value) => { this.dispatchEvent(new CustomEvent('cpq-submit', { detail: { type: 'value', value: value } })); }
          });
        } else {
          const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
          container.className = 'qr-student';
          
          let myAns = this.getAttribute('my-answer');
          myAns = myAns === null ? null : parseInt(myAns, 10);
          
          QR.renderResults(q, counts, container, {
            mode: 'student',
            revealAnswer: isRevealed,
            correctAnswer: q.correct_answer,
            myAnswerIndex: Number.isNaN(myAns) ? null : myAns
          });
        }
        this.appendChild(container);
      }
      else if (this._mode === 'host') {
        const counts = q.answer_counts || new Array((q.options || []).length).fill(0);
        container.className = 'qr-host';
        QR.renderResults(q, counts, container, {
          mode: 'host',
          showResults: true,
          revealAnswer: false, 
          correctAnswer: q.correct_answer,
          onRemoveAnswer: (id, el) => { this.dispatchEvent(new CustomEvent('cpq-remove-answer', { detail: { id, el } })); }
        });
        this.appendChild(container);
      }
    }
  }

  customElements.define('classpulse-question', ClasspulseQuestion);
  window.ClasspulseQuestion = ClasspulseQuestion;

})();
