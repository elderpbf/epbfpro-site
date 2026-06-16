// codex/trilha/js/student-login.js
// The Trail login flow as pure logic over an injected facade + session. The
// modal (student-login-modal.js) is a thin renderer that drives this controller,
// so the whole state machine is unit-testable without a DOM:
//   anonymous -> email -> sent -> (magic link) -> verifying -> profile? -> authenticated
// Self-registration and login are the SAME flow: requestLink finds-or-creates the
// participant worker-side. CPF is never collected here (deferred to cert claim).
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

// PURE. Decide the post-verify state from the worker's authVerify result.
export function nextStateAfterVerify(res) {
  if (!res || !res.ok || !res.session_token) return 'error';
  return res.needs_profile ? 'profile' : 'authenticated';
}

// PURE control flow. If the student is logged in, proceed immediately; otherwise
// open the login UI, handing it the `proceed` continuation so a successful login
// resumes the original action (e.g. opening the tarefa modal).
export function gate(loggedIn, openLogin, proceed) {
  if (loggedIn) proceed();
  else openLogin(proceed);
}

// Build a login flow bound to one turma. `api` + `session` are injectable for
// tests; in the app they default to the real Trail facade + session module.
export function createLoginFlow(opts = {}) {
  const api = opts.api || trail;
  const sess = opts.session || defaultSession;
  const client = opts.client;
  const turma = opts.turma;
  const k = opts.k; // the turma access token, echoed into the magic-link return URL

  const flow = {
    state: 'anonymous',
    error: null,
    devToken: null,
    participantId: null,

    isAuthenticated() { return sess.isLoggedIn(client, turma); },

    async requestLink(rawEmail) {
      this.error = null;
      const email = validateEmail(rawEmail);
      if (!email) { this.state = 'email'; this.error = 'email_invalid'; return this; }
      const payload = { client_slug: client, turma_slug: turma, email };
      if (k) payload.k = k;
      const res = await api.authRequest(payload);
      if (!res || !res.ok) { this.state = 'email'; this.error = (res && res.error) || 'error'; return this; }
      this.devToken = res.dev_magic_token || null;
      this.state = 'sent';
      return this;
    },

    async verify(token) {
      this.error = null;
      this.state = 'verifying';
      const res = await api.authVerify({ token });
      const next = nextStateAfterVerify(res);
      if (next === 'error') { this.state = 'error'; this.error = (res && res.error) || 'invalid_token'; return this; }
      sess.setToken(client, turma, res.session_token);
      this.participantId = res.participant_id != null ? res.participant_id : null;
      this.state = next;
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
      this.devToken = null;
      this.participantId = null;
    },
  };

  if (flow.isAuthenticated()) flow.state = 'authenticated';
  return flow;
}
