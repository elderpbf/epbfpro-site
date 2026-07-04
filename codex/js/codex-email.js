// js/codex-email.js
// Shared Codex e-mail module. Any tab composes a message and calls sendEmail();
// it forwards through the codex-api facade (email.send -> Worker -> Resend). Keep
// the composition (subject/body) in the calling tab — this only validates lightly,
// sends, and routes failures to the debug pill (window.bsLog) with real detail.
// The backend is the ONE shared Resend transport (worker lib/email.js), so there
// is never a second integration to keep in sync.
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.bsLog (debug pill, backstage/js/debug.js)
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
// layout, fully inline styles, NO external CSS, NO SVG (clients strip SVG). The
// PensoIA lockup is a hosted raster PNG (the real brand artwork, white wordmark +
// teal accent, transparent) so it sits on the navy->teal header gradient.
const BRAND = { navy: '#061a51', teal: '#14b8a6', tealDk: '#0d9488', ink: '#1a2433', mut: '#8a93a1', page: '#eef1f6' };
// Absolute, publicly-reachable logo (e-mail can't use relative paths). Callers may
// override (e.g. point at staging while testing) via opts.logoUrl.
const DEFAULT_LOGO_URL = 'https://pensoia.com/images/brand/email-logo.png?v=2';

// The Content-ID for the INLINE logo attachment. Preferred over a hosted URL: an
// inline (cid) image renders without the client fetching an external URL, which
// Gmail's image proxy was caching/refusing for the hosted logo. See loadLogoAttachment.
export const LOGO_CID = 'pensoia-logo';

/**
 * Build the inline logo attachment (the real brand PNG, base64) so the e-mail logo
 * is embedded, not fetched. Returns a Resend-style inline attachment, or null if the
 * asset can't be read (caller then falls back to the hosted URL). Browser only.
 * @param {string} [origin]  base origin to read the asset from (defaults to location.origin)
 * @returns {Promise<{filename:string, content:string, content_id:string, content_type:string}|null>}
 */
export async function loadLogoAttachment(origin) {
  try {
    if (typeof fetch !== 'function') return null;
    const base = origin || (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
    const resp = await fetch(base + '/images/brand/email-logo.png');
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    // fallbackUrl: the hosted logo, used by providers WITHOUT inline (cid) support
    // (Brevo transactional). Resend renders the inline attachment; the worker swaps
    // cid: -> fallbackUrl for Brevo. So the same e-mail works on both providers.
    return { filename: 'pensoia-logo.png', content: btoa(binary), content_id: LOGO_CID, content_type: 'image/png', fallbackUrl: DEFAULT_LOGO_URL };
  } catch (_) {
    return null;
  }
}

/**
 * Wrap message content in the branded PensoIA shell (gradient header with the real
 * logo + an optional seal, a rounded white card, a centered pill CTA, footer). The
 * caller supplies only the inner body; everything else is consistent across e-mails.
 * @param {object} opts
 * @param {string} [opts.heading]    bold title at the top of the card (centered)
 * @param {string} opts.bodyHtml     the message body (already-escaped HTML)
 * @param {{label:string, url:string}} [opts.cta]  optional primary button (centered pill)
 * @param {boolean} [opts.badge]     show the celebratory check seal under the logo
 * @param {string} [opts.logoCid]    inline logo Content-ID (rendered as src="cid:…", preferred)
 * @param {string} [opts.logoUrl]    hosted logo URL fallback (used when no logoCid)
 * @param {string} [opts.footerHtml] small print under the card (defaults to the brand line)
 * @param {string} [opts.preheader]  hidden inbox-preview snippet
 * @returns {string} a complete, e-mail-client-safe HTML document body
 */
export function renderEmailHtml(opts) {
  const o = opts || {};
  // Prefer the inline (cid) logo — it doesn't depend on the client fetching a URL.
  // Falls back to the hosted URL when no inline attachment is available.
  const logo = o.logoCid ? ('cid:' + o.logoCid) : (o.logoUrl || DEFAULT_LOGO_URL);
  const badge = o.badge
    ? '<div style="margin-top:18px"><span style="display:inline-block;width:54px;height:54px;line-height:54px;' +
      'border-radius:50%;background:rgba(255,255,255,.16);color:#ffffff;font-size:27px;' +
      'font-family:Arial,Helvetica,sans-serif">&#10003;</span></div>'
    : '';
  const heading = o.heading
    ? '<h1 style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;' +
      'color:' + BRAND.navy + ';line-height:1.3">' + o.heading + '</h1>'
    : '';
  const cta = (o.cta && o.cta.url && o.cta.label)
    ? '<div style="padding:6px 0 4px"><a href="' + o.cta.url + '" style="display:inline-block;' +
      'background:' + BRAND.teal + ';color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:15px;font-weight:700;padding:13px 34px;border-radius:999px">' + o.cta.label + '</a></div>'
    : '';
  const footer = o.footerHtml || ('PensoIA · <a href="https://pensoia.com" style="color:' + BRAND.mut + '">pensoia.com</a>');
  const preheader = o.preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + o.preheader + '</div>'
    : '';
  return '' +
    preheader +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="background:' + BRAND.page + ';margin:0;padding:0"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ' +
        'style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;' +
        'box-shadow:0 6px 24px rgba(6,26,81,.12)">' +
        // Gradient header band with the real logo (+ optional seal)
        '<tr><td align="center" style="background:' + BRAND.navy + ';' +
          'background-image:linear-gradient(135deg,' + BRAND.navy + ' 0%,' + BRAND.tealDk + ' 140%);padding:30px 32px 28px">' +
          '<img src="' + logo + '" alt="PensoIA" width="190" height="69" ' +
            'style="display:inline-block;width:190px;max-width:62%;height:auto;border:0;outline:none;text-decoration:none">' +
          badge +
        '</td></tr>' +
        // Body card (centered)
        '<tr><td align="center" style="padding:30px 36px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
          'color:' + BRAND.ink + ';line-height:1.65">' +
          heading +
          (o.bodyHtml || '') +
          cta +
        '</td></tr>' +
        // Footer
        '<tr><td align="center" style="padding:22px 32px 28px;' +
          'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:' + BRAND.mut + ';line-height:1.6">' +
          footer +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table>';
}
