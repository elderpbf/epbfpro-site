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
