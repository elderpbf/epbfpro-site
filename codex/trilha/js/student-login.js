// codex/trilha/js/student-login.js
// The Trail login flow as pure logic over an injected facade + session. The
// renderers (the wall, the modal, the entry page) are thin and drive this
// controller, so the whole state machine is unit-testable without a DOM:
//   anonymous -> email -> code -> verifying -> profile? -> authenticated
//                                          \-> hub (turma-agnostic entry page)
// E-mail auth is a 4-letter OTP code (the magic link is retired): one verify
// exchanges (email, code) for a session PER TURMA the address belongs to, so a
// single sign-in remembers every turma on this device. Self-registration and
// login are the SAME flow: verify finds-or-creates the participation worker-side.
// CPF is never collected here (deferred to cert claim).
import { trail } from './api.js';
import * as defaultSession from './student-session.js';

// LGPD data controller (the legally responsible entity behind PensoIA). Exported
// so the consent notice and the worker payload reference one source of truth; the
// notice TEXT lives in i18n (login.consent_notice) and is pinned to carry these.
export const CONTROLLER = 'EPBF Soluções em Tecnologia Ltda';
export const CONTROLLER_CNPJ = '65.254.064/0001-64';
export const CONTROLLER_CONTACT = 'contato@pensoia.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PURE. Trim + lowercase a candidate email; return the normalized form or null.
export function validateEmail(raw) {
  if (raw == null) return null;
  const e = String(raw).trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

// PURE. Find the turma entry matching (client, turma) in an OTP-verify turma list.
export function pickTurma(turmas, client, turma) {
  return (Array.isArray(turmas) ? turmas : []).find(
    (e) => e && e.client_slug === client && e.turma_slug === turma,
  ) || null;
}

// PURE. The post-verify state for the bound turma entry: a missing entry (the bound
// turma was not in the list) is an error; an unconsented participation needs the
// profile step; otherwise the session is live and the student is authenticated.
export function nextStateForTurma(entry) {
  if (!entry) return 'error';
  return entry.needs_profile ? 'profile' : 'authenticated';
}

// PURE control flow. If the student is logged in, proceed immediately; otherwise
// open the login UI, handing it the `proceed` continuation so a successful login
// resumes the original action (e.g. opening the tarefa modal).
export function gate(loggedIn, openLogin, proceed) {
  if (loggedIn) proceed();
  else openLogin(proceed);
}

// PURE. The createLoginFlow options a renderer derives from its own opts plus the
// page origin. Extracted so the pass-through (client / turma / k / origin / presence
// / enrollToken) is unit-tested; the renderer DOM is only verified on staging.
export function flowOptsFrom(opts, origin) {
  return {
    client: opts.client,
    turma: opts.turma,
    k: opts.k,
    origin,
    presence: opts.presence,
    enrollToken: opts.enrollToken,
    api: opts.api,
    session: opts.session,
  };
}

// callWorker (worker-call.js) THROWS on any { error } response, so a bare `await api.x()`
// below would reject and leave the calling UI hung (the wall/entry "Enviando..." button
// never settles). Normalize a thrown worker error back into the { error } shape every
// branch here already handles. The error itself was already logged by callWorker.
async function safeCall(promise) {
  try { return await promise; }
  catch (e) {
    // Keep the whole worker payload (error + extras like retry_after_seconds), not just
    // the code, so the UI can say "aguarde ~X min" on a rate-limit.
    if (e && e.data && typeof e.data === 'object') return e.data;
    return { error: (e && e.message) || 'error' };
  }
}

// Server-side logout (track-36 d). The session cookie is HttpOnly, so clearing it needs a
// server round-trip, dropping the local token alone leaves the cookie authenticating the
// next request (the iOS-persistence path). The ONE server call lives here so every logout
// path (the awaited helper below + the flow's own logout) shares it and can never drift.
// Best-effort: it awaits, then swallows any failure INTERNALLY (so a fire-and-forget caller
// never triggers an unhandledrejection), because a network blip must not trap a student who
// tapped "Sair". Returns a promise a caller may await (page.js awaits so the cookie is gone
// before it reloads) or ignore (the flow clears local state immediately, server in the bg).
async function serverLogout(token, api) {
  if (!token) return;
  try { await api.logout({ session_token: token }); } catch (_) { /* best-effort */ }
}

// The awaited logout used by the header (login pill + settings box): revoke + clear the
// cookie server-side, THEN drop the local token, so a caller that awaits knows the cookie is
// cleared before it reloads. Shared so the two header sites never drift.
export async function logoutStudent(client, turma, opts = {}) {
  const api = opts.api || trail;
  const sess = opts.session || defaultSession;
  await serverLogout(sess.getToken(client, turma), api);
  sess.clearToken(client, turma);
}

// Build a login flow. `client`/`turma` BIND it to one turma (the wall + the inline
// gate + the modal): verify lands the student authenticated on that turma. OMITTING
// them makes the flow turma-agnostic (the /trilha entry page): verify lands on the
// `hub` with the full turma list. `api` + `session` are injectable for tests.
export function createLoginFlow(opts = {}) {
  const api = opts.api || trail;
  const sess = opts.session || defaultSession;
  const client = opts.client;
  const turma = opts.turma;
  const presence = opts.presence; // device-presence grant (signal b), offered at verify
  const enrollToken = opts.enrollToken; // QR enrollment token; direct-access join uses it

  const flow = {
    state: 'anonymous',
    error: null,
    retryAfter: null,     // seconds to wait after a rate-limit / resend cooldown
    codeStillValid: false, // the prior code is still good — reused, no new e-mail sent
    email: null,
    devCode: null,        // the on-screen code when no e-mail provider is wired (staging)
    turmas: null,         // the verify turma list (the hub on the entry page)
    participantId: null,
    pollToken: null,      // track-36 d: the cross-device poll handle for the single "Entrar"
    devMagicToken: null,  // dev/staging (no e-mail provider): the emailed token, surfaced to finish the flow

    isAuthenticated() { return sess.isLoggedIn(client, turma); },

    // Step 1: send a 4-letter OTP code to the e-mail. Turma-agnostic (the code proves
    // the address, not a turma), so only the email travels.
    async requestCode(rawEmail, opts = {}) {
      this.error = null;
      this.retryAfter = null;
      this.codeStillValid = false;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      this.email = email;
      // Bound flow (the wall) REGISTERS into the named turma, so it sends the turma context
      // and the code is always issued. The unbound entry page sets require_enrolled, so the
      // worker rejects an address that belongs to no turma (email_not_enrolled) BEFORE
      // sending a code — the "no turma" check happens at e-mail submit, not after verify.
      const reqParams = { email, ask_name: true };
      if (opts.resend) reqParams.resend = true;
      // Carry the typed name so the worker's save-on-submit persists the REAL name (not the
      // e-mail as a placeholder) the instant the code is requested. Only meaningful on the
      // bound/wall path (it needs the turma); the agnostic entry has no slugs and ignores it.
      if (opts.name) reqParams.name = String(opts.name).trim();
      if (client && turma) { reqParams.client_slug = client; reqParams.turma_slug = turma; }
      else { reqParams.require_enrolled = true; }
      const res = await safeCall(api.otpRequest(reqParams));
      if (!res || !res.ok) { this.state = 'email'; this.error = (res && res.error) || 'error'; this.retryAfter = (res && res.retry_after_seconds) || null; return this; }
      // Convergence with the magic flow: a brand-new e-mail is asked for the name inline BEFORE
      // the code is sent (the wall reveals the name field), exactly like entrar's needName step.
      if (res.needs_name) { this.state = 'needName'; return this; }
      // Cooldown hit on an explicit resend: stay on the code step and surface the countdown.
      if (res.throttled) { this.retryAfter = res.retry_after_seconds || null; this.state = 'code'; return this; }
      // The previous code is still valid: reuse it — keep the on-screen dev code (don't null it).
      if (res.code_still_valid) { this.codeStillValid = true; this.state = 'code'; return this; }
      if (res.dev_otp_code) this.devCode = res.dev_otp_code; // only overwrite when a NEW code was minted
      this.state = 'code';
      return this;
    },

    // Step 2: exchange (email, code) for sessions. The worker returns one entry per
    // turma the address belongs to; we persist a session for EACH (localStorage-first:
    // one verify remembers every turma here). Bound -> land authenticated on this turma
    // (profile step if not yet consented); unbound -> land on the hub with the list.
    async verifyCode(rawCode) {
      this.error = null;
      this.state = 'verifying';
      const payload = { email: this.email, code: String(rawCode || '').trim() };
      if (client) payload.client_slug = client;
      if (turma) payload.turma_slug = turma;
      if (presence) payload.presence_token = presence;
      // Carry the QR/código enrollment token so the worker can approve via the
      // inscription window (signal a): a student who arrived with the class código is
      // approved on sign-up instead of landing pending.
      if (enrollToken) payload.et = enrollToken;
      const res = await safeCall(api.otpVerify(payload));
      if (!res || !res.ok) { this.state = 'code'; this.error = (res && res.error) || 'invalid_code'; return this; }
      const turmas = Array.isArray(res.turmas) ? res.turmas : [];
      this.turmas = turmas;
      for (const tt of turmas) {
        if (!tt) continue;
        if (tt.session_token) sess.setToken(tt.client_slug, tt.turma_slug, tt.session_token);
        if (typeof sess.rememberTurma === 'function') sess.rememberTurma(tt); // populate the /trilha hub
      }
      if (client && turma) {
        const entry = pickTurma(turmas, client, turma);
        this.participantId = entry && entry.participant_id != null ? entry.participant_id : null;
        this.state = nextStateForTurma(entry);
      } else {
        this.state = 'hub';
      }
      return this;
    },

    // Direct-access in-class join (opt-in turma, no email round-trip). A live QR/code +
    // open window mints an approved session on the spot. Mirrors verifyCode's tail.
    async enrollJoin(rawEmail, name) {
      this.error = null;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      const payload = { client_slug: client, turma_slug: turma, et: enrollToken, email };
      const cleanName = (name || '').trim();
      if (cleanName) payload.name = cleanName;
      const res = await safeCall(api.enrollJoin(payload));
      if (!res || !res.ok || !res.session_token) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      sess.setToken(client, turma, res.session_token);
      this.participantId = res.participant_id != null ? res.participant_id : null;
      this.state = res.needs_profile ? 'profile' : 'authenticated';
      return this;
    },

    // Simple-enroll login (turma flag `simple_enroll` ON): name + e-mail register + grant
    // access ON THE SPOT (8h session), no code round-trip. Mirrors enrollJoin's tail but uses
    // the student_simple_enroll action and needs no QR/código token. So when the turma runs
    // in simple mode, EVERY entry surface (wall AND the "Entrar" pill modal) is e-mail-only.
    async simpleEnroll(rawEmail, name) {
      this.error = null;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      const payload = { client_slug: client, turma_slug: turma, email };
      const cleanName = (name || '').trim();
      if (cleanName) payload.name = cleanName;
      const res = await safeCall(api.simpleEnroll(payload));
      if (!res || !res.ok || !res.session_token) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      sess.setToken(client, turma, res.session_token);
      this.participantId = res.participant_id != null ? res.participant_id : null;
      this.state = res.needs_profile ? 'profile' : 'authenticated';
      return this;
    },

    // ── track-36 single "Entrar" (the one screen, e-mail-first) ─────────────────
    // One method drives the whole entry. In-room (a live window + código/QR token) mints
    // IMMEDIATE provisional access (12h), zero e-mail wait. Off-window, it sends the 15-min
    // validation link and gets a poll_token so THIS device can watch for the click (the laptop
    // unlocks when the phone clicks). A brand-new e-mail with no name yet stops at 'needName' so
    // the screen reveals the name field inline BEFORE anything is created.
    async entrar(rawEmail, name) {
      this.error = null;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      this.email = email;
      const cleanName = (name || '').trim();
      // In-room first: a live window grants provisional access on the spot (approval via the
      // window; validation deferred to the 3-day e-mail the worker fires). No poll needed.
      if (enrollToken) {
        const pe = await safeCall(api.provisionalEnter({ client_slug: client, turma_slug: turma, email, name: cleanName, et: enrollToken, ask_name: true, k: opts.k, origin: opts.origin }));
        if (pe && pe.ok && pe.entered && pe.session_token) {
          sess.setToken(client, turma, pe.session_token);
          this.participantId = pe.participant_id != null ? pe.participant_id : null;
          this.state = pe.needs_profile ? 'profile' : 'authenticated';
          return this;
        }
        // A NEW e-mail (no name yet) is asked for the name inline BEFORE it enters, even in-room.
        if (pe && pe.needs_name) { this.state = 'needName'; return this; }
        // A blocked student can't force in; surface it. Otherwise (window closed) fall through.
        if (pe && pe.error === 'access_blocked') { this.state = 'email'; this.error = 'access_blocked'; return this; }
      }
      // Off-window: send the validation link + get the poll handle. ask_name reveals the name
      // field for a NEW address before creating the participant.
      const res = await safeCall(api.authRequest({ client_slug: client, turma_slug: turma, email, name: cleanName, ask_name: true, k: opts.k, origin: opts.origin }));
      if (!res || !res.ok) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      if (res.needs_name) { this.state = 'needName'; return this; }
      this.pollToken = res.poll_token || null;
      this.devMagicToken = res.dev_magic_token || null; // staging only (no provider)
      this.state = 'validating';
      return this;
    },

    // One validation-poll tick (track-36 d). Before the emailed link is clicked it stays
    // 'validating'. Once clicked (the e-mail is proven, maybe on another device), the worker
    // hands THIS device a session: 'approved' → authenticated (caller reloads), 'pending' →
    // 'pendingApproval' (validated, waiting on the instructor's e-sino approval).
    async pollValidation() {
      if (!this.pollToken) return this;
      const res = await safeCall(api.authPoll({ poll_token: this.pollToken, _silent: true }));
      if (!res || !res.ok || res.status === 'waiting') return this; // keep waiting (incl. transient errors)
      if (res.session_token) {
        sess.setToken(client, turma, res.session_token);
        this.participantId = res.participant_id != null ? res.participant_id : null;
      }
      this.state = res.status === 'approved' ? 'authenticated' : 'pendingApproval';
      return this;
    },

    // Poll after 'pendingApproval': the student is validated but not yet approved. Watch the
    // live access_status (via the session minted at validation) until the instructor approves in
    // the e-sino, then unlock. No "validate now" wall — validation already happened.
    async pollApproval() {
      const token = sess.getToken(client, turma);
      if (!token) return this;
      const res = await safeCall(api.sessionCheck({ session_token: token, _silent: true }));
      if (!res || !res.ok) return this;
      if (res.access_status === 'approved') this.state = 'authenticated';
      return this;
    },

    async saveProfile(displayName, consent) {
      this.error = null;
      if (!consent) { this.error = 'consent_required'; return this; }
      const res = await safeCall(api.profileSave({
        session_token: sess.getToken(client, turma),
        display_name: (displayName || '').trim(),
        consent: true,
        consent_version: sess.CONSENT_VERSION,
      }));
      if (!res || !res.ok) { this.error = (res && res.error) || 'error'; return this; }
      this.state = 'authenticated';
      return this;
    },

    logout() {
      // Clear local state immediately (sync) so the UI updates now, and fire the SHARED server
      // logout in the background (serverLogout swallows its own rejection, so this unawaited call
      // is safe). Capture the token BEFORE clearing so the server still gets it.
      const token = sess.getToken(client, turma);
      sess.clearToken(client, turma);
      serverLogout(token, api);
      this.state = 'anonymous';
      this.error = null;
      this.devCode = null;
      this.turmas = null;
      this.participantId = null;
    },
  };

  if (flow.isAuthenticated()) flow.state = 'authenticated';
  return flow;
}
