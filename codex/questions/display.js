// codex/questions/display.js
// Boot for the session projector display. Port of go/display.html: the legacy
// <classpulse-question> becomes <codex-question> (scoped onData, no event bus);
// trilha resolution goes through the codex-api facade, not callWorker.
import { register as registerQuestionEl, TAG as QTAG } from './question-element.js';
import { cohorts } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { enrollUrl } from '../js/enroll-clock.js';

let _turma = null;            // resolved turma (client_slug, turma_slug, token)

// Production host: the QR is scanned by students on their own phones.
function _trilhaUrl(tr) {
  return 'https://pensoia.com/trilha/' + encodeURIComponent(tr.client_slug) + '/' +
    encodeURIComponent(tr.turma_slug) + (tr.token ? '?k=' + encodeURIComponent(tr.token) : '');
}

export function start() {
  const params = new URLSearchParams(location.search);
  const sessionCode = (params.get('code') || '').trim().toUpperCase();
  const headerEl = document.querySelector('pensoia-header');
  const mainEl = document.getElementById('cdx-disp-main');
  const noCode = document.getElementById('cdx-disp-nocode');

  if (!sessionCode) {
    if (mainEl) mainEl.style.display = 'none';
    if (noCode) noCode.style.display = 'block';
    return;
  }
  if (headerEl) headerEl.setAttribute('code', sessionCode);

  // The linked turma only resolves once the session is live, but the display is
  // usually opened first — so retry each poll tick until it lands, then stop.
  function resolveTrilha() {
    if (!headerEl || headerEl.getAttribute('join-url')) return;
    cohorts.lookupTurmaBySession({ session_id: sessionCode }).then((res) => {
      const tr = res && res.turma;
      if (!tr) return;
      _turma = tr;
      headerEl.setAttribute('join-url', _trilhaUrl(tr));
    }).catch(() => {});
  }
  resolveTrilha();
  _startEnrollWatch();

  const centerState = document.getElementById('cdx-disp-center');
  if (centerState) centerState.remove();

  registerQuestionEl();
  const cpq = document.createElement(QTAG);
  cpq.id = 'cdx-disp-cpq';
  cpq.setAttribute('mode', 'display');
  cpq.setAttribute('session', sessionCode);
  cpq.onData = (data) => {
    if (!data) return;
    if (data.session && headerEl) headerEl.setAttribute('session-title', data.session.title || '');
    resolveTrilha();
    _renderStudentQA(data, cpq);
  };
  mainEl.insertBefore(cpq, document.getElementById('cdx-disp-qa'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const el = document.getElementById('cdx-disp-cpq');
      if (el && typeof el.startPolling === 'function') el.startPolling();
    }
  });
}

// Promote a student question into the big card, hiding the instructor render.
// Anon_* device handles collapse to "Anônimo" (mirror of identity.js audienceLabel).
function _renderStudentQA(data, cpq) {
  const card = document.getElementById('cdx-disp-qa');
  if (!card) return;
  const aq = data.active_question;
  if (!(aq && aq.type === 'student_qa')) {
    card.classList.remove('is-active');
    if (cpq) cpq.style.display = '';
    return;
  }
  if (cpq) cpq.style.display = 'none';
  const nm = aq.student_name || '';
  const nameEl = document.getElementById('cdx-disp-qa-name');
  if (nameEl) nameEl.textContent = (!nm || /^anon[_-]/i.test(nm)) ? t('questions.display_anon') : nm;
  const textEl = document.getElementById('cdx-disp-qa-text');
  if (textEl) textEl.textContent = aq.text || '';
  const ansWrap = document.getElementById('cdx-disp-qa-answer-wrap');
  const ansText = (aq.student_answer || '').trim();
  if (ansText) {
    const ansEl = document.getElementById('cdx-disp-qa-answer');
    if (ansEl) ansEl.textContent = aq.student_answer;
    if (ansWrap) ansWrap.classList.add('is-visible');
  } else if (ansWrap) {
    ansWrap.classList.remove('is-visible');
  }
  card.classList.add('is-active');
}

// The enrollment QR overlay: shown only while the instructor projects it
// (server state: open && qr_shown). Polled like everything else on the display;
// the countdown is the instructor's business and lives on the session panel, not here.
function _startEnrollWatch() {
  _pollEnroll();
  setInterval(_pollEnroll, 3000);
}

function _pollEnroll() {
  if (!_turma) return;
  cohorts.getEnrollment({ client_slug: _turma.client_slug, slug: _turma.turma_slug }).then((res) => {
    const overlay = document.getElementById('cdx-disp-enroll');
    if (!overlay) return;
    if (!(res && res.ok && res.open && res.qr_shown)) { overlay.hidden = true; return; }
    const img = document.getElementById('cdx-disp-enroll-qr');
    if (img) {
      const url = enrollUrl('https://pensoia.com', _turma.client_slug, _turma.turma_slug, res.turma_token, res.enrollment_token);
      const src = 'https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=2&data=' + encodeURIComponent(url);
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
    }
    overlay.hidden = false;
  }).catch(() => {});
}
