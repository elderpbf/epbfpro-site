/**
 * CPHostModule -- mountable port of host.html for the Sessoes-Teste panel.
 *
 * Usage:
 *   var handle = CPHostModule.mount(rootEl, { sessionCode: 'ABC123', authToken: BS_AUTH.TOKEN });
 *   handle.unmount(); // cleanup
 *
 * Naming note: cp-host.js and CPHost are reserved (Bundle L iframe revert).
 * This module deliberately uses a different name.
 */
(function() {
  'use strict';

  // HTML template: contents of host.html <body> (screen-app + trail-modal),
  // excluding the outer <body> tags and the theme-transition div.
  var TEMPLATE_HTML = [
    '<div id="screen-app" class="bs-app">',
    '  <div class="host-container host-dashboard-container">',
    '    <div class="host-alert host-alert-success" id="alert-success"></div>',
    '    <div class="host-screen active host-screen-flex" id="screen-session">',
    '      <div class="host-session-bar">',
    '        <div>',
    '          <div class="host-code">',
    '            <span class="host-live-indicator" id="host-live-indicator" hidden>',
    '              <span class="host-live-dot"></span><span class="host-live-label">Live</span>',
    '            </span>',
    '          </div>',
    '          <div class="host-session-name" id="session-name-display"></div>',
    '        </div>',
    '        <div id="live-bar-subtabs" class="host-bar-subtabs"></div>',
    '        <div class="host-bar-actions">',
    '          <details class="host-bar-visao" id="viewToggles" title="Mostrar ou esconder cada coluna do dashboard" hidden>',
    '            <summary>Visão ▾</summary>',
    '            <div class="host-bar-visao-panel">',
    '              <div class="host-bar-visao-label">Mostrar colunas</div>',
    '              <button class="view-toggle is-on" data-toggle-col="left"   type="button">Composer</button>',
    '              <button class="view-toggle is-on" data-toggle-col="center" type="button">Pergunta ativa</button>',
    '              <button class="view-toggle is-on" data-toggle-col="right"  type="button">Q&amp;A</button>',
    '            </div>',
    '          </details>',
    '          <button class="reset-layout-btn" id="resetLayoutBtn" type="button" title="Voltar ao layout padrão">↻</button>',
    '          <button class="host-btn host-btn-ghost host-pres-btn" id="trail-btn" type="button" hidden><span class="host-pres-dot" id="trail-dot"></span>Trilha</button>',
    '          <button class="host-btn host-btn-ghost" id="qr-btn" hidden>QR</button>',
    '          <a class="host-btn host-btn-ghost" id="display-link" href="#" target="_blank" rel="noopener" hidden>Display</a>',
    '          <button class="host-btn host-btn-primary" id="start-host-btn" hidden>Iniciar</button>',
    '          <button class="host-btn host-btn-danger" id="stop-host-btn" hidden>Encerrar</button>',
    '          <button class="host-bar-menu" id="hostBarMenuBtn" type="button" aria-label="Mais opções">&#8801;</button>',
    '          <div class="host-bar-menu-panel" id="hostBarMenuPanel" hidden></div>',
    '        </div>',
    '      </div>',
    '      <div class="host-not-hosted-note" id="not-hosted-note" hidden>',
    '        Sessão não está sendo hospedada. Clique em <strong>Iniciar</strong> para começar.',
    '      </div>',
    '      <div class="host-dashboard" id="hostDashboard">',
    '      <section class="hd-col hd-col-left" id="hdColLeft">',
    '      <div class="host-card" id="launch-q-card">',
    '        <div class="host-card-title">Lançar pergunta</div>',
    '        <button class="bank-toggle-btn" id="bank-toggle-btn" type="button">',
    '          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>',
    '          Banco de questões',
    '          <i class="bank-chevron">▾</i>',
    '        </button>',
    '        <div class="bank-panel" id="bank-panel">',
    '          <div class="qb-set-row">',
    '            <label for="bank-set-select" style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em">Conjunto</label>',
    '            <select class="host-select" id="bank-set-select"><option value="">Escolha um conjunto...</option></select>',
    '          </div>',
    '          <div class="qb-list" id="bank-q-list"><div class="qb-msg">Selecione um conjunto acima.</div></div>',
    '        </div>',
    '        <div class="host-form-group">',
    '          <label class="host-label">Tipo de pergunta</label>',
    '          <select class="host-select" id="q-type">',
    '            <option value="mc">Múltipla Escolha</option>',
    '            <option value="tf">Verdadeiro / Falso</option>',
    '            <option value="poll">Enquete</option>',
    '            <option value="open">Texto Aberto</option>',
    '            <option value="wordcloud">Nuvem de Palavras</option>',
    '            <option value="rating">Avaliação</option>',
    '            <option value="numeric">Numérico</option>',
    '          </select>',
    '        </div>',
    '        <div class="host-form-group">',
    '          <label class="host-label">Texto da pergunta</label>',
    '          <textarea class="host-input" id="q-text" placeholder="Escreva a pergunta para os alunos..." rows="2"></textarea>',
    '        </div>',
    '        <div id="q-opts-mc">',
    '          <div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Opções <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:.7">-- marque a correta</span></div>',
    '          <div class="opt-row"><div class="opt-letter">A</div><input class="host-input" type="text" id="q-opt-a" placeholder="Opção A"><label class="opt-correct-radio" title="Marcar como correta"><input type="radio" name="correct" value="a" id="q-correct-a"></label></div>',
    '          <div class="opt-row"><div class="opt-letter">B</div><input class="host-input" type="text" id="q-opt-b" placeholder="Opção B"><label class="opt-correct-radio" title="Marcar como correta"><input type="radio" name="correct" value="b" id="q-correct-b"></label></div>',
    '          <div class="opt-row"><div class="opt-letter">C</div><input class="host-input" type="text" id="q-opt-c" placeholder="Opção C"><label class="opt-correct-radio" title="Marcar como correta"><input type="radio" name="correct" value="c" id="q-correct-c"></label></div>',
    '          <div class="opt-row"><div class="opt-letter">D</div><input class="host-input" type="text" id="q-opt-d" placeholder="Opção D"><label class="opt-correct-radio" title="Marcar como correta"><input type="radio" name="correct" value="d" id="q-correct-d"></label></div>',
    '          <div style="margin-top:0.6rem;display:flex;align-items:center;gap:0.5rem">',
    '            <label class="host-label" style="margin:0;white-space:nowrap">Seleções por aluno</label>',
    '            <input type="number" class="host-input" id="q-mc-max-select" value="1" min="0" step="1" style="max-width:80px">',
    '            <span style="font-size:0.75rem;color:var(--text-secondary)">1 = única · 0 = todas</span>',
    '          </div>',
    '        </div>',
    '        <div id="q-opts-poll" style="display:none">',
    '          <div id="poll-rows"></div>',
    '          <button class="host-btn host-btn-ghost" id="poll-add-btn" type="button" style="font-size:0.82rem;margin-top:0.3rem">+ Adicionar opção</button>',
    '          <div style="margin-top:0.6rem;display:flex;align-items:center;gap:0.5rem">',
    '            <label class="host-label" style="margin:0;white-space:nowrap">Seleções por aluno</label>',
    '            <input type="number" class="host-input" id="q-poll-max-select" value="1" min="0" step="1" style="max-width:80px">',
    '            <span style="font-size:0.75rem;color:var(--text-secondary)">1 = única · 0 = todas</span>',
    '          </div>',
    '        </div>',
    '        <div id="q-opts-rating" style="display:none">',
    '          <div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Escala</div>',
    '          <div style="display:flex;gap:0.6rem">',
    '            <div style="flex:1"><label class="host-label">Mínimo</label><input type="number" class="host-input" id="q-rating-min" value="1" step="1"></div>',
    '            <div style="flex:1"><label class="host-label">Máximo</label><input type="number" class="host-input" id="q-rating-max" value="5" step="1"></div>',
    '          </div>',
    '        </div>',
    '        <div id="q-opts-numeric" style="display:none">',
    '          <div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Limites <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:.7">-- opcional</span></div>',
    '          <div style="display:flex;gap:0.6rem">',
    '            <div style="flex:1"><label class="host-label">Mínimo</label><input type="number" class="host-input" id="q-num-min" placeholder="sem limite"></div>',
    '            <div style="flex:1"><label class="host-label">Máximo</label><input type="number" class="host-input" id="q-num-max" placeholder="sem limite"></div>',
    '          </div>',
    '        </div>',
    '        <div class="host-btn-row" style="margin-top:0.75rem">',
    '          <button class="host-btn host-btn-ghost" id="q-generate-btn" type="button"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Gerar</button>',
    '          <button class="host-btn host-btn-ghost" id="q-improve-btn" type="button"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg> Melhorar</button>',
    '        </div>',
    '        <p id="q-error" style="font-size:0.82rem;color:#ef4444;margin:0.4rem 0 0;min-height:1.2em"></p>',
    '        <div class="host-btn-row" style="margin-top:0.75rem">',
    '          <button class="host-btn host-btn-primary" id="launch-btn">Lançar pergunta</button>',
    '          <button class="host-btn host-btn-ghost" id="clear-form-btn">Limpar</button>',
    '        </div>',
    '      </div>',
    '      </section>',
    '      <div class="hd-resizer" data-resize="left-center" id="hdResizerLC"></div>',
    '      <section class="hd-col hd-col-center" id="hdColCenter">',
    '      <div class="active-q-panel" id="active-q-panel">',
    '        <div id="active-standard">',
    '          <div class="active-q-badge">Pergunta ativa</div>',
    '          <div class="active-q-text" id="aq-text"></div>',
    '          <classpulse-question id="cpq" mode="host"></classpulse-question>',
    '          <div style="margin-top:1rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem">',
    '            <span class="answer-tally" id="aq-tally"></span>',
    '            <div>',
    '              <div class="close-options">',
    '                <label><input type="checkbox" id="chk-show-results" checked> Mostrar resultados</label>',
    '                <label><input type="checkbox" id="chk-reveal-answer"> Revelar resposta correta</label>',
    '              </div>',
    '              <button class="host-btn host-btn-ghost cp-toggle-btn" id="toggle-bars-btn" type="button"></button>',
    '              <button class="host-btn host-btn-danger" id="close-question-btn">Encerrar pergunta</button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '        <div id="active-student-qa" style="display:none">',
    '          <div class="active-q-badge student-qa">Pergunta do aluno · no display</div>',
    '          <div class="student-qa-meta" id="sqa-meta"></div>',
    '          <div class="active-q-text" id="sqa-text"></div>',
    '          <div class="student-qa-answer-block">',
    '            <div class="student-qa-answer-label">Resposta no display</div>',
    '            <textarea class="student-qa-answer-input" id="sqa-response" placeholder="Digite a resposta. Os alunos veem cada palavra ao vivo enquanto você escreve." rows="3"></textarea>',
    '            <div class="student-qa-status" id="sqa-status"></div>',
    '            <div class="student-qa-hint">Encerre a pergunta quando terminar; a resposta fica salva no Q&amp;A.</div>',
    '          </div>',
    '          <div style="display:flex;justify-content:flex-end;gap:0.6rem">',
    '            <button class="host-btn host-btn-danger" id="sqa-close-btn">Encerrar pergunta</button>',
    '          </div>',
    '        </div>',
    '      </div>',
    '      <div class="host-card" id="history-card" style="display:none">',
    '        <div class="host-card-title">Histórico</div>',
    '        <div id="history-list"></div>',
    '      </div>',
    '      </section>',
    '      <div class="hd-resizer" data-resize="center-right" id="hdResizerCR"></div>',
    '      <section class="hd-col hd-col-right" id="hdColRight">',
    '      <section class="cp-qa-host-section" id="qa-section" style="display:none">',
    '        <div class="cp-qa-host-header">',
    '          <span class="cp-qa-host-title">Perguntas dos alunos</span>',
    '          <span class="cp-qa-badge" id="qa-badge" style="display:none">0</span>',
    '        </div>',
    '        <div id="qa-feed"></div>',
    '      </section>',
    '      </section>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="qr-modal" id="trail-modal">',
    '  <div class="qr-box" style="max-width:420px;text-align:left">',
    '    <h3 style="margin-bottom:1rem">Turma vinculada à sessão</h3>',
    '    <div id="trail-modal-content" class="host-pres-modal-content"></div>',
    '    <button class="host-btn host-btn-ghost host-btn-full" id="trail-modal-close-btn" style="margin-top:1rem">Fechar</button>',
    '  </div>',
    '</div>'
  ].join('\n');

  function mount(rootEl, opts) {
    opts = opts || {};
    var sessionCode = opts.sessionCode || null;
    var authToken   = opts.authToken   || '';

    // Per-mount state (closure-local, not module-level)
    var activeQId                = null;
    var _historyMap              = {};
    var _currentSession          = null;
    var _trailTurma              = null;
    var _trailAllTurmas          = [];
    var visToggle                = null;
    var qaModule                 = null;
    var activeQType              = null;
    var activeStudentQuestionId  = null;
    var _sqaLastServerAnswer     = null;
    var _sqaDraft                = null;
    var _sqaDebounce             = null;
    var _sqaSaving               = false;
    var layoutState              = null;
    var _unmounted               = false;

    // Document-level listeners registered during mount, tracked for cleanup.
    var _docListeners = [];

    function _addDocListener(type, fn) {
      document.addEventListener(type, fn);
      _docListeners.push({ type: type, fn: fn });
    }
    function _removeDocListeners() {
      _docListeners.forEach(function(entry) {
        document.removeEventListener(entry.type, entry.fn);
      });
      _docListeners = [];
    }

    // Inject template
    rootEl.innerHTML = TEMPLATE_HTML;

    // Scoped DOM helper
    function q(sel) { return rootEl.querySelector(sel); }
    function qq(sel) { return rootEl.querySelectorAll(sel); }

    // ---------------------------------------------------------------------------
    // cpq nudges (kick poll on session lifecycle events)
    // ---------------------------------------------------------------------------

    function _kickCpqPoll() {
      try {
        var cpq = q('#cpq');
        if (cpq && typeof cpq.startPolling === 'function') cpq.startPolling();
      } catch (_) {}
    }
    function _onSessionLive() {
      _kickCpqPoll();
      try { if (window.Topbar) Topbar.setTabDot('perguntas', true); } catch (_) {}
    }
    function _onQuestionLaunched() { _onSessionLive(); }

    // ---------------------------------------------------------------------------
    // Screen helpers (scoped to rootEl)
    // ---------------------------------------------------------------------------

    function showScreen(id) {
      qq('.host-screen').forEach(function(el) {
        el.classList.toggle('active', el.id === id);
      });
    }

    // ---------------------------------------------------------------------------
    // Alert helpers
    // ---------------------------------------------------------------------------

    function showAlert(type, msg) {
      if (type === 'error') { if (window.showToastError) showToastError(msg); return; }
      var el = q('#alert-' + type);
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
    }

    function clearAlert() {
      var el = q('#alert-success');
      if (!el) return;
      el.textContent = '';
      el.classList.remove('show');
    }

    // ---------------------------------------------------------------------------
    // Session loader (uses opts.sessionCode, not URL)
    // ---------------------------------------------------------------------------

    async function loadSession() {
      try {
        var code = sessionCode.toUpperCase();
        var results = await Promise.allSettled([
          callWorker({ action: 'list_sessions' }),
          callWorker({ action: 'ct_lookup_turma_by_session', auth_token: authToken, session_id: code }),
          callWorker({ action: 'ct_list_all_turmas', auth_token: authToken })
        ]);
        var data = results[0].status === 'fulfilled' ? results[0].value : { sessions: [] };
        _trailTurma     = (results[1].status === 'fulfilled' ? results[1].value.turma : null) || null;
        _trailAllTurmas = (results[2].status === 'fulfilled' ? results[2].value.turmas : null) || [];

        var match = (data.sessions || []).find(function(s) { return s.code === code; });
        if (!match) {
          if (window.showToastError) showToastError('Sessão ' + sessionCode + ' não encontrada.');
          return;
        }
        selectSession(match);
      } catch (e) {
        if (window.showToastError) showToastError('Erro ao carregar sessão: ' + e.message);
      }
    }

    function selectSession(s) {
      sessionCode = s.code;
      _currentSession = s;

      q('#session-name-display').textContent = s.title || ('Sessão ' + s.code);
      q('#display-link').href = '/go/display.html?code=' + encodeURIComponent(s.code);

      clearAlert();
      renderTrailLink();
      refreshShareSurface();
      applyHostedUI(s.status === 'open');

      if (!qaModule) {
        qaModule = ClassPulseQA.attach({
          sessionCode: s.code,
          authToken:   authToken,
          callWorker:  callWorker,
          containerEl: q('#qa-section'),
          toggleEl:    null,
          badgeEl:     q('#qa-badge'),
          feedEl:      q('#qa-feed'),
          onError:     function(msg) { showAlert('error', msg); },
          onPromoted:  function() {
            if (!layoutState.center.visible) {
              layoutState.center.visible = true;
              applyLayout(); saveLayout();
            }
          },
          onClosedActive: function() {}
        });
      } else {
        qaModule.setSessionCode(s.code);
      }

      q('#cpq').setAttribute('session', s.code);
    }

    function buildTrilhaUrl() {
      if (!_trailTurma) return null;
      var t = _trailTurma;
      return 'https://pensoia.com/trilha/' +
        encodeURIComponent(t.client_slug) + '/' +
        encodeURIComponent(t.turma_slug) +
        (t.token ? '?k=' + encodeURIComponent(t.token) : '');
    }

    function refreshShareSurface() {
      var hasTrilha = !!buildTrilhaUrl();
      var isHosted = document.body.classList.contains('is-hosted');
      q('#qr-btn').hidden = !(isHosted && hasTrilha);
    }

    function applyHostedUI(isHosted) {
      document.body.classList.toggle('is-hosted', isHosted);
      q('#host-live-indicator').hidden = !isHosted;
      q('#not-hosted-note').hidden = isHosted;
      q('#qr-btn').hidden = !(isHosted && !!_trailTurma);
      q('#display-link').hidden = !isHosted;
      q('#start-host-btn').hidden = isHosted;
      q('#stop-host-btn').hidden = !isHosted;
      q('#viewToggles').hidden = !isHosted;
      q('#resetLayoutBtn').hidden = !isHosted;
      q('#launch-q-card').style.display = isHosted ? '' : 'none';
      if (!isHosted) {
        q('#active-q-panel').style.display = 'none';
        q('#qa-section').style.display = 'none';
        activeQId = null;
        activeQType = null;
        activeStudentQuestionId = null;
      }
    }

    // ---------------------------------------------------------------------------
    // Trail (ClassTrail turma) linking
    // ---------------------------------------------------------------------------

    function renderTrailLink() {
      var btn     = q('#trail-btn');
      var content = q('#trail-modal-content');
      if (!btn || !content) return;

      btn.hidden = false;
      btn.classList.toggle('is-linked', !!_trailTurma);

      if (_trailTurma) {
        var t = _trailTurma;
        var turmaName  = t.display_name || t.name || t.turma_slug;
        var clientName = t.client_display_name || t.client_slug;
        var trilhaUrl  = '/trilha/' + encodeURIComponent(t.client_slug) + '/' + encodeURIComponent(t.turma_slug) + (t.token ? '?k=' + encodeURIComponent(t.token) : '');
        var adminUrl   = '/backstage/classtrail/';
        content.innerHTML =
          '<div class="host-pres-status">Vinculada a esta sessão</div>' +
          '<div class="host-pres-title">' + escHtml(turmaName) + '</div>' +
          '<div class="host-pres-engine">' + escHtml(clientName) + '</div>' +
          '<a class="host-pres-link" href="' + escHtml(trilhaUrl) + '" target="_blank" rel="noopener" style="margin-bottom:1.6rem">Abrir trilha ↗</a><br>' +
          '<a class="host-pres-link" href="' + escHtml(adminUrl) + '" target="_blank" rel="noopener">Abrir ClassTrail (admin) ↗</a>' +
          '<button class="host-btn host-btn-danger host-btn-full" id="trail-unlink-btn" style="margin-top:0.6rem">Desvincular turma</button>';
        q('#trail-unlink-btn').addEventListener('click', doUnlinkTrail);
      } else if (_trailAllTurmas.length > 0) {
        var opts2 = '<option value="">Selecione uma turma…</option>';
        _trailAllTurmas.forEach(function(t2) {
          var turmaName2  = t2.display_name || t2.name || t2.turma_slug;
          var clientName2 = t2.client_display_name || t2.client_slug;
          var label      = clientName2 + ' · ' + turmaName2;
          var inUse      = t2.classpulse_session_id && t2.classpulse_session_id !== sessionCode;
          var suffix     = inUse ? ' (vinculada a ' + t2.classpulse_session_id + ')' : '';
          var disabled   = inUse ? ' disabled' : '';
          var value      = t2.client_slug + '|' + t2.turma_slug;
          opts2 += '<option value="' + escHtml(value) + '"' + disabled + '>' + escHtml(label + suffix) + '</option>';
        });
        content.innerHTML =
          '<div class="host-pres-status">Nenhuma turma vinculada</div>' +
          '<select id="trail-picker">' + opts2 + '</select>' +
          '<button class="host-btn host-btn-primary host-btn-full" id="trail-link-btn">Vincular turma</button>';
        q('#trail-link-btn').addEventListener('click', async function() {
          var v = q('#trail-picker').value;
          if (!v) return;
          var parts = v.split('|');
          await doLinkTrail(parts[0], parts[1]);
        });
      } else {
        content.innerHTML = '<div class="host-pres-empty">Nenhuma turma cadastrada em ClassTrail.</div>';
      }
    }

    async function doLinkTrail(clientSlug, turmaSlug) {
      try {
        await callWorker({ action: 'ct_update_turma_meta', auth_token: authToken, client_slug: clientSlug, slug: turmaSlug, classpulse_session_id: sessionCode });
        var res = await callWorker({ action: 'ct_lookup_turma_by_session', auth_token: authToken, session_id: sessionCode });
        _trailTurma = res.turma || null;
        try {
          var listRes = await callWorker({ action: 'ct_list_all_turmas', auth_token: authToken });
          _trailAllTurmas = listRes.turmas || [];
        } catch (_) {}
        renderTrailLink();
        refreshShareSurface();
        q('#trail-modal').classList.remove('open');
        if (window.showToast) showToast('Turma vinculada.');
      } catch (e) {
        if (window.showToastError) showToastError(e.message);
      }
    }

    async function doUnlinkTrail() {
      if (!_trailTurma) return;
      try {
        await callWorker({ action: 'ct_update_turma_meta', auth_token: authToken, client_slug: _trailTurma.client_slug, slug: _trailTurma.turma_slug, classpulse_session_id: null });
        _trailTurma = null;
        try {
          var listRes2 = await callWorker({ action: 'ct_list_all_turmas', auth_token: authToken });
          _trailAllTurmas = listRes2.turmas || [];
        } catch (_) {}
        renderTrailLink();
        refreshShareSurface();
        q('#trail-modal').classList.remove('open');
        if (window.showToast) showToast('Turma desvinculada.');
      } catch (e) {
        if (window.showToastError) showToastError(e.message);
      }
    }

    q('#trail-btn').addEventListener('click', function() {
      q('#trail-modal').classList.add('open');
    });
    q('#trail-modal-close-btn').addEventListener('click', function() {
      q('#trail-modal').classList.remove('open');
    });
    q('#trail-modal').addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });

    // ---------------------------------------------------------------------------
    // Hosting actions (Iniciar / Encerrar)
    // ---------------------------------------------------------------------------

    async function doStartHost(force) {
      try {
        await callWorker({ action: 'reopen_session', auth_token: authToken, code: sessionCode });
        _currentSession.status = 'open';
        applyHostedUI(true);
        clearAlert();
        _onSessionLive();
      } catch (e) {
        if (!force && e.data && e.data.active_code) {
          var name = e.data.active_title || e.data.active_code;
          var msg = 'A sessão "' + name + '" já está aberta. Deseja encerrá-la para iniciar esta?';
          if (confirm(msg)) {
            try {
              await callWorker({ action: 'close_session', auth_token: authToken, code: e.data.active_code });
              await doStartHost(true);
              return;
            } catch (e2) {
              if (window.showToastError) showToastError('Erro ao encerrar a sessão ativa: ' + e2.message);
              return;
            }
          }
          return;
        }
        if (window.showToastError) showToastError(e.message);
      }
    }

    q('#start-host-btn').addEventListener('click', async function() {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Iniciando...';
      try { await doStartHost(false); }
      finally { btn.disabled = false; btn.textContent = 'Iniciar'; }
    });

    q('#stop-host-btn').addEventListener('click', async function() {
      if (!confirm('Encerrar a sessão? Os alunos não poderão mais responder.')) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Encerrando...';
      try {
        if (activeQId) {
          try { await callWorker({ action: 'close_question', auth_token: authToken, id: activeQId, session_code: sessionCode, show_results: false, reveal_answer: false }); } catch (_) {}
        }
        await callWorker({ action: 'close_session', auth_token: authToken, code: sessionCode });
        _currentSession.status = 'closed';
        applyHostedUI(false);
        clearAlert();
      } catch (e) {
        if (window.showToastError) showToastError(e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Encerrar';
      }
    });

    // ---------------------------------------------------------------------------
    // Question type selector
    // ---------------------------------------------------------------------------

    var MAX_POLL_OPTS = 6;

    function buildPollRow(idx) {
      var row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = '<div class="opt-letter">' + LETTERS[idx] + '</div>' +
        '<input class="host-input" type="text" placeholder="Opção ' + LETTERS[idx] + '">';
      return row;
    }

    function initPollRows(count) {
      var container = q('#poll-rows');
      container.innerHTML = '';
      for (var i = 0; i < count; i++) container.appendChild(buildPollRow(i));
    }

    var CHK_DEFAULTS = { 'chk-show-results': true, 'chk-reveal-answer': false };

    function resetChk(id, supported) {
      CPCheckboxSync.reset({ chk: q('#' + id), supported: supported, defaultChecked: !!CHK_DEFAULTS[id] });
    }

    function syncChk(id, supported) {
      CPCheckboxSync.sync({ chk: q('#' + id), supported: supported });
    }

    var formEls = {
      textInput:    q('#q-text'),
      mcPanel:      q('#q-opts-mc'),
      pollPanel:    q('#q-opts-poll'),
      ratingPanel:  q('#q-opts-rating'),
      numericPanel: q('#q-opts-numeric'),
      optA: q('#q-opt-a'),
      optB: q('#q-opt-b'),
      optC: q('#q-opt-c'),
      optD: q('#q-opt-d'),
      mcRows:        qq('#q-opts-mc .opt-row'),
      mcRadios:      qq('#q-opts-mc .opt-correct-radio'),
      correctRadios: qq('input[name="correct"]'),
      pollRows:      q('#poll-rows'),
      ratingMin:     q('#q-rating-min'),
      ratingMax:     q('#q-rating-max'),
      numericMin:    q('#q-num-min'),
      numericMax:    q('#q-num-max'),
      mcMaxSelect:   q('#q-mc-max-select'),
      pollMaxSelect: q('#q-poll-max-select'),
      initPollRows:  initPollRows
    };

    q('#q-mc-max-select').addEventListener('change', function() {
      CPQuestionTypes.get('mc').setupForm(formEls);
    });

    function applyTypeUI(qType) {
      var T = CPQuestionTypes.get(qType);
      CPQuestionTypes.applyVisibility(formEls, T);
      resetChk('chk-reveal-answer', T.canReveal);
      resetChk('chk-show-results',  T.canShowResults);
      q('#q-generate-btn').style.display = T.aiGenSupported ? '' : 'none';
      q('#q-improve-btn').style.display  = T.aiGenSupported ? '' : 'none';
    }

    q('#q-type').addEventListener('change', function() {
      applyTypeUI(this.value);
      qq('input[name="correct"]').forEach(function(r) { r.checked = false; });
    });

    q('#poll-add-btn').addEventListener('click', function() {
      var container = q('#poll-rows');
      if (container.children.length >= MAX_POLL_OPTS) return;
      container.appendChild(buildPollRow(container.children.length));
    });

    // ---------------------------------------------------------------------------
    // Question form
    // ---------------------------------------------------------------------------

    q('#launch-btn').addEventListener('click', async function() {
      var qType = q('#q-type').value;
      var text  = q('#q-text').value.trim();
      if (!text) return showAlert('error', 'Escreva a pergunta.');

      var T = CPQuestionTypes.get(qType);
      var read = T.readForm(formEls);
      if (read.error) return showAlert('error', read.error);

      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Lançando...';

      try {
        var res = await callWorker({
          action: 'launch_question', auth_token: authToken,
          session_code: sessionCode, type: qType, text: text,
          options: read.options, correct_answer: read.correct_answer,
          max_select: read.max_select !== undefined ? read.max_select : 1
        });
        activeQId = res.id;
        _onQuestionLaunched();
        visToggle.reset();
        clearAlert();
        clearForm();
      } catch (e) {
        showAlert('error', 'Erro: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lançar pergunta';
      }
    });

    q('#close-question-btn').addEventListener('click', async function() {
      if (!activeQId) return;
      var showResults  = q('#chk-show-results').checked;
      var revealAnswer = q('#chk-reveal-answer').checked;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Encerrando...';
      try {
        await callWorker({ action: 'close_question', auth_token: authToken, id: activeQId, session_code: sessionCode, show_results: showResults, reveal_answer: revealAnswer });
        activeQId = null;
        q('#active-q-panel').style.display = 'none';
        visToggle.reset();
        clearAlert();
      } catch (e) {
        showAlert('error', 'Erro: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Encerrar pergunta';
      }
    });

    q('#clear-form-btn').addEventListener('click', clearForm);

    function clearForm() {
      q('#q-text').value = '';
      CPQuestionTypes.list().forEach(function(t) {
        CPQuestionTypes.get(t).clearForm(formEls);
      });
      q('#q-type').value = 'mc';
      applyTypeUI('mc');
    }

    applyTypeUI(q('#q-type').value);

    // ---------------------------------------------------------------------------
    // CPVisibilityToggle
    // ---------------------------------------------------------------------------

    visToggle = CPVisibilityToggle.attach({
      buttonEl:       q('#toggle-bars-btn'),
      getActiveQId:   function() { return activeQId; },
      getSessionCode: function() { return sessionCode; },
      authToken:      authToken,
      callWorker:     callWorker,
      onError:        function(msg) { showAlert('error', msg); }
    });

    // ---------------------------------------------------------------------------
    // Component events (cpq-data)
    // ---------------------------------------------------------------------------

    var cpqEl = q('#cpq');

    cpqEl.addEventListener('cpq-data', function(e) {
      var data = e.detail;
      if (!sessionCode) return;

      if (qaModule) qaModule.syncFromState(data);
      renderHistory(data.history || []);

      var qItem = data.active_question;
      if (!qItem) {
        activeQId = null;
        activeQType = null;
        activeStudentQuestionId = null;
        q('#active-q-panel').style.display = 'none';
        q('#active-standard').style.display = '';
        q('#active-student-qa').style.display = 'none';
        return;
      }

      activeQId   = qItem.id;
      activeQType = qItem.type || 'mc';

      if (activeQType === 'student_qa') {
        activeStudentQuestionId = qItem.student_question_id || null;
        renderStudentQaActive(qItem);
        q('#active-standard').style.display = 'none';
        q('#active-student-qa').style.display = '';
        q('#active-q-panel').style.display = 'block';
        return;
      }

      activeStudentQuestionId = null;
      q('#active-student-qa').style.display = 'none';
      q('#active-standard').style.display = '';

      q('#aq-text').textContent = qItem.text;
      visToggle.syncFromQuestion(qItem);

      var T2 = CPQuestionTypes.get(qItem.type || 'mc');
      var total = 0;
      if (T2.usesTextAnswers) {
        total = (qItem.text_answers || []).length;
      } else {
        var counts = qItem.answer_counts || [];
        total = counts.reduce(function(a, b) { return a + b; }, 0);
      }
      q('#aq-tally').textContent = total + ' resposta' + (total !== 1 ? 's' : '');

      syncChk('chk-reveal-answer', T2.canReveal);
      syncChk('chk-show-results',  T2.canShowResults);

      q('#active-q-panel').style.display = 'block';
    });

    // ---------------------------------------------------------------------------
    // Student Q&A active question
    // ---------------------------------------------------------------------------

    function renderStudentQaActive(qItem) {
      var metaEl   = q('#sqa-meta');
      var textEl   = q('#sqa-text');
      var inputEl  = q('#sqa-response');
      var statusEl = q('#sqa-status');

      var when = '';
      try { when = qItem.student_time ? new Date(qItem.student_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) {}
      metaEl.textContent = (qItem.student_name || 'Aluno') + (when ? ' · ' + when : '');
      textEl.textContent = qItem.text || '';

      var serverAnswer = qItem.student_answer || '';
      if (document.activeElement !== inputEl) {
        if (serverAnswer !== _sqaLastServerAnswer) {
          inputEl.value = serverAnswer;
          _sqaDraft = serverAnswer;
        }
      }
      _sqaLastServerAnswer = serverAnswer;
      statusEl.textContent = _sqaSaving ? 'Salvando…' : '';
      statusEl.classList.toggle('is-saving', _sqaSaving);
    }

    function scheduleSqaSave() {
      if (_sqaDebounce) clearTimeout(_sqaDebounce);
      _sqaDebounce = setTimeout(commitSqaAnswer, 350);
    }

    async function commitSqaAnswer() {
      if (!activeStudentQuestionId) return;
      var inputEl = q('#sqa-response');
      var text = inputEl.value;
      if (text === _sqaLastServerAnswer) return;
      _sqaSaving = true;
      q('#sqa-status').textContent = 'Salvando…';
      q('#sqa-status').classList.add('is-saving');
      try {
        var res2 = await callWorker({ action: 'update_student_question', auth_token: authToken, id: activeStudentQuestionId, status: 'pending', answer: text });
        if (res2 && res2.ok) {
          _sqaLastServerAnswer = text;
          q('#sqa-status').textContent = 'Salvo';
          setTimeout(function() {
            if (!_sqaSaving) q('#sqa-status').textContent = '';
          }, 1200);
        }
      } catch (e) {
        showAlert('error', 'Erro ao salvar resposta: ' + e.message);
      } finally {
        _sqaSaving = false;
        q('#sqa-status').classList.remove('is-saving');
      }
    }

    q('#sqa-response').addEventListener('input', function() {
      _sqaDraft = this.value;
      scheduleSqaSave();
    });

    q('#sqa-close-btn').addEventListener('click', async function() {
      if (!activeQId) return;
      if (_sqaDebounce) { clearTimeout(_sqaDebounce); _sqaDebounce = null; }
      await commitSqaAnswer();
      this.disabled = true;
      this.textContent = 'Encerrando...';
      try {
        await callWorker({ action: 'close_question', auth_token: authToken, id: activeQId, session_code: sessionCode, show_results: true, reveal_answer: false });
        activeQId = null;
        activeQType = null;
        activeStudentQuestionId = null;
        q('#active-q-panel').style.display = 'none';
      } catch (e) {
        showAlert('error', 'Erro: ' + e.message);
      } finally {
        this.disabled = false;
        this.textContent = 'Encerrar pergunta';
      }
    });

    cpqEl.addEventListener('cpq-remove-answer', function(e) {
      removeAnswer(e.detail.id, e.detail.el);
    });

    async function removeAnswer(answerId, cardEl) {
      try {
        await callWorker({ action: 'delete_answer', auth_token: authToken, answer_id: answerId });
        cardEl.remove();
      } catch (e) {
        showAlert('error', 'Erro ao remover resposta: ' + escHtml(e.message));
      }
    }

    // ---------------------------------------------------------------------------
    // History
    // ---------------------------------------------------------------------------

    var TYPE_LABELS = { mc: 'MC', tf: 'V/F', poll: 'Enquete', open: 'Aberta', wordcloud: 'Nuvem', rating: 'Avaliação', numeric: 'Número' };
    function typeTag(type) {
      var label = TYPE_LABELS[type] || type;
      return '<span class="hi-type-badge hi-type-' + (type || 'mc') + '">' + label + '</span>';
    }

    function renderHistory(closedQs) {
      if (!closedQs.length) {
        q('#history-card').style.display = 'none';
        return;
      }
      _historyMap = {};
      var html = closedQs.map(function(qh) {
        _historyMap[qh.id] = qh;

        var resultsHtml = '';
        if (qh.options && qh.answer_counts && qh.options.length > 0) {
          var hTotal  = qh.answer_counts.reduce(function(a, b) { return a + b; }, 0);
          var hDenom  = (qh.voter_count && qh.voter_count > 0) ? qh.voter_count : hTotal;
          var hCorrect = Array.isArray(qh.correct_answers) ? qh.correct_answers : [];
          resultsHtml = '<div class="hi-results">';
          qh.options.forEach(function(opt, i) {
            var pct = hDenom > 0 ? Math.round(qh.answer_counts[i] / hDenom * 100) : 0;
            var isCorrect = qh.reveal_answer && hCorrect.indexOf(i) !== -1;
            resultsHtml += '<div class="hi-bar">' +
              '<div class="hi-bar-label">' +
              '<span class="hi-bar-badge ' + (isCorrect ? 'correct' : '') + '">' + LETTERS[i] + (isCorrect ? ' ✓' : '') + '</span>' +
              '<span class="hi-bar-text">' + escHtml(stripOptPrefix(opt)) + '</span>' +
              '</div>' +
              '<div class="hi-bar-pct">' + pct + '%</div>' +
              '<div class="hi-bar-count">' + qh.answer_counts[i] + '</div>' +
              '</div>';
          });
          resultsHtml += '</div>';
        }

        return '<div class="history-item">' +
          '<div style="flex:1;min-width:0">' +
          '<div class="hi-text">' + escHtml(qh.text || '') + '</div>' +
          typeTag(qh.type || 'mc') +
          '<div class="hi-meta">' + escHtml(qh.created_at ? new Date(qh.created_at).toLocaleString('pt-BR') : '') + '</div>' +
          resultsHtml +
          '<div class="hi-actions">' +
          '<button class="hi-btn hi-btn-primary" data-action="relaunch" data-qid="' + escHtml(qh.id) + '">Reabrir</button>' +
          '<button class="hi-btn" data-action="edit" data-qid="' + escHtml(qh.id) + '">Editar</button>' +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');
      q('#history-list').innerHTML = html;
      q('#history-list').querySelectorAll('.hi-btn[data-action]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var qhItem = _historyMap[btn.dataset.qid];
          if (!qhItem) return;
          if (btn.dataset.action === 'relaunch') relaunchFromHistory(btn, qhItem);
          else if (btn.dataset.action === 'edit') editFromHistory(qhItem);
        });
      });
      q('#history-card').style.display = 'block';
    }

    async function relaunchFromHistory(btn, qh) {
      if (activeQId && !confirm('Já existe uma pergunta ativa. Encerrar a atual e lançar esta?')) return;
      var oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        var res3 = await callWorker({
          action: 'launch_question', auth_token: authToken, session_code: sessionCode,
          type: qh.type || 'mc', text: qh.text, options: qh.options,
          correct_answer: qh.correct_answers && qh.correct_answers.length
            ? (qh.max_select !== 1 ? qh.correct_answers : qh.correct_answers[0]) : null,
          max_select: qh.max_select || 1
        });
        activeQId = res3.id;
        _onQuestionLaunched();
        if (window.showToast) showToast('Pergunta relaçada!');
      } catch (e) {
        if (window.showToastError) showToastError('Erro ao relançar: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }

    function stripHtml(str) {
      if (!str) return '';
      return str.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    }

    function editFromHistory(qh) {
      q('#q-text').value = stripHtml(qh.text || '');
      var qType = qh.type || 'mc';
      q('#q-type').value = qType;
      applyTypeUI(qType);
      CPQuestionTypes.get(qType).restoreForm(formEls, {
        options: qh.options,
        correct_answers: qh.correct_answers || [],
        correct_answer: qh.correct_answers && qh.correct_answers.length === 1 ? qh.correct_answers[0] : null,
        max_select: qh.max_select || 1
      });
    }

    // ---------------------------------------------------------------------------
    // QR modal
    // ---------------------------------------------------------------------------

    q('#qr-btn').addEventListener('click', function() {
      QRShareModal.open({ joinUrl: buildTrilhaUrl() });
    });

    // ---------------------------------------------------------------------------
    // Question bank
    // ---------------------------------------------------------------------------

    q('#bank-toggle-btn').addEventListener('click', function() {
      var panel = q('#bank-panel');
      var isOpen = panel.classList.toggle('open');
      this.classList.toggle('open', isOpen);
      if (isOpen) QuestionBank.loadSets();
    });

    QuestionBank.init({
      setSelect:    q('#bank-set-select'),
      questionList: q('#bank-q-list'),
      generateBtn:  q('#q-generate-btn'),
      improveBtn:   q('#q-improve-btn'),
      errorEl:      q('#q-error'),
      canDelete:    false,
      canCreateSet: false,
      onSelect:  function(qb) { prefillForm(qb); },
      onLaunch:  function(qb, btn) { launchFromBank(qb, btn); },
      getFormState: function() {
        var qType = q('#q-type').value;
        var maxSelEl = qType === 'mc' ? q('#q-mc-max-select') : qType === 'poll' ? q('#q-poll-max-select') : null;
        return {
          text: q('#q-text').value.trim(),
          type: qType,
          options: [q('#q-opt-a').value.trim(), q('#q-opt-b').value.trim(), q('#q-opt-c').value.trim(), q('#q-opt-d').value.trim()],
          max_select: maxSelEl ? parseInt(maxSelEl.value) : 1
        };
      }
    });

    async function launchFromBank(qb, btn) {
      btn.disabled = true;
      btn.textContent = 'Lançando...';
      try {
        var opts3 = typeof qb.options === 'string' ? JSON.parse(qb.options) : (qb.options || []);
        var maxSel = (qb.max_select !== undefined && qb.max_select !== null) ? parseInt(qb.max_select) : 1;
        var ca2 = (qb.correct_answer !== null && qb.correct_answer !== undefined && qb.correct_answer !== '') ? qb.correct_answer : null;
        var res4 = await callWorker({ action: 'launch_question', auth_token: authToken, session_code: sessionCode, type: qb.type || 'mc', text: qb.question, options: opts3, correct_answer: ca2, max_select: maxSel });
        activeQId = res4.id;
        _onQuestionLaunched();
        clearAlert();
      } catch (e) {
        showAlert('error', 'Erro ao lançar: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lançar';
      }
    }

    function prefillForm(qb) {
      q('#q-text').value = stripHtml(qb.question || '');
      var qType = qb.type || 'mc';
      q('#q-type').value = qType;
      applyTypeUI(qType);
      var parsedOpts;
      if (typeof qb.options === 'string') {
        try { parsedOpts = JSON.parse(qb.options); } catch (_) { parsedOpts = []; }
      } else {
        parsedOpts = qb.options || [];
      }
      var correctAnswers2 = Array.isArray(qb.correct_answers) ? qb.correct_answers
        : (qb.correct_answer !== null && qb.correct_answer !== undefined && qb.correct_answer !== '' ? [parseInt(qb.correct_answer)] : []);
      CPQuestionTypes.get(qType).restoreForm(formEls, {
        options: parsedOpts,
        correct_answers: correctAnswers2,
        correct_answer: qb.correct_answer,
        max_select: qb.max_select !== undefined ? qb.max_select : 1
      });
    }

    // ---------------------------------------------------------------------------
    // Dashboard layout
    // ---------------------------------------------------------------------------

    var LAYOUT_KEY = 'classpulse_b1_layout';
    var DEFAULT_LAYOUT = { left: { visible: true, width: 360 }, center: { visible: true }, right: { visible: true, width: 380 } };

    function loadLayout() {
      try {
        var saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
        if (!saved) return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        ['left', 'center', 'right'].forEach(function(k) {
          if (!saved[k]) saved[k] = JSON.parse(JSON.stringify(DEFAULT_LAYOUT[k]));
          if (typeof saved[k].visible !== 'boolean') saved[k].visible = true;
        });
        return saved;
      } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); }
    }

    function saveLayout() {
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutState)); } catch (e) {}
    }

    layoutState = loadLayout();

    function applyLayout() {
      var leftEl   = q('#hdColLeft');
      var centerEl = q('#hdColCenter');
      var rightEl  = q('#hdColRight');
      var rLC      = q('#hdResizerLC');
      var rCR      = q('#hdResizerCR');
      if (!leftEl || !centerEl || !rightEl) return;

      leftEl.classList.toggle('is-hidden',   !layoutState.left.visible);
      centerEl.classList.toggle('is-hidden', !layoutState.center.visible);
      rightEl.classList.toggle('is-hidden',  !layoutState.right.visible);

      rLC.classList.toggle('is-hidden', !(layoutState.left.visible  && (layoutState.center.visible || layoutState.right.visible)));
      rCR.classList.toggle('is-hidden', !(layoutState.right.visible && (layoutState.center.visible || layoutState.left.visible)));

      var maxW = Math.min(600, Math.max(280, window.innerWidth - 320));
      layoutState.left.width  = Math.max(260, Math.min(maxW, layoutState.left.width  || 360));
      layoutState.right.width = Math.max(280, Math.min(maxW, layoutState.right.width || 380));
      leftEl.style.width  = layoutState.left.width  + 'px';
      rightEl.style.width = layoutState.right.width + 'px';

      qq('[data-toggle-col]').forEach(function(btn) {
        btn.classList.toggle('is-on', !!layoutState[btn.dataset.toggleCol].visible);
      });
    }

    qq('[data-toggle-col]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var col = btn.dataset.toggleCol;
        layoutState[col].visible = !layoutState[col].visible;
        var visibleCount = ['left', 'center', 'right'].filter(function(k) { return layoutState[k].visible; }).length;
        if (visibleCount === 0) {
          layoutState[col].visible = true;
          showAlert('error', 'Pelo menos uma coluna precisa ficar visível.');
          return;
        }
        applyLayout();
        saveLayout();
      });
    });

    q('#resetLayoutBtn').addEventListener('click', function() {
      layoutState = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
      applyLayout();
      saveLayout();
    });

    function startResize(e, handle) {
      e.preventDefault();
      try { handle.setPointerCapture && handle.setPointerCapture(e.pointerId); } catch (_) {}
      handle.classList.add('dragging');
      var direction = handle.dataset.resize;
      var startX = e.clientX;
      var leftCol  = q('#hdColLeft');
      var rightCol = q('#hdColRight');
      var startLeftW  = leftCol.offsetWidth;
      var startRightW = rightCol.offsetWidth;

      function onMove(ev) {
        var delta = ev.clientX - startX;
        var maxW2 = Math.min(600, window.innerWidth - 320);
        if (direction === 'left-center') {
          var w = Math.max(260, Math.min(maxW2, startLeftW + delta));
          leftCol.style.width = w + 'px';
          layoutState.left.width = w;
        } else {
          var w2 = Math.max(280, Math.min(maxW2, startRightW - delta));
          rightCol.style.width = w2 + 'px';
          layoutState.right.width = w2;
        }
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        saveLayout();
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    qq('.hd-resizer').forEach(function(h) {
      h.addEventListener('pointerdown', function(e) { startResize(e, h); });
    });

    applyLayout();

    // ---------------------------------------------------------------------------
    // Hamburger menu (narrow viewports)
    // ---------------------------------------------------------------------------

    (function() {
      var btn   = q('#hostBarMenuBtn');
      var panel = q('#hostBarMenuPanel');
      if (!btn || !panel) return;

      function _addProxy(sourceEl, label) {
        if (!sourceEl || sourceEl.hidden) return;
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'host-bar-menu-row';
        row.textContent = label || (sourceEl.textContent || sourceEl.getAttribute('aria-label') || '').trim();
        row.addEventListener('click', function() {
          panel.hidden = true;
          if (sourceEl.tagName === 'A' && sourceEl.href) window.location.href = sourceEl.href;
          else sourceEl.click();
        });
        panel.appendChild(row);
      }

      function _rebuildPanel() {
        panel.innerHTML = '';
        var subtabs = q('#live-bar-subtabs');
        if (subtabs) {
          var sc = subtabs.cloneNode(true);
          sc.removeAttribute('id');
          panel.appendChild(sc);
        }
        _addProxy(q('.host-session-bar .view-toggle[data-toggle-col="left"]'),   'Coluna Composer');
        _addProxy(q('.host-session-bar .view-toggle[data-toggle-col="center"]'), 'Coluna Pergunta ativa');
        _addProxy(q('.host-session-bar .view-toggle[data-toggle-col="right"]'),  'Coluna Q&A');
        _addProxy(q('#resetLayoutBtn'), 'Restaurar layout');
        _addProxy(q('#trail-btn'));
        _addProxy(q('#qr-btn'));
        _addProxy(q('#display-link'));
      }

      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!panel.hidden) { panel.hidden = true; return; }
        _rebuildPanel();
        panel.hidden = false;
      });

      var _hamburgerClose = function(e) {
        if (panel.hidden) return;
        if (panel.contains(e.target) || btn.contains(e.target)) return;
        panel.hidden = true;
      };
      _addDocListener('click', _hamburgerClose);
    })();

    // ---------------------------------------------------------------------------
    // Boot: load session immediately (caller guarantees sessionCode is valid)
    // ---------------------------------------------------------------------------

    loadSession();

    // ---------------------------------------------------------------------------
    // Unmount
    // ---------------------------------------------------------------------------

    var handle = {
      unmount: function() {
        if (_unmounted) return;
        _unmounted = true;

        // Clear sqa debounce timer
        if (_sqaDebounce) { clearTimeout(_sqaDebounce); _sqaDebounce = null; }

        // Remove document-level listeners (hamburger close-on-outside-click, resize drag)
        _removeDocListeners();

        // Stop cpq polling
        var cpqElForCleanup = rootEl.querySelector('#cpq');
        if (cpqElForCleanup) {
          if (typeof cpqElForCleanup.removeAttribute === 'function') {
            try { cpqElForCleanup.removeAttribute('session'); } catch (_) {}
          }
          if (typeof cpqElForCleanup.stopPolling === 'function') {
            try { cpqElForCleanup.stopPolling(); } catch (_) {}
          }
        }

        // Detach QA module if possible
        if (qaModule) {
          if (typeof qaModule.detach === 'function') {
            try { qaModule.detach(); } catch (_) {}
          }
          qaModule = null;
        }

        // Clear the root element
        rootEl.innerHTML = '';
      }
    };

    return handle;
  }

  window.CPHostModule = {
    mount: mount
  };

})();
