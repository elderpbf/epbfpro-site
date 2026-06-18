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
  submitTarefa:   (p) => call('ct_submit_tarefa', p),       // { client_slug, turma_slug, token, item_id, student_name, answer_type, answer_json }

  // Live questions (ClassPulse public surface)
  activeForTurma: (p) => call('cp_get_active_for_turma', p),// { client_slug, turma_slug } -> { session, question } | { session:null }
  sessionState:   (p) => call('get_session_state', p),      // { code } -> live state
  submitAnswer:   (p) => call('submit_answer', p),          // { question_id, session_code, ... }
  studentInbox:   (p) => call('cp_student_inbox', p),       // { session_code, student_name }
  submitStudentQ: (p) => call('submit_student_question', p),// { session_code, student_name, text }

  // Student identity (Phase 1: magic-link self-registration + consent). Public
  // actions; session_token-bearing calls POST automatically (see worker-call.js).
  authRequest:    (p) => call('student_auth_request', p),   // { client_slug, turma_slug, email } -> { ok, dev_magic_token? } | { error }
  authVerify:     (p) => call('student_auth_verify', p),    // { token } -> { ok, session_token, participant_id, turma_id, needs_profile } | { error }
  profileSave:    (p) => call('student_profile_save', p),   // { session_token, display_name, consent, consent_version } -> { ok } | { error }
  sessionCheck:   (p) => call('student_session_check', p),  // { session_token } -> { ok, participant_id, turma_id } | { error }

  // Device-presence (Phase 7, signal b): claim a presence grant while the turma's
  // live session is open; the device stores it and offers it at login so being in
  // the room earns access even if the student logs in later.
  presenceClaim:  (p) => call('student_presence_claim', p), // { client_slug, turma_slug } -> { ok, granted, presence_token? }

  // QR enrollment (Phase 7b). The QR projected in class carries ?et=<token>. claim
  // mints a presence grant on scan (bridges an off-window login); join is the
  // frictionless in-class path that mints an approved session with no email round-trip.
  enrollClaim:    (p) => call('student_enroll_claim', p),    // { client_slug, turma_slug, et } -> { ok, granted, presence_token? }
  enrollJoin:     (p) => call('student_enroll_join', p),     // { client_slug, turma_slug, et, email, name? } -> { ok, session_token, ... } | { error }
};

export { assetUrl };
