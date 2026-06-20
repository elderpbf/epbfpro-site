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
    email: null,
    devCode: null,        // the on-screen code when no e-mail provider is wired (staging)
    turmas: null,         // the verify turma list (the hub on the entry page)
    participantId: null,

    isAuthenticated() { return sess.isLoggedIn(client, turma); },

    // Step 1: send a 4-letter OTP code to the e-mail. Turma-agnostic (the code proves
    // the address, not a turma), so only the email travels.
    async requestCode(rawEmail) {
      this.error = null;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      this.email = email;
      // Bound flow (the wall) REGISTERS into the named turma, so it sends the turma context
      // and the code is always issued. The unbound entry page sets require_enrolled, so the
      // worker rejects an address that belongs to no turma (email_not_enrolled) BEFORE
      // sending a code — the "no turma" check happens at e-mail submit, not after verify.
      const reqParams = { email };
      if (client && turma) { reqParams.client_slug = client; reqParams.turma_slug = turma; }
      else { reqParams.require_enrolled = true; }
      const res = await api.otpRequest(reqParams);
      if (!res || !res.ok) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      this.devCode = res.dev_otp_code || null;
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
      const res = await api.otpVerify(payload);
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
      const res = await api.enrollJoin(payload);
      if (!res || !res.ok || !res.session_token) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      sess.setToken(client, turma, res.session_token);
      this.participantId = res.participant_id != null ? res.participant_id : null;
      this.state = res.needs_profile ? 'profile' : 'authenticated';
      return this;
    },

    async saveProfile(displayName, consent) {
      this.error = null;
      if (!consent) { this.error = 'consent_required'; return this; }
      const res = await api.profileSave({
        session_token: sess.getToken(client, turma),
        display_name: (displayName || '').trim(),
        consent: true,
        consent_version: sess.CONSENT_VERSION,
      });
      if (!res || !res.ok) { this.error = (res && res.error) || 'error'; return this; }
      this.state = 'authenticated';
      return this;
    },

    logout() {
      sess.clearToken(client, turma);
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
