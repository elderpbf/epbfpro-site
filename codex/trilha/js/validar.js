// codex/trilha/js/validar.js
// Public certificate-validation face (cdx-). Renders the /trilha/validar page:
// reads ?code= (or shows a manual entry form), calls the Trail facade's
// cert_validate, and renders the valid / revoked / not-found / error states.
//
// Architecture: native ES module, mount(root, ctx) / unmount(). The DOM-free view
// logic (certView / validateCode / fmtDate / getCode) is unit-tested; the DOM
// mapping (innerHTML templates) is verified visually on staging. Backend ONLY via
// the Trail facade; never raw callWorker.
import { trail } from './api.js';
import { t as defaultT } from '../i18n.js';

// ── pure helpers (unit-tested) ─────────────────────────────────────────────

// "yyyy-mm-dd" -> "d/m/yyyy" (leading zeros stripped); '' for falsy/short.
export function fmtDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  if (p.length < 3) return String(iso);
  return p[2].replace(/^0/, '') + '/' + p[1].replace(/^0/, '') + '/' + p[0];
}

// The certificate code, from ?code= OR the clean path /validar/<code> (the
// .htaccess rewrite of /trilha/validar/<code> leaves the code in the PATH, not
// the browser's query string, so both forms must be read).
export function getCode(search, pathname) {
  const q = (new URLSearchParams(search || '').get('code') || '').trim();
  if (q) return q;
  const m = String(pathname || '').match(/\/validar\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

// cert -> view-model. All status/format/pdf-gating logic lives here, DOM-free:
// revoked status drives the badge AND suppresses the PDF (even if a url exists).
export function certView(cert, t = defaultT) {
  const revoked = cert.status === 'revoked';
  return {
    revoked,
    badge: revoked
      ? { kind: 'revoked', icon: '✗', label: t('cert.revoked') }
      : { kind: 'valid',   icon: '✓', label: t('cert.valid') },
    fields: {
      holder: cert.holder_name  || '',
      course: cert.course_title || '',
      hours:  cert.hours != null ? cert.hours + 'h' : '—',
      issued: fmtDate(cert.issued_on),
      issuer: cert.issuer || '',
    },
    pdf: (cert.pdf_url && !revoked) ? { show: true, href: cert.pdf_url } : { show: false, href: '' },
  };
}

// code -> resolved page state (DOM-free; the facade is injectable so tests stub it).
export async function validateCode(api, code, t = defaultT) {
  try {
    const res = await api.validateCert({ code });
    if (!res || !res.ok) return { state: 'error', msg: t('cert.not_found') };
    return { state: 'result', view: certView(res.certificate || res, t) };
  } catch (_) {
    return { state: 'error', msg: t('cert.net_error') };
  }
}

// ── DOM rendering (verified on staging) ────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadingHtml(t) {
  return `<div class="cdx-cert-loading"><div class="cdx-spinner"></div>${esc(t('cert.checking'))}</div>`;
}

function entryHtml(t) {
  return `<div class="cdx-cert-entry">
  <div class="cdx-cert-entry-icon">\u{1F3C5}</div>
  <h1 class="cdx-cert-entry-title">${esc(t('cert.entry_title'))}</h1>
  <p class="cdx-cert-entry-desc">${esc(t('cert.entry_desc'))}</p>
  <form id="cdx-cert-form" class="cdx-cert-form" autocomplete="off">
    <input id="cdx-cert-input" class="cdx-cert-input" type="text" placeholder="${esc(t('cert.entry_placeholder'))}" maxlength="20" spellcheck="false" autocapitalize="characters" required>
    <button class="cdx-cert-submit cdx-btn cdx-btn-primary" type="submit">${esc(t('cert.verify'))}</button>
  </form>
</div>`;
}

function errorHtml(msg, t) {
  return `<div class="cdx-cert-msg cdx-cert-msg--error">
  <div class="cdx-cert-msg-icon">✗</div>
  <p class="cdx-cert-msg-text">${esc(msg)}</p>
  <a href="validar.html" class="cdx-cert-try-again">${esc(t('cert.try_again'))}</a>
</div>`;
}

function resultHtml(view, t) {
  const f = view.fields;
  const pdf = view.pdf.show
    ? `<div class="cdx-cert-pdf-wrap"><a class="cdx-cert-pdf-btn cdx-btn cdx-btn-primary" href="${esc(view.pdf.href)}" target="_blank" rel="noopener">↓ ${esc(t('cert.download_pdf'))}</a></div>`
    : '';
  return `<div class="cdx-cert-result cdx-cert-result--${view.revoked ? 'revoked' : 'valid'}">
  <div class="cdx-cert-badge cdx-cert-badge--${view.badge.kind}"><span class="cdx-cert-badge-icon">${view.badge.icon}</span> ${esc(view.badge.label)}</div>
  <div class="cdx-cert-card">
    <div class="cdx-cert-field"><span class="cdx-cert-label">${esc(t('cert.f_holder'))}</span><span class="cdx-cert-value cdx-cert-value--name">${esc(f.holder)}</span></div>
    <div class="cdx-cert-field"><span class="cdx-cert-label">${esc(t('cert.f_course'))}</span><span class="cdx-cert-value">${esc(f.course)}</span></div>
    <div class="cdx-cert-fields-row">
      <div class="cdx-cert-field"><span class="cdx-cert-label">${esc(t('cert.f_hours'))}</span><span class="cdx-cert-value">${esc(f.hours)}</span></div>
      <div class="cdx-cert-field"><span class="cdx-cert-label">${esc(t('cert.f_issued'))}</span><span class="cdx-cert-value">${esc(f.issued)}</span></div>
    </div>
    <div class="cdx-cert-field"><span class="cdx-cert-label">${esc(t('cert.f_issuer'))}</span><span class="cdx-cert-value">${esc(f.issuer)}</span></div>
    ${pdf}
  </div>
  <p class="cdx-cert-footer">${esc(t('cert.footer'))} <a href="https://pensoia.com" target="_blank" rel="noopener">pensoia.com</a></p>
</div>`;
}

function settle(root, api, t, code) {
  root.innerHTML = loadingHtml(t);
  return validateCode(api, code, t).then((s) => {
    root.innerHTML = s.state === 'result' ? resultHtml(s.view, t) : errorHtml(s.msg, t);
  });
}

let _root = null;

export function mount(root, ctx = {}) {
  const api = ctx.api || trail;
  const t   = ctx.t   || defaultT;
  const loc = ctx.location || (typeof window !== 'undefined' ? window.location : { search: '', pathname: '' });
  _root = root;
  const code = getCode(loc.search || '', loc.pathname || '');
  if (code) { settle(root, api, t, code); return; }

  // Bare page: manual entry form.
  root.innerHTML = entryHtml(t);
  const form = root.querySelector('#cdx-cert-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('#cdx-cert-input');
    const v = (input && input.value || '').trim();
    if (v) settle(root, api, t, v);
  });
}

export function unmount() {
  // innerHTML re-renders drop their own listeners with the nodes; just clear.
  if (_root) _root.innerHTML = '';
  _root = null;
}
