// certificates/certificates.js
// Codex Certificados tab: Modelos (catálogo dos 7 modelos) | Emitidos (registro + emissão).
//
// Architecture mirrors questions/questions.js: exports SUBTABS, subtabs(), mount(),
// unmount(). Each sub-area is handled inline (no separate sub-modules) to keep
// the file self-contained while respecting the module boundary rules.
//
// The 7 fixed front templates + the shared back come from the PURE renderer in
// ./cert-render.js (visual layer in ./cert-render.css, scoped under .cdx-cert-page).
// The Modelos sub-area is a CATALOG: a live preview of each template themeable by
// colour. The legacy Slides-editor template builder (cert-template.js) is retired;
// templates are now a fixed, branded set selected at issue time.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../backstage/js/api-client.js)
//   window.bsLog        (../backstage/js/debug.js)
//   brand-logos helpers (../backstage/js/brand-logos.js) — used by hydrate()

import { certificates as api, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import { generateQrDataUrl, generateQrSvg } from './vendor/qr.js';
import {
  CERT_TEMPLATES, CERT_THEMES, isTemplate, isTheme, defaultMeta,
  buildCertData, renderFrontPage, renderCertificate, hydrate,
} from './cert-render.js';

// Re-export the registries so the catalog UI (and tests) read them from the face.
export { CERT_TEMPLATES, CERT_THEMES } from './cert-render.js';

// Stylesheet href for the standalone print window (resolved absolute so the
// popup, which has no base URL, can fetch it).
const CERT_CSS_HREF = new URL('cert-render.css?v=1.0', import.meta.url).href;

// ── Sub-tab registry ──────────────────────────────────────────────────────────
export const SUBTABS = [
  { key: 'modelos',  labelKey: 'certificates.sub_modelos'  },
  { key: 'emitidos', labelKey: 'certificates.sub_emitidos' },
];

function _resolveSub(sub) {
  return SUBTABS.some((s) => s.key === sub) ? sub : SUBTABS[0].key;
}

export function subtabs(activeSub) {
  const active = _resolveSub(activeSub);
  return SUBTABS.map((s) => ({
    label: t(s.labelKey),
    href: '/codex/?tab=certificates&sub=' + s.key,
    active: s.key === active,
  }));
}

// ── Module state ──────────────────────────────────────────────────────────────
let _viewEl = null;
let _activeSub = 'modelos';
let _cleanup = [];

// Modelos (catalog) state
let _catalogTheme = 'duo';

// Emitidos state
let _certs = [];
let _filterTurmaId = '';
let _filterStatus = '';
let _filterQ = '';
let _clients = [];
let _issueParticipants = [];
let _issueSelectedIds = new Set();

// ── Pure helper functions (exported for tests) ────────────────────────────────

/**
 * Build a validar URL from the base origin and a certificate code.
 * PURE — no side effects; tested in isolation.
 * @param {string} origin  e.g. "https://pensoia.com"
 * @param {string} code    e.g. "AB3HNQ4VXY"
 * @returns {string}
 */
export function buildValidarUrl(origin, code) {
  return (origin || '') + '/trilha/validar/' + (code || '');
}

/**
 * Format an ISO date string (YYYY-MM-DD or ISO datetime) to DD/MM/YYYY.
 * PURE — no side effects; tested in isolation.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formatIssuedOn(iso) {
  if (!iso) return '';
  const s = iso.slice(0, 10);
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/**
 * Map a certificate status to a badge CSS class.
 * PURE — no side effects; tested in isolation.
 * @param {string} status  "issued" | "sent" | "revoked" | ...
 * @returns {string}  CSS class name
 */
export function statusBadgeClass(status) {
  switch (status) {
    case 'issued':  return 'cdx-cert-badge cdx-cert-badge--issued';
    case 'sent':    return 'cdx-cert-badge cdx-cert-badge--sent';
    case 'revoked': return 'cdx-cert-badge cdx-cert-badge--revoked';
    default:        return 'cdx-cert-badge cdx-cert-badge--unknown';
  }
}

/**
 * Build the token-values object from a certificate row (legacy slide tokens +
 * a QR data URL). Kept as a pure mapping helper used by external consumers.
 * PURE — no side effects; tested in isolation.
 * @param {object} cert  { holder_name, course_title, hours, issued_on, code }
 * @param {string} origin  e.g. location.origin
 * @returns {object}  { nome, curso, carga, data, codigo, qr }
 */
export function buildTokenValues(cert, origin) {
  const url = buildValidarUrl(origin, cert.code);
  const qr  = generateQrDataUrl(url);
  return {
    nome:   cert.holder_name  || '',
    curso:  cert.course_title || '',
    carga:  cert.hours        || '',
    data:   formatIssuedOn(cert.issued_on),
    codigo: cert.code         || '',
    qr,
  };
}

/**
 * Assemble the issue-API payload from form fields. The chosen front template key
 * rides in `template_slug` (the existing column, repurposed for the fixed set);
 * `theme` and the verso `meta` snapshot are additive and only included when set.
 * PURE — no side effects; tested in isolation.
 * @param {object} fields  { turmaId, participantIds, templateSlug, theme, meta, courseTitle, hours, issuedOn, issuer }
 * @returns {object}  ready to pass to api.issue()
 */
export function buildIssuePayload(fields) {
  return {
    turma_id:        fields.turmaId,
    participant_ids: fields.participantIds,
    template_slug:   fields.templateSlug || undefined,
    theme:           fields.theme        || undefined,
    meta_json:       fields.meta ? JSON.stringify(fields.meta) : undefined,
    course_title:    fields.courseTitle  || '',
    hours:           fields.hours        || undefined,
    issued_on:       fields.issuedOn     || undefined,
    issuer:          fields.issuer       || undefined,
  };
}

/**
 * Filter certificates list by turmaId, status, and query string.
 * PURE — no side effects; tested in isolation.
 * @param {Array}  certs
 * @param {{ turma_id?: string|number, status?: string, q?: string }} filters
 * @returns {Array}
 */
export function filterCerts(certs, filters) {
  let out = certs || [];
  const { turma_id, status, q } = filters || {};
  if (turma_id) out = out.filter((c) => String(c.turma_id) === String(turma_id));
  if (status)   out = out.filter((c) => c.status === status);
  if (q)        out = out.filter((c) => (c.holder_name || '').toLowerCase().includes(q.toLowerCase()));
  return out;
}

// Roman numeral for a small positive integer (1..). Certificates rarely exceed a
// dozen modules; the algorithm is general anyway.
function _roman(n) {
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  let x = n;
  for (const [v, s] of map) { while (x >= v) { out += s; x -= v; } }
  return out;
}

/**
 * Parse the program-content textarea into module objects for the verso.
 * One module per non-empty line, "Título :: descrição" (description optional).
 * Numbering (n) is the sequential roman numeral.
 * PURE — no side effects; tested in isolation.
 * @param {string} text
 * @returns {Array<{n:string,t:string,d:string}>}
 */
export function parseModulesText(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const idx = line.indexOf('::');
    const title = (idx === -1 ? line : line.slice(0, idx)).trim();
    const desc  = (idx === -1 ? '' : line.slice(idx + 2)).trim();
    return { n: _roman(i + 1), t: title, d: desc };
  });
}

/**
 * Merge a certificate row's meta_json snapshot over the PensoIA default meta.
 * Malformed JSON falls back to defaults (never throws).
 * PURE — no side effects; tested in isolation.
 * @param {object} cert  { meta_json?: string }
 * @returns {object}  full meta (course-level fields + modules)
 */
export function parseCertMeta(cert) {
  const base = defaultMeta();
  if (cert && typeof cert.meta_json === 'string' && cert.meta_json.trim()) {
    try { Object.assign(base, JSON.parse(cert.meta_json)); } catch (_) { /* keep defaults */ }
  }
  return base;
}

/** Resolve the saved front-template key, falling back to the first template. */
export function certTemplateKey(cert) {
  return cert && isTemplate(cert.template_slug) ? cert.template_slug : CERT_TEMPLATES[0].key;
}

/** Resolve the saved colour theme, falling back to duo. */
export function certThemeKey(cert) {
  return cert && isTheme(cert.theme) ? cert.theme : 'duo';
}

/**
 * Render the full certificate (front + back) HTML for a saved row. Placeholders
 * (logo/QR) are left for hydrate() to fill in the browser. PURE string output.
 * @param {object} cert    a certificate row (with template_slug, theme, meta_json)
 * @param {string} origin  e.g. location.origin
 * @returns {string}  HTML for the two A4 sheets
 */
export function renderCertHtml(cert, origin) {
  const d = buildCertData(cert, parseCertMeta(cert), origin);
  return renderCertificate(certTemplateKey(cert), certThemeKey(cert), d);
}

/**
 * A demonstration certificate used to preview templates in the catalog. PURE.
 * @returns {object}  a certificate-shaped object (with meta_json)
 */
export function sampleCert() {
  return {
    holder_name: 'Marina Andrade Conrado',
    course_title: 'IA do Zero ao Entendimento Prático',
    hours: '12 horas',
    issued_on: '2026-08-15',
    code: 'AB3HNQ4VXY',
    issuer: 'EPBF Soluções em Tecnologia Ltda',
    template_slug: 'vetor',
    theme: 'duo',
    meta_json: JSON.stringify({
      place: 'Aracaju · SE',
      client: 'VNC Advocacia',
      format: '3 encontros de 4 horas',
      meetings: '3',
      modules: [
        { n: 'I',   t: 'Fundamentos de LLMs',          d: 'Tokens, contexto e como o modelo gera texto.' },
        { n: 'II',  t: 'Engenharia de Prompt Avançada', d: 'Frameworks, papéis e few-shot.' },
        { n: 'III', t: 'Gestão de Riscos',              d: 'Alucinação, viés e confidencialidade.' },
        { n: 'IV',  t: 'Panorama de Ferramentas',       d: 'Assistentes e fluxos do dia a dia.' },
        { n: 'V',   t: 'Laboratório Prático',           d: 'Casos reais do escritório.' },
      ],
    }),
  };
}

/**
 * Wrap hydrated certificate HTML into a standalone A4-landscape document that
 * links the certificate stylesheet, for the browser print → PDF flow. PURE.
 * @param {{cssHref:string, bodyHtml:string, title?:string}} opts
 * @returns {string}  full HTML document
 */
export function buildPrintDocument(opts) {
  opts = opts || {};
  const title = opts.title || 'Certificado';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>' + title + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lora:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">' +
    '<link rel="stylesheet" href="' + (opts.cssHref || '') + '">' +
    '<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff}' +
    '.cdx-cert-page{page-break-after:always}.cdx-cert-page:last-child{page-break-after:auto}</style>' +
    '</head><body>' + (opts.bodyHtml || '') + '</body></html>';
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// One A4 sheet at 96dpi (297mm × 210mm) in CSS px — used to scale previews.
const SHEET_PX_W = 297 * 96 / 25.4;
const SHEET_PX_H = 210 * 96 / 25.4;

// Scale a rendered .cdx-cert-page to fit the given container width (the sheet
// keeps its fixed mm geometry; we just transform it down). The container must
// clip overflow (see certificates.css).
function _fitPage(page, containerWidth) {
  if (!page) return;
  const w = containerWidth || page.parentElement && page.parentElement.clientWidth || 280;
  const scale = w / SHEET_PX_W;
  page.style.transformOrigin = 'top left';
  page.style.transform = 'scale(' + scale + ')';
  page.style.height = (SHEET_PX_H * scale) + 'px';
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-certs-shell" id="cdx-certs-shell">' +
      '<div id="cdx-certs-area"></div>' +
    '</div>';
}

// ── Modelos sub-area: catalog of the 7 templates ──────────────────────────────
function _mountModelos() {
  const area = _q('#cdx-certs-area');
  if (!area) return;

  area.innerHTML =
    '<div class="cdx-cert-catalog">' +
      '<div class="cdx-cert-catalog-head">' +
        '<div class="cdx-cert-catalog-heading">' +
          '<div class="cdx-cert-catalog-title">' + esc(t('certificates.catalog_title')) + '</div>' +
          '<p class="cdx-cert-catalog-hint">' + esc(t('certificates.catalog_hint')) + '</p>' +
        '</div>' +
        '<div class="cdx-cert-theme-picker" id="cdx-cert-theme-picker">' +
          '<span class="cdx-cert-theme-label">' + esc(t('certificates.theme')) + '</span>' +
          CERT_THEMES.map((th) =>
            '<button type="button" class="cdx-cert-theme-chip' + (th.key === _catalogTheme ? ' is-active' : '') + '" ' +
              'data-theme="' + esc(th.key) + '">' + esc(t('certificates.theme_' + th.key)) + '</button>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div class="cdx-cert-grid" id="cdx-cert-grid"></div>' +
    '</div>';

  _renderCatalogThumbs();

  const picker = _q('#cdx-cert-theme-picker');
  if (picker) {
    const onClick = (e) => {
      const btn = e.target.closest('[data-theme]');
      if (!btn) return;
      _catalogTheme = btn.dataset.theme;
      picker.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-active', b.dataset.theme === _catalogTheme));
      _renderCatalogThumbs();
    };
    picker.addEventListener('click', onClick);
    _cleanup.push(() => picker.removeEventListener('click', onClick));
  }

  const grid = _q('#cdx-cert-grid');
  if (grid) {
    const onClick = (e) => {
      const card = e.target.closest('[data-template]');
      if (!card) return;
      const cert = Object.assign(sampleCert(), { template_slug: card.dataset.template, theme: _catalogTheme });
      _openCertPreview(cert);
    };
    grid.addEventListener('click', onClick);
    _cleanup.push(() => grid.removeEventListener('click', onClick));
  }

  const onResize = () => {
    const g = _q('#cdx-cert-grid');
    if (g) g.querySelectorAll('.cdx-cert-thumb').forEach((th) => _fitPage(th.querySelector('.cdx-cert-page'), th.clientWidth));
  };
  window.addEventListener('resize', onResize);
  _cleanup.push(() => window.removeEventListener('resize', onResize));
}

function _renderCatalogThumbs() {
  const grid = _q('#cdx-cert-grid');
  if (!grid) return;
  const cert   = sampleCert();
  const origin = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const d      = buildCertData(cert, parseCertMeta(cert), origin);
  const qrUrl  = buildValidarUrl(origin, cert.code);

  grid.innerHTML = CERT_TEMPLATES.map((tpl) =>
    '<div class="cdx-cert-card" data-template="' + esc(tpl.key) + '" title="' + esc(t('certificates.preview_open')) + '">' +
      '<div class="cdx-cert-thumb">' + renderFrontPage(tpl.key, _catalogTheme, d) + '</div>' +
      '<div class="cdx-cert-card-label">' + esc(tpl.label) + '</div>' +
    '</div>'
  ).join('');

  grid.querySelectorAll('.cdx-cert-thumb').forEach((thumb) => {
    hydrate(thumb, { qr: generateQrSvg, qrUrl });
    _fitPage(thumb.querySelector('.cdx-cert-page'), thumb.clientWidth);
  });
}

// ── Emitidos sub-area ─────────────────────────────────────────────────────────
function _mountEmitidos() {
  const area = _q('#cdx-certs-area');
  if (!area) return;

  area.innerHTML =
    '<div class="cdx-certs-emitidos">' +
      '<div class="cdx-certs-toolbar">' +
        '<input type="search" class="cdx-certs-search" id="cdx-certs-search" placeholder="' + esc(t('certificates.search_ph')) + '">' +
        '<select id="cdx-certs-filter-turma" class="cdx-certs-select">' +
          '<option value="">' + esc(t('certificates.filter_all_turmas')) + '</option>' +
        '</select>' +
        '<select id="cdx-certs-filter-status" class="cdx-certs-select">' +
          '<option value="">' + esc(t('certificates.filter_all_statuses')) + '</option>' +
          '<option value="issued">' + esc(t('certificates.status_issued')) + '</option>' +
          '<option value="sent">' + esc(t('certificates.status_sent')) + '</option>' +
          '<option value="revoked">' + esc(t('certificates.status_revoked')) + '</option>' +
        '</select>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-certs-issue-btn">' + esc(t('certificates.issue_btn')) + '</button>' +
      '</div>' +
      '<div id="cdx-certs-list">' +
        '<div class="cdx-empty">' + esc(t('certificates.loading')) + '</div>' +
      '</div>' +
    '</div>';

  _loadCertList();
  _loadClientsForFilter();

  // Wire toolbar
  const searchEl = _q('#cdx-certs-search');
  if (searchEl) {
    const onInput = () => { _filterQ = searchEl.value; _renderCertList(); };
    searchEl.addEventListener('input', onInput);
    _cleanup.push(() => searchEl.removeEventListener('input', onInput));
  }
  const turmaEl = _q('#cdx-certs-filter-turma');
  if (turmaEl) {
    const onChange = () => { _filterTurmaId = turmaEl.value; _renderCertList(); };
    turmaEl.addEventListener('change', onChange);
    _cleanup.push(() => turmaEl.removeEventListener('change', onChange));
  }
  const statusEl = _q('#cdx-certs-filter-status');
  if (statusEl) {
    const onChange = () => { _filterStatus = statusEl.value; _renderCertList(); };
    statusEl.addEventListener('change', onChange);
    _cleanup.push(() => statusEl.removeEventListener('change', onChange));
  }
  const issueBtn = _q('#cdx-certs-issue-btn');
  if (issueBtn) {
    const onClick = () => _openIssueFlow();
    issueBtn.addEventListener('click', onClick);
    _cleanup.push(() => issueBtn.removeEventListener('click', onClick));
  }

  const list = _q('#cdx-certs-list');
  if (list) {
    const onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const code   = btn.dataset.code;
      if (action === 'copy-url') { _copyValidarUrl(code); return; }
      if (action === 'revoke')   { _revokeConfirm(code);  return; }
      if (action === 'mark-sent'){ _markSent(code);       return; }
      if (action === 'preview')  { _previewCert(code);    return; }
    };
    list.addEventListener('click', onClick);
    _cleanup.push(() => list.removeEventListener('click', onClick));
  }
}

async function _loadCertList() {
  const listEl = _q('#cdx-certs-list');
  if (listEl) listEl.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.loading')) + '</div>';
  try {
    const res = await api.list({});
    _certs = (res && res.certificates) || [];
    _renderCertList();
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: list: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
    if (_q('#cdx-certs-list')) _q('#cdx-certs-list').innerHTML = '<div class="cdx-empty">' + esc(t('certificates.error_loading')) + '</div>';
  }
}

async function _loadClientsForFilter() {
  try {
    const res = await cohortsApi.listClients();
    _clients = (res && res.clients) || [];
  } catch (_) {}
}

function _renderCertList() {
  const listEl = _q('#cdx-certs-list');
  if (!listEl) return;
  const visible = filterCerts(_certs, { turma_id: _filterTurmaId, status: _filterStatus, q: _filterQ });
  if (!visible.length) {
    listEl.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.empty')) + '</div>';
    return;
  }
  listEl.innerHTML =
    '<table class="cdx-certs-table">' +
      '<thead><tr>' +
        '<th>' + esc(t('certificates.col_code'))    + '</th>' +
        '<th>' + esc(t('certificates.col_holder'))  + '</th>' +
        '<th>' + esc(t('certificates.col_course'))  + '</th>' +
        '<th>' + esc(t('certificates.col_date'))    + '</th>' +
        '<th>' + esc(t('certificates.col_status'))  + '</th>' +
        '<th>' + esc(t('certificates.col_actions')) + '</th>' +
      '</tr></thead>' +
      '<tbody>' +
        visible.map((c) => _renderCertRow(c)).join('') +
      '</tbody>' +
    '</table>';
}

function _renderCertRow(c) {
  const validarUrl = buildValidarUrl(
    (typeof location !== 'undefined' ? location.origin : ''),
    c.code
  );
  const hasPdf = !!(c.pdf_path);
  return '<tr>' +
    '<td class="cdx-certs-code"><code>' + esc(c.code) + '</code></td>' +
    '<td>' + esc(c.holder_name || '') + '</td>' +
    '<td>' + esc(c.course_title || '') + '</td>' +
    '<td>' + esc(formatIssuedOn(c.issued_on)) + '</td>' +
    '<td><span class="' + statusBadgeClass(c.status) + '">' + esc(t('certificates.status_' + c.status) || c.status) + '</span></td>' +
    '<td class="cdx-certs-actions">' +
      '<button class="cdx-btn cdx-btn-sm" data-action="preview" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_preview')) + '</button>' +
      '<button class="cdx-btn cdx-btn-sm" data-action="copy-url" data-code="' + esc(c.code) + '" title="' + esc(validarUrl) + '">' + esc(t('certificates.action_copy_url')) + '</button>' +
      (c.status !== 'revoked' ? '<button class="cdx-btn cdx-btn-sm" data-action="mark-sent" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_mark_sent')) + '</button>' : '') +
      (c.status !== 'revoked' ? '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="revoke" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_revoke')) + '</button>' : '') +
      (hasPdf ? '<a class="cdx-btn cdx-btn-sm" href="' + esc(c.pdf_path) + '" target="_blank" rel="noopener">' + esc(t('certificates.action_download_pdf')) + '</a>' : '') +
    '</td>' +
  '</tr>';
}

function _copyValidarUrl(code) {
  const url = buildValidarUrl(
    (typeof location !== 'undefined' ? location.origin : ''),
    code
  );
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => notice.ok(t('certificates.copied_url')))
      .catch(() => notice.warn(url));
  }
}

function _revokeConfirm(code) {
  const html =
    '<div class="cdx-modal" style="max-width:400px">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.revoke_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + esc(t('certificates.revoke_msg').replace('{code}', code)) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-rev-cancel">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-rev-confirm">' + esc(t('certificates.action_revoke')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-rev-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-rev-confirm').addEventListener('click', async () => {
    closeModal(bd);
    try {
      await api.revoke({ code });
      notice.ok(t('certificates.revoked_ok'));
      await _loadCertList();
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: revoke: ' + (e && e.message || e), 'error');
      notice.error(t('certificates.error_loading'));
    }
  });
}

async function _markSent(code) {
  try {
    await api.markSent({ code });
    notice.ok(t('certificates.marked_sent_ok'));
    await _loadCertList();
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: markSent: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
  }
}

// ── Preview + print ───────────────────────────────────────────────────────────
function _previewCert(code) {
  const cert = _certs.find((c) => c.code === code);
  if (!cert) return;
  _openCertPreview(cert);
}

// Render the real front+back for a certificate (a saved row or a catalog sample)
// into a modal, hydrate the logo/QR placeholders, and offer print → PDF.
function _openCertPreview(cert) {
  const origin = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const html =
    '<div class="cdx-modal cdx-cert-render-modal">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.preview_title')) + '</div>' +
      '<div class="cdx-cert-render-stage" id="cdx-cert-render-stage">' + renderCertHtml(cert, origin) + '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-prev-close">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-prev-print">' + esc(t('certificates.print')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  const stage = bd.querySelector('#cdx-cert-render-stage');
  hydrate(stage, { qr: generateQrSvg, qrUrl: buildValidarUrl(origin, cert.code) });
  stage.querySelectorAll('.cdx-cert-page').forEach((p) => _fitPage(p, stage.clientWidth));
  bd.querySelector('#cdx-prev-close').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-prev-print').addEventListener('click', () => _printCert(cert));
}

function _printCert(cert) {
  const origin = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const tmp = document.createElement('div');
  tmp.innerHTML = renderCertHtml(cert, origin);
  hydrate(tmp, { qr: generateQrSvg, qrUrl: buildValidarUrl(origin, cert.code) });
  const doc = buildPrintDocument({
    cssHref: CERT_CSS_HREF,
    bodyHtml: tmp.innerHTML,
    title: 'Certificado ' + (cert.code || ''),
  });
  const w = window.open('', '_blank');
  if (!w) { notice.warn(t('certificates.print_blocked')); return; }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  w.onload = () => { try { w.focus(); w.print(); } catch (_) {} };
}

// ── Issue flow ────────────────────────────────────────────────────────────────
function _openIssueFlow() {
  const dm = defaultMeta();
  const html =
    '<div class="cdx-modal cdx-cert-issue-modal" style="max-width:640px;max-height:90vh;overflow-y:auto">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.issue_title')) + '</div>' +

      // Step 1: client + turma
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_client')) + '</label>' +
        '<select id="cdx-issue-client">' +
          '<option value="">' + esc(t('certificates.issue_select_client')) + '</option>' +
          _clients.map((c) => '<option value="' + esc(c.slug) + '">' + esc(c.display_name || c.name) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_turma')) + '</label>' +
        '<select id="cdx-issue-turma" disabled>' +
          '<option value="">' + esc(t('certificates.issue_select_turma')) + '</option>' +
        '</select>' +
      '</div>' +

      // Step 2: participants
      '<div id="cdx-issue-roster-wrap" style="display:none">' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_participants')) + '</label>' +
          '<div id="cdx-issue-roster" class="cdx-cert-roster"></div>' +
        '</div>' +
      '</div>' +

      // Step 3: template + theme
      '<div class="cdx-field-row">' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_template')) + '</label>' +
          '<select id="cdx-issue-template">' +
            CERT_TEMPLATES.map((tpl) => '<option value="' + esc(tpl.key) + '">' + esc(tpl.label) + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_theme')) + '</label>' +
          '<select id="cdx-issue-theme">' +
            CERT_THEMES.map((th) => '<option value="' + esc(th.key) + '"' + (th.key === 'duo' ? ' selected' : '') + '>' + esc(t('certificates.theme_' + th.key)) + '</option>').join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      // Step 4: course metadata
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_course_title')) + '</label>' +
        '<input type="text" id="cdx-issue-course" placeholder="' + esc(t('certificates.issue_course_ph')) + '">' +
      '</div>' +
      '<div class="cdx-field-row">' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_hours')) + '</label>' +
          '<input type="text" id="cdx-issue-hours" placeholder="' + esc(t('certificates.issue_hours_ph')) + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_issued_on')) + '</label>' +
          '<input type="date" id="cdx-issue-date" value="' + esc(new Date().toISOString().slice(0, 10)) + '">' +
        '</div>' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_issuer')) + '</label>' +
        '<input type="text" id="cdx-issue-issuer" value="' + esc(t('certificates.issue_issuer_default')) + '" placeholder="' + esc(t('certificates.issue_issuer_ph')) + '">' +
      '</div>' +

      // Step 5: verso (back) content snapshot
      '<fieldset class="cdx-cert-verso">' +
        '<legend>' + esc(t('certificates.issue_verso_legend')) + '</legend>' +
        '<div class="cdx-field-row">' +
          '<div class="cdx-field">' +
            '<label>' + esc(t('certificates.issue_instructor')) + '</label>' +
            '<input type="text" id="cdx-issue-instructor" value="' + esc(dm.instructor) + '">' +
          '</div>' +
          '<div class="cdx-field">' +
            '<label>' + esc(t('certificates.issue_place')) + '</label>' +
            '<input type="text" id="cdx-issue-place" placeholder="' + esc(t('certificates.issue_place_ph')) + '">' +
          '</div>' +
        '</div>' +
        '<div class="cdx-field-row">' +
          '<div class="cdx-field">' +
            '<label>' + esc(t('certificates.issue_format')) + '</label>' +
            '<input type="text" id="cdx-issue-format" placeholder="' + esc(t('certificates.issue_format_ph')) + '">' +
          '</div>' +
          '<div class="cdx-field">' +
            '<label>' + esc(t('certificates.issue_modality')) + '</label>' +
            '<input type="text" id="cdx-issue-modality" value="' + esc(dm.modality) + '">' +
          '</div>' +
          '<div class="cdx-field">' +
            '<label>' + esc(t('certificates.issue_meetings')) + '</label>' +
            '<input type="text" id="cdx-issue-meetings" placeholder="' + esc(t('certificates.issue_meetings_ph')) + '">' +
          '</div>' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + esc(t('certificates.issue_modules')) + '</label>' +
          '<textarea id="cdx-issue-modules" rows="5" placeholder="' + esc(t('certificates.issue_modules_ph')) + '"></textarea>' +
          '<small class="cdx-field-hint">' + esc(t('certificates.issue_modules_hint')) + '</small>' +
        '</div>' +
      '</fieldset>' +

      '<div id="cdx-issue-result" style="display:none"></div>' +

      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-issue-cancel">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-issue-submit">' + esc(t('certificates.issue_submit')) + '</button>' +
      '</div>' +
    '</div>';

  const bd = openModal(html, { disableBackdropClose: false });
  _issueSelectedIds = new Set();

  bd.querySelector('#cdx-issue-cancel').addEventListener('click', () => closeModal(bd));

  const clientSel = bd.querySelector('#cdx-issue-client');
  const turmaSel  = bd.querySelector('#cdx-issue-turma');

  clientSel.addEventListener('change', async () => {
    const slug = clientSel.value;
    turmaSel.innerHTML = '<option value="">' + esc(t('certificates.issue_select_turma')) + '</option>';
    turmaSel.disabled = !slug;
    // Pre-fill the client display name into the verso "client" snapshot.
    if (!slug) return;
    try {
      const res = await cohortsApi.listTurmas({ client_slug: slug });
      const turmas = (res && res.turmas) || [];
      turmas.forEach((turma) => {
        const opt = document.createElement('option');
        opt.value = String(turma.id);
        opt.textContent = turma.display_name || turma.name;
        turmaSel.appendChild(opt);
      });
      turmaSel.disabled = false;
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: issue: listTurmas: ' + (e && e.message || e), 'error');
    }
  });

  turmaSel.addEventListener('change', async () => {
    const turmaId = turmaSel.value;
    const rosterWrap = bd.querySelector('#cdx-issue-roster-wrap');
    const rosterEl   = bd.querySelector('#cdx-issue-roster');
    if (!turmaId) { if (rosterWrap) rosterWrap.style.display = 'none'; return; }
    if (rosterEl) rosterEl.innerHTML = '<span class="cdx-empty">' + esc(t('certificates.loading')) + '</span>';
    if (rosterWrap) rosterWrap.style.display = '';
    try {
      const res = await cohortsApi.listParticipants({ turma_id: parseInt(turmaId, 10) });
      _issueParticipants = (res && res.participants) || [];
      _issueSelectedIds = new Set(_issueParticipants.map((p) => p.id));
      if (rosterEl) rosterEl.innerHTML = _issueParticipants.length
        ? _issueParticipants.map((p) =>
            '<label class="cdx-cert-roster-row">' +
              '<input type="checkbox" data-pid="' + esc(String(p.id)) + '" ' + (_issueSelectedIds.has(p.id) ? 'checked' : '') + '>' +
              '<span>' + esc(p.name) + (p.email ? ' <span class="cdx-cert-roster-email">(' + esc(p.email) + ')</span>' : '') + '</span>' +
            '</label>'
          ).join('')
        : '<span class="cdx-empty">' + esc(t('certificates.issue_no_participants')) + '</span>';
      if (rosterEl) {
        rosterEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const pid = parseInt(cb.dataset.pid, 10);
            if (cb.checked) _issueSelectedIds.add(pid);
            else _issueSelectedIds.delete(pid);
          });
        });
      }
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: issue: listParticipants: ' + (e && e.message || e), 'error');
      if (rosterEl) rosterEl.innerHTML = '<span class="cdx-empty">' + esc(t('certificates.error_loading')) + '</span>';
    }
  });

  bd.querySelector('#cdx-issue-submit').addEventListener('click', async () => {
    const turmaId     = turmaSel.value;
    const courseTitle = bd.querySelector('#cdx-issue-course').value.trim();
    const hours       = bd.querySelector('#cdx-issue-hours').value.trim();
    const issuedOn    = bd.querySelector('#cdx-issue-date').value;
    const issuer      = bd.querySelector('#cdx-issue-issuer').value.trim();
    const template    = bd.querySelector('#cdx-issue-template').value;
    const theme       = bd.querySelector('#cdx-issue-theme').value;

    if (!turmaId) { notice.warn(t('certificates.issue_select_turma')); return; }
    if (!courseTitle) { notice.warn(t('certificates.issue_course_required')); return; }
    if (_issueSelectedIds.size === 0) { notice.warn(t('certificates.issue_no_selection')); return; }

    const meta = _gatherVersoMeta(bd, clientSel);

    const payload = buildIssuePayload({
      turmaId:        parseInt(turmaId, 10),
      participantIds: Array.from(_issueSelectedIds),
      templateSlug:   template || undefined,
      theme:          theme || undefined,
      meta,
      courseTitle,
      hours:          hours || undefined,
      issuedOn:       issuedOn || undefined,
      issuer:         issuer || undefined,
    });

    try {
      const res = await api.issue(payload);
      const codes = (res && res.codes) || (res && res.certificates && res.certificates.map((c) => c.code)) || [];
      const resultEl = bd.querySelector('#cdx-issue-result');
      if (resultEl) {
        resultEl.style.display = '';
        resultEl.innerHTML =
          '<div class="cdx-cert-issue-result">' +
            '<strong>' + esc(t('certificates.issue_result_title')) + '</strong>' +
            '<ul>' + codes.map((code) => '<li><code>' + esc(code) + '</code></li>').join('') + '</ul>' +
          '</div>';
      }
      notice.ok(t('certificates.issued_ok').replace('{n}', String(codes.length)));
      await _loadCertList();
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: issue: ' + (e && e.message || e), 'error');
      notice.error(t('certificates.error_loading'));
    }
  });
}

// Collect the verso (back) snapshot from the issue modal. Only non-empty values
// are included so omitted fields keep their PensoIA defaults at render time.
function _gatherVersoMeta(bd, clientSel) {
  const meta = {};
  const set = (key, sel) => {
    const el = bd.querySelector(sel);
    const v = el ? String(el.value || '').trim() : '';
    if (v) meta[key] = v;
  };
  set('instructor', '#cdx-issue-instructor');
  set('place',      '#cdx-issue-place');
  set('format',     '#cdx-issue-format');
  set('modality',   '#cdx-issue-modality');
  set('meetings',   '#cdx-issue-meetings');
  const mods = parseModulesText(bd.querySelector('#cdx-issue-modules').value);
  if (mods.length) meta.modules = mods;
  if (clientSel && clientSel.selectedIndex > 0) {
    const opt = clientSel.options[clientSel.selectedIndex];
    if (opt && opt.textContent) meta.client = opt.textContent.trim();
  }
  return meta;
}

// ── Tab contract ──────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  ctx = ctx || {};
  _activeSub = _resolveSub(ctx.sub);
  _cleanup = [];
  _catalogTheme = 'duo';
  _certs = [];
  _filterTurmaId = '';
  _filterStatus  = '';
  _filterQ       = '';
  _clients       = [];
  _issueParticipants = [];
  _issueSelectedIds  = new Set();

  _renderShell();

  if (_activeSub === 'modelos') _mountModelos();
  else _mountEmitidos();
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) {} });
  _cleanup = [];
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
  });
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _certs = [];
}
