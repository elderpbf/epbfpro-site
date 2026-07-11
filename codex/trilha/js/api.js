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

  // Student identity (e-mail OTP: the 4-letter code that replaces the magic link).
  // Public actions; session_token-bearing calls POST automatically (see worker-call.js).
  otpRequest:     (p) => call('student_otp_request', p),    // { email } -> { ok, dev_otp_code? } | { error }
  otpVerify:      (p) => call('student_otp_verify', p),     // { email, code, client_slug?, turma_slug?, presence_token? } -> { ok, turmas:[{client_slug,turma_slug,client_name,turma_name,token,session_token,participant_id,needs_profile,access}] } | { error }
  profileSave:    (p) => call('student_profile_save', p),   // { session_token, display_name, consent, consent_version } -> { ok } | { error }
  sessionCheck:   (p) => call('student_session_check', p),  // { session_token } -> { ok, participant_id, turma_id } | { error }
  // Server-side logout (track-36 d): revoke the session + clear the HttpOnly cookie (which
  // script can't touch). Always send credentials so the cookie is presented + cleared.
  logout:         (p) => call('student_logout', p),         // { session_token } -> { ok, clear_session_cookie }
  // "Solicitar acesso" (track-36 e): record a pending participant for the actionable admin bell.
  requestAccess:  (p) => call('student_request_access', p), // { client_slug, turma_slug, email, name? } -> { ok, requested, already_approved, blocked }
  // Single "Entrar" in-room path (track-36 c/d): 12h provisional session while the window is open.
  provisionalEnter: (p) => call('student_provisional_enter', p), // { client_slug, turma_slug, email, name?, et? } -> { ok, entered, provisional?, session_token? } | { error }

  // Fórum (Phase 8). Student face: all gated by a valid session token for the turma.
  // Notifications are computed server-side; the bell consumes forumNotifications /
  // forumMarkSeen through this same facade.
  forumListThreads: (p) => call('ct_forum_list_threads', p),  // { session_token } -> { ok, threads }
  forumGetThread:   (p) => call('ct_forum_get_thread', p),    // { session_token, thread_id } -> { ok, thread, posts }
  forumCreateThread:(p) => call('ct_forum_create_thread', p), // { session_token, title, body } -> { ok, thread }
  forumCreatePost:  (p) => call('ct_forum_create_post', p),   // { session_token, thread_id, parent_post_id?, body } -> { ok, post }
  forumEditPost:    (p) => call('ct_forum_edit_post', p),     // { session_token, post_id, body } -> { ok } | { error }
  forumNotifications:(p) => call('ct_forum_notifications', p),// { session_token } -> { ok, count, items }
  forumMarkSeen:    (p) => call('ct_forum_mark_seen', p),     // { session_token } -> { ok }

  // Device-presence (Phase 7, signal b): claim a presence grant while the turma's
  // live session is open; the device stores it and offers it at login so being in
  // the room earns access even if the student logs in later.
  presenceClaim:  (p) => call('student_presence_claim', p), // { client_slug, turma_slug } -> { ok, granted, presence_token? }

  // QR enrollment (Phase 7b). The QR projected in class carries ?et=<token>. claim
  // mints a presence grant on scan (silently kept in localStorage), so a later
  // off-window magic-link login auto-approves. Email is ALWAYS confirmed via the link.
  enrollClaim:    (p) => call('student_enroll_claim', p),    // { client_slug, turma_slug, et } -> { ok, granted, presence_token? }

  // Direct access (opt-in per turma, for the period before an email provider is wired):
  // a live QR/code + open window registers + approves on the spot, no magic link. The
  // worker gates it on the turma's direct_access flag; email is taken on trust.
  enrollJoin:     (p) => call('student_enroll_join', p),     // { client_slug, turma_slug, et, email, name? } -> { ok, session_token, ... } | { error }

  // Simple sign-up (opt-in per turma, for when no e-mail provider is usable): name + e-mail
  // registers + approves on the spot, NO OTP code and NO QR window. Gated server-side by the
  // turma's simple_enroll flag; the e-mail is taken on trust (verified later when mail works).
  simpleEnroll:   (p) => call('student_simple_enroll', p),   // { client_slug, turma_slug, email, name? } -> { ok, session_token, ... } | { error }

  // /trilha entry e-mail-only fast path (4a): resolve the e-mail to its most-recent turma; a
  // SIMPLE turma logs in on the spot (no código), anything else returns { simple:false } and
  // the caller sends the OTP code instead.
  emailEntry:     (p) => call('student_email_entry', p),     // { email } -> { ok, simple, turma? } | { error:'email_not_enrolled' }

  // Typed entry (pensoia.com/trilha/<code>): resolve the 4-digit code to the live turma
  // + et so the entry page forwards into the trilha exactly as a QR scan would. Public,
  // resolves only while the window is open (same capability + time-box as the QR).
  resolveEnrollCode: (p) => call('ct_resolve_enroll_code', p), // { code } -> { ok, found, client_slug, turma_slug, turma_token, enrollment_token } | { ok, found:false }
  // The PERMANENT turma short-code resolver (codes redesign): a 4-digit access_code OR a
  // legacy letter code (e.g. TVKV), each straight to its turma (model A). Resolves whether
  // or not a window is open; carries the et too when the window is open (auto-approve).
  resolveCode: (p) => call('ct_resolve_code', p), // { code } -> { ok, found, client_slug, turma_slug, turma_token, enrollment_token } | { ok, found:false }
  getStudentLang: () => call('ct_get_student_lang') // {} -> { ok, lang: 'pt-BR'|'en' } (the global audience language)
};

export { assetUrl };

// Fail-open classifier (track-36 a). TRUE when an error code is a TRANSIENT server/network
// hiccup that must NOT be read as "logged out" or "not approved"; the client keeps its
// current state and retries instead of walling/clearing the session (the "sumiu em minutos"
// bug). FALSE for authoritative verdicts (needs_approval, not_found, forbidden, unauthorized,
// email_not_enrolled, ...), which the caller acts on normally. The worker's own new soluço
// code is `server_busy`; the transport (worker-call.js) emits the http_5xx / network_error /
// server_returned_html / json_parse_error / body_read_error / no_fetch family; and the legacy
// generic worker crash is `Internal error`.
export function isTransientError(code) {
  if (!code) return false;
  const c = String(code);
  if (c === 'server_busy' || c === 'auth_unavailable' || c === 'Internal error') return true;
  if (c === 'network_error' || c === 'no_fetch' || c === 'server_returned_html'
      || c === 'json_parse_error' || c === 'body_read_error') return true;
  if (/^http_5\d\d$/.test(c)) return true;
  return false;
}
