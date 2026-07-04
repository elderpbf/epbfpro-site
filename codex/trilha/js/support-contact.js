// codex/trilha/js/support-contact.js
// Shared support-contact affordance for the Trail's public pages (login, código,
// bloqueado, erro screens, plus a footer strip on every page): a single source for
// the phone/e-mail + the rendered affordance, so students who get stuck (no code,
// blocked, error) always have a direct channel instead of borrowing Élder's number.
// Global config today (Élder is the sole instructor); CONFIG is a plain object so a
// future per-turma override can pass its own values without a new call shape.
import { esc } from './utils.js';
import { t } from '../i18n.js';
import { WA_ICON } from './state.js';

export const CONFIG = {
  whatsapp: '5579998014253',
  email: 'contato@pensoia.com',
};

const MAIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>';

// PURE. The pre-filled message: names the client/turma (and the student, when
// known) so Élder can triage without asking; a generic line with no trilha context.
export function supportMessage(context = {}) {
  const client = (context.client || '').trim();
  const turma = (context.turma || '').trim();
  const name = (context.studentName || '').trim();
  if (!client || !turma) return t('support.msg_generic');
  return (name ? t('support.msg_named').replace('{name}', name) : t('support.msg_context'))
    .replace('{client}', client).replace('{turma}', turma);
}

// PURE. The e-mail subject line, same context rule as the WhatsApp message.
export function supportSubject(context = {}) {
  const client = (context.client || '').trim();
  const turma = (context.turma || '').trim();
  if (!client || !turma) return t('support.mail_subject_generic');
  return t('support.mail_subject_context').replace('{client}', client).replace('{turma}', turma);
}

export function whatsAppUrl(context = {}, config = CONFIG) {
  return 'https://wa.me/' + config.whatsapp + '?text=' + encodeURIComponent(supportMessage(context));
}

export function mailtoUrl(context = {}, config = CONFIG) {
  return 'mailto:' + config.email +
    '?subject=' + encodeURIComponent(supportSubject(context)) +
    '&body=' + encodeURIComponent(supportMessage(context));
}

function linksHtml(context, config) {
  return (
    '<a class="cdx-support-link cdx-support-wa" href="' + esc(whatsAppUrl(context, config)) + '" target="_blank" rel="noopener">' +
      WA_ICON + '<span>' + esc(t('support.whatsapp')) + '</span></a>' +
    '<a class="cdx-support-link cdx-support-mail" href="' + esc(mailtoUrl(context, config)) + '">' +
      MAIL_ICON + '<span>' + esc(t('support.email')) + '</span></a>'
  );
}

// Compact strip for the footer of every Trail page.
export function footerHtml(context = {}, config = CONFIG) {
  return (
    '<div class="cdx-support-footer">' +
      '<span class="cdx-support-footer-label">' + esc(t('support.title')) + '</span>' +
      linksHtml(context, config) +
    '</div>'
  );
}

// Prominent card for the friction points: login, código, bloqueado, erro.
export function highlightHtml(context = {}, config = CONFIG) {
  return (
    '<div class="cdx-support-highlight">' +
      '<strong class="cdx-support-highlight-title">' + esc(t('support.title')) + '</strong>' +
      '<p class="cdx-support-highlight-body">' + esc(t('support.highlight_body')) + '</p>' +
      '<div class="cdx-support-highlight-links">' + linksHtml(context, config) + '</div>' +
    '</div>'
  );
}

// The context every render site derives from the SAME page-lifetime `state` singleton
// (./state.js): client/turma display names (falling back to the URL slugs before/without
// a successful fetch) plus the student's name once a session is active, so Élder can
// triage without asking who this is. One place, so callers never re-derive it by hand.
export function contextFromState(state) {
  const data = state.data || {};
  return {
    client: (data.client || {}).display_name || state.clientSlug || '',
    turma: (data.turma || {}).display_name || (data.turma || {}).name || state.turmaSlug || '',
    studentName: (data.participant || {}).display_name || (data.participant || {}).name || '',
  };
}

export function mountFooter(container, context = {}, config = CONFIG) {
  if (!container) return;
  container.innerHTML = footerHtml(context, config);
}

export function mountHighlight(container, context = {}, config = CONFIG) {
  if (!container) return;
  container.innerHTML = highlightHtml(context, config);
}
