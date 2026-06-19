// codex/questions/display.js
// Boot for the session projector display. Port of go/display.html: the legacy
// <classpulse-question> becomes <codex-question> (scoped onData, no event bus);
// trilha resolution goes through the codex-api facade, not callWorker.
import { register as registerQuestionEl, TAG as QTAG } from './question-element.js';
import { cohorts } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { isProjecting, toggleProjection, enrollQrSrc, entrarUrl } from '../js/enroll-control.js';

let _turma = null;            // resolved turma (client_slug, turma_slug, token)
let _enrollState = null;      // last ct_get_enrollment result (the shared window state)

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
  _wireQrToggle();

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

// The display doubles as a control surface (it is admin-auth'd): the QR button
// toggles the SAME enrollment projection the host panel does, so the instructor can
// run it from the projector or their phone. One server state, one toggle (the shared
// enroll-control), two surfaces — "é tudo o mesmo código".
function _wireQrToggle() {
  const btn = document.getElementById('cdx-disp-qr-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!_turma) return;
    const ids = { client_slug: _turma.client_slug, slug: _turma.turma_slug };
    Promise.resolve(toggleProjection(cohorts, ids, _enrollState)).then(_pollEnroll).catch(() => {});
  });
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
  const ids = { client_slug: _turma.client_slug, slug: _turma.turma_slug };
  cohorts.getEnrollment(ids).then((res) => {
    _enrollState = (res && res.ok) ? res : null;
    const toggle = document.getElementById('cdx-disp-qr-toggle');
    if (toggle) { toggle.hidden = false; toggle.classList.toggle('is-on', isProjecting(_enrollState)); }
    const overlay = document.getElementById('cdx-disp-enroll');
    if (!overlay) return;
    if (!isProjecting(_enrollState)) { overlay.hidden = true; return; }
    const img = document.getElementById('cdx-disp-enroll-qr');
    if (img) {
      const src = enrollQrSrc(_enrollState, ids, 1200);
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
    }
    // The typed-entry address to the right of the QR: pensoia.com/trilha/<code> with
    // the 4-digit code emphasized, so it can be dictated or typed on a computer.
    const urlEl = document.getElementById('cdx-disp-enroll-url');
    if (urlEl) {
      const code = String(_enrollState.enrollment_code || '');
      const codeOut = /^[0-9]{4}$/.test(code) ? code : '----';
      // Code on its own line below the address, so it never splits across a wrap.
      urlEl.innerHTML = '<span class="cdx-disp-enroll-prefix">' + entrarUrl('') + '</span>' +
        '<span class="cdx-disp-enroll-code">' + codeOut + '</span>';
    }
    overlay.hidden = false;
  }).catch(() => {});
}
