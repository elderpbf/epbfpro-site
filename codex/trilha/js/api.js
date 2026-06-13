// codex/trilha/js/api.js
// Trail facade — the PUBLIC student face reaches the backend ONLY through here,
// never raw callWorker. Wraps the auth-free Worker actions Trail consumes.
//
// The admin facade (../../js/codex-api.js) DELIBERATELY omits these public
// actions (see its cert_validate note): they belong to the public Trail face,
// which owns them here. We reuse codex-api.js's low-level call()/assetUrl() seam
// (the single backend base = window.WORKER_URL, pointed at codex-api by the page
// boot) instead of re-implementing the transport.
import { call, assetUrl } from '../../js/codex-api.js';

export const trail = {
  // Certificates (public validation page)
  validateCert:   (p) => call('cert_validate', p),          // { code } -> { ok, certificate } | { ok:false }

  // Student timeline
  turmaView:      (p) => call('ct_get_turma_view', p),      // { client_slug, turma_slug, token } -> { client, turma, items, aulas, apostila_set }
  itemPublic:     (p) => call('ct_get_item_public', p),     // { item_id, ... } -> item detail

  // Live questions (ClassPulse public surface)
  activeForTurma: (p) => call('cp_get_active_for_turma', p),// { client_slug, turma_slug } -> { session, question } | { session:null }
  sessionState:   (p) => call('get_session_state', p),      // { code } -> live state
  submitAnswer:   (p) => call('submit_answer', p),          // { question_id, session_code, ... }
  studentInbox:   (p) => call('cp_student_inbox', p),       // { session_code, student_name }
  submitStudentQ: (p) => call('submit_student_question', p),// { session_code, student_name, text }
};

export { assetUrl };
