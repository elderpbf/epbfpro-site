'use strict';

// Validar -- public certificate-validation page module.
// Reads ?code= (supplied by .htaccess rewrite for /trilha/validar/<code>).
// Falls back to a manual code-entry form when no code is present.
// Calls callWorker({ action: 'cert_validate', code }) -- no auth required.
//
// API contract (API.md cert_validate):
//   ok:true  -> { holder_name, course_title, hours, issued_on, issuer, status, pdf_url }
//               status: 'issued' | 'signed' | 'sent' | 'revoked'
//   ok:false -> { ok: false }  (unknown code)
//
// IIFE, Trilha house style; window.Validar is the public surface.

(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    // iso: "yyyy-mm-dd" -> "dd/mm/yyyy"
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length < 3) return esc(iso);
    return parts[2].replace(/^0/, '') + '/' + parts[1].replace(/^0/, '') + '/' + parts[0];
  }

  function getCode() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('code') || '').trim();
  }

  // ── DOM references ─────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  // ── Render states ──────────────────────────────────────────────────────

  function showLoading() {
    el('vd-loading').hidden = false;
    el('vd-result').hidden  = true;
    el('vd-error').hidden   = true;
    el('vd-entry').hidden   = true;
  }

  function showEntry() {
    el('vd-loading').hidden = true;
    el('vd-result').hidden  = true;
    el('vd-error').hidden   = true;
    el('vd-entry').hidden   = false;
  }

  function showError(msg) {
    el('vd-loading').hidden = true;
    el('vd-result').hidden  = true;
    el('vd-error').hidden   = false;
    el('vd-entry').hidden   = true;
    el('vd-error-msg').textContent = msg;
  }

  function showResult(cert) {
    el('vd-loading').hidden = true;
    el('vd-error').hidden   = true;
    el('vd-entry').hidden   = true;

    var isRevoked = cert.status === 'revoked';

    var resultEl = el('vd-result');
    resultEl.hidden = false;
    resultEl.className = 'vd-result' + (isRevoked ? ' vd-result--revoked' : ' vd-result--valid');

    // Status badge
    var badgeEl = el('vd-status-badge');
    if (isRevoked) {
      badgeEl.className = 'vd-badge vd-badge--revoked';
      badgeEl.innerHTML = '<span class="vd-badge-icon">&#10007;</span> Certificado revogado';
    } else {
      badgeEl.className = 'vd-badge vd-badge--valid';
      badgeEl.innerHTML = '<span class="vd-badge-icon">&#10003;</span> Certificado válido';
    }

    // Fields
    el('vd-holder-name').textContent   = cert.holder_name   || '';
    el('vd-course-title').textContent  = cert.course_title  || '';
    el('vd-hours').textContent         = cert.hours != null ? cert.hours + 'h' : '—';
    el('vd-issued-on').textContent     = fmtDate(cert.issued_on);
    el('vd-issuer').textContent        = cert.issuer || '';

    // PDF download button (only when pdf_url present and cert not revoked)
    var pdfWrap = el('vd-pdf-wrap');
    if (cert.pdf_url && !isRevoked) {
      pdfWrap.hidden = false;
      var pdfLink = el('vd-pdf-link');
      pdfLink.href = cert.pdf_url;
    } else {
      pdfWrap.hidden = true;
    }

    // Phase-2 digital-signature badge: slot is in markup, stays hidden for now.
    // el('vd-sig-badge').hidden = false;  // Phase 2
  }

  // ── Core logic ─────────────────────────────────────────────────────────

  async function validate(code) {
    showLoading();
    try {
      var res = await callWorker({ action: 'cert_validate', code: code });
      if (!res || !res.ok) {
        showError('Certificado não encontrado. Verifique o código e tente novamente.');
        return;
      }
      showResult(res.certificate || res);
    } catch (err) {
      showError('Não foi possível verificar o certificado. Verifique sua conexão e tente novamente.');
    }
  }

  // ── Entry-form handler ─────────────────────────────────────────────────

  function wireEntryForm() {
    var form = el('vd-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = el('vd-code-input');
      var code = (input && input.value || '').trim();
      if (!code) return;
      validate(code);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function init() {
    wireEntryForm();
    var code = getCode();
    if (code) {
      validate(code);
    } else {
      showEntry();
    }
  }

  // ── Public surface (used by tests) ─────────────────────────────────────

  window.Validar = {
    init: init,
    validate: validate,
    showEntry: showEntry,
    showLoading: showLoading,
    showError: showError,
    showResult: showResult,
    // exposed for tests
    _esc: esc,
    _fmtDate: fmtDate,
    _getCode: getCode,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
