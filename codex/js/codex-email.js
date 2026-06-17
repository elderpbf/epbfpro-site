// js/codex-email.js
// Shared Codex e-mail module. Any tab composes a message and calls sendEmail();
// it forwards through the codex-api facade (email.send -> Worker -> Resend). Keep
// the composition (subject/body) in the calling tab — this only validates lightly,
// sends, and routes failures to the debug pill (window.bsLog) with real detail.
// The backend is the ONE shared Resend transport (worker lib/email.js), so there
// is never a second integration to keep in sync.
import { email as emailApi } from './codex-api.js';

/**
 * Send one e-mail. Thin wrapper over the facade: normalizes recipients, sends,
 * and logs failures to the debug pill so nothing fails silently.
 * @param {object} msg
 * @param {string|string[]} msg.to
 * @param {string} msg.subject
 * @param {string} [msg.html]   at least one of html/text
 * @param {string} [msg.text]
 * @param {Array<{filename:string, content:string}>} [msg.attachments]  content = base64
 * @param {string} [msg.from]
 * @param {string} [msg.replyTo]
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
export async function sendEmail(msg) {
  const m = msg || {};
  const to = Array.isArray(m.to) ? m.to.filter(Boolean) : (m.to ? [m.to] : []);
  if (!to.length) return { ok: false, error: 'no recipient' };
  if (!m.subject) return { ok: false, error: 'no subject' };
  if (!m.html && !m.text) return { ok: false, error: 'empty body' };
  try {
    const res = await emailApi.send({
      to, subject: m.subject, html: m.html, text: m.text,
      attachments: m.attachments, from: m.from, replyTo: m.replyTo,
    });
    if (!res || res.error) {
      const detail = (res && res.error) || 'unknown error';
      if (window.bsLog) window.bsLog('email: send failed: ' + detail, 'error');
      return { ok: false, error: detail };
    }
    return { ok: true, id: res.id };
  } catch (e) {
    const detail = (e && e.message) || String(e);
    if (window.bsLog) window.bsLog('email: send threw: ' + detail, 'error');
    return { ok: false, error: detail };
  }
}

/**
 * Build a Resend attachment from raw base64 bytes (e.g. a generated PDF).
 * @param {string} filename
 * @param {string} base64  raw base64 (no data: prefix)
 * @returns {{filename:string, content:string}}
 */
export function attachmentFromBase64(filename, base64) {
  return { filename, content: base64 };
}

// ── Shared branded e-mail layout ────────────────────────────────────────────────
// The ONE visual shell every Codex e-mail wraps its content in, so cert delivery,
// the magic-link login, and anything future all look like the same product. Built
// for the lowest common denominator of e-mail clients (Gmail/Outlook): table-based
// layout, fully inline styles, NO external CSS, NO SVG (both are stripped). The
// PensoIA lockup is a TEXT wordmark (white "penso" + teal "IA"), so it renders even
// when a client blocks remote images — no hosted logo to keep in sync.
const BRAND = { navy: '#061a51', teal: '#14b8a6', ink: '#1a2433', mut: '#6b7787', line: '#e6eaf0', bg: '#f4f6f9' };

/** The PensoIA text wordmark for the dark header band. */
function emailWordmark() {
  return '<span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;' +
    'letter-spacing:-.5px;color:#ffffff;line-height:1">penso<span style="color:' + BRAND.teal + '">IA</span></span>';
}

/**
 * Wrap message content in the branded PensoIA shell (header band + white card +
 * footer). The caller supplies only the inner body; everything else is consistent.
 * @param {object} opts
 * @param {string} [opts.heading]    bold title at the top of the card
 * @param {string} opts.bodyHtml     the message body (already-escaped HTML)
 * @param {{label:string, url:string}} [opts.cta]  optional primary button
 * @param {string} [opts.footerHtml] small print under the card (defaults to the brand line)
 * @param {string} [opts.preheader]  hidden inbox-preview snippet
 * @returns {string} a complete, e-mail-client-safe HTML document body
 */
export function renderEmailHtml(opts) {
  const o = opts || {};
  const heading = o.heading
    ? '<tr><td style="padding:0 0 14px"><h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:20px;font-weight:700;color:' + BRAND.navy + ';line-height:1.3">' + o.heading + '</h1></td></tr>'
    : '';
  const cta = (o.cta && o.cta.url && o.cta.label)
    ? '<tr><td style="padding:22px 0 6px"><a href="' + o.cta.url + '" style="display:inline-block;' +
      'background:' + BRAND.teal + ';color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:15px;font-weight:700;padding:12px 26px;border-radius:8px">' + o.cta.label + '</a></td></tr>'
    : '';
  const footer = o.footerHtml || ('PensoIA · <a href="https://pensoia.com" style="color:' + BRAND.mut + '">pensoia.com</a>');
  const preheader = o.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + o.preheader + '</div>'
    : '';
  return '' +
    preheader +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="background:' + BRAND.bg + ';margin:0;padding:0"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ' +
        'style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;' +
        'border:1px solid ' + BRAND.line + '">' +
        // Header band
        '<tr><td style="background:' + BRAND.navy + ';padding:26px 32px" align="left">' + emailWordmark() + '</td></tr>' +
        // Accent rule
        '<tr><td style="height:3px;background:' + BRAND.teal + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
        // Body card
        '<tr><td style="padding:30px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
          'color:' + BRAND.ink + ';line-height:1.65">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
            heading +
            '<tr><td>' + (o.bodyHtml || '') + '</td></tr>' +
            cta +
          '</table>' +
        '</td></tr>' +
        // Footer
        '<tr><td style="padding:22px 32px 28px;border-top:1px solid ' + BRAND.line + ';' +
          'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:' + BRAND.mut + ';line-height:1.6">' +
          footer +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table>';
}
