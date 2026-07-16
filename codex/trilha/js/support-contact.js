// codex/trilha/js/support-contact.js
// The single support-entry affordance for the Trail: it renders the consistent
// "Precisa de ajuda?" pill (shared /css/support-entry.css, `psup-` namespace) that
// links to /suporte — the ONE hub with channels + FAQ. It carries the origin
// (`source`) + live context (client·turma·nome) so /suporte pre-fills the WhatsApp/
// e-mail message for this exact student. No inline channels here: one consistent
// entry across every page beats a different affordance per screen (Élder 2026-07-08).
import { esc } from './utils.js';
import { t } from '../i18n.js';

export const SUPPORT_PAGE = '/suporte.html';

const HELP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

// The /suporte URL carrying the origin + any live trilha context (URL-encoded).
export function supportUrl(context = {}, source = '') {
  const p = new URLSearchParams();
  if (source) p.set('source', source);
  const client = (context.client || '').trim();
  const turma = (context.turma || '').trim();
  const name = (context.studentName || '').trim();
  if (client) p.set('client', client);
  if (turma) p.set('turma', turma);
  if (name) p.set('nome', name);
  const qs = p.toString();
  return SUPPORT_PAGE + (qs ? '?' + qs : '');
}

// PURE. The consistent entry pill markup, identical on every screen.
export function entryHtml(context = {}, source = '') {
  return '<div class="psup-slot"><a class="psup-entry" href="' + esc(supportUrl(context, source)) + '">' +
    HELP_ICON + '<span>' + esc(t('support.title')) + '</span></a></div>';
}

// The context derived from the page-lifetime `state` singleton: client/turma display
// names (falling back to the URL slugs before/without a fetch) plus the student's
// name once a session is active, so /suporte can greet Élder with who this is.
export function contextFromState(state) {
  const data = state.data || {};
  return {
    client: (data.client || {}).display_name || state.clientSlug || '',
    turma: (data.turma || {}).display_name || (data.turma || {}).name || state.turmaSlug || '',
    studentName: (data.participant || {}).name || '',
  };
}

export function mountEntry(container, context = {}, source = '') {
  if (!container) return;
  container.innerHTML = entryHtml(context, source);
}
