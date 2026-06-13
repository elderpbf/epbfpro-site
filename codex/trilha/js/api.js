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
  validateCert: (p) => call('cert_validate', p),     // { code } -> { ok, certificate } | { ok:false }

  // (added as the timeline modules land:)
  // resolveTrilha:    (p) => call('cp_resolve_trilha', p),
  // turmaView:        (p) => call('ct_get_turma_view', p),
  // activeForTurma:   (p) => call('cp_get_active_for_turma', p),
  // itemPublic:       (p) => call('ct_get_item_public', p),
  // sessionState:     (p) => call('get_session_state', p),
  // studentInbox:     (p) => call('cp_student_inbox', p),
  // submitStudentQ:   (p) => call('submit_student_question', p),
  // submitAnswer:     (p) => call('submit_answer', p),
};

export { assetUrl };
