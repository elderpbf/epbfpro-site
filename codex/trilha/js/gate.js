// codex/trilha/js/gate.js
// The inline content gate's DOM glue, shared by the aula sub-cards (sub.js) and the
// flat cards (flat.js) so the login-vs-pending branch lives in ONE place. The pure
// decision is access.js#gateAction; this maps it to either opening the login modal
// (carrying the device-presence grant) or rendering the "pending approval" notice.
// Verified on staging; the decision it wraps is unit-tested in trilha-access.test.
import { state } from './state.js';
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { gateAction } from './access.js';
import { LOGIN_ENABLED, getPresence } from './student-session.js';
import { openLoginModal } from './student-login-modal.js';

// Open the Trail login modal for the current turma, then reload on success so the
// now-approved session unlocks content (a gated turma's content is withheld
// server-side until approval, so a reload is the simplest correct refresh).
export function openTrailLogin() {
  openLoginModal({
    client: state.clientSlug,
    turma: state.turmaSlug,
    k: state.token,
    presence: getPresence(state.clientSlug, state.turmaSlug),
    onAuthenticated: () => {
      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    },
  });
}

// The pending-approval notice markup (shared copy; each card type mounts it in its
// own expand slot).
export function pendingNoticeHtml() {
  return '<div class="cdx-tr-gate-pending">' +
    '<strong>' + esc(t('login.pending_title')) + '</strong>' +
    '<p>' + esc(t('login.pending_body')) + '</p>' +
    '</div>';
}

// Intercept an item-open on a gated turma. Returns true when the open was handled
// by the gate (the caller must then stop). `mountNotice(html)` lets each card type
// render the pending notice where its content would have gone.
export function interceptItemOpen(mountNotice) {
  if (!LOGIN_ENABLED) return false;
  const action = gateAction((state.data || {}).access);
  if (action === 'none') return false;
  if (action === 'pending') {
    if (typeof mountNotice === 'function') mountNotice(pendingNoticeHtml());
    return true;
  }
  openTrailLogin(); // 'login' (anonymous)
  return true;
}
