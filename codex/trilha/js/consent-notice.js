// codex/trilha/js/consent-notice.js
// The LGPD consent disclosure as a lean one-liner + the full notice collapsed behind
// it (Élder 2026-07-08: keep the register screen clean; the person opens the detail
// only if they want). ONE helper, reused by the OTP wall, the simple-enroll wall and
// the login modal, so the copy and the shape stay identical on every screen.
import { esc } from './utils.js';
import { t } from '../i18n.js';

export function consentNoticeHtml() {
  return (
    '<details class="cdx-consent">' +
      '<summary class="cdx-consent-lead">' + esc(t('login.consent_lead')) +
        ' <span class="cdx-consent-more">' + esc(t('login.consent_more')) + '</span></summary>' +
      '<p class="cdx-consent-full">' + esc(t('login.consent_notice')) + '</p>' +
    '</details>'
  );
}
