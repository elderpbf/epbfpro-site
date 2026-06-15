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
import { ementaToCertModules } from '../js/ementa.js';
import { generateQrDataUrl, generateQrSvg } from './vendor/qr.js';
import {
  CERT_TEMPLATES, CERT_THEMES, isTemplate, isTheme, defaultMeta,
  buildCertData, renderFrontPage, renderBackPage, renderCertificate, hydrate,
} from './cert-render.js';

// Re-export the registries so the catalog UI (and tests) read them from the face.
export { CERT_TEMPLATES, CERT_THEMES } from './cert-render.js';

// Stylesheet href for the standalone print window (resolved absolute so the
// popup, which has no base URL, can fetch it).
const CERT_CSS_HREF = new URL('cert-render.css?v=1.3', import.meta.url).href;

// ── Sub-tab registry ──────────────────────────────────────────────────────────
export const SUBTABS = [
  { key: 'emitidos', labelKey: 'certificates.sub_emitidos' },
  { key: 'modelos',  labelKey: 'certificates.sub_modelos'  },
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

// The catalog has two sides. Fronts = the 7 themed templates (CERT_TEMPLATES);
// backs = the shared verso, a single entry today but modeled as a list because
// more backs are expected. The back is theme-aware but has no template key.
const CERT_BACKS = [{ key: 'standard', labelKey: 'certificates.back_label', descKey: 'certificates.back_desc' }];

// Modelos (catalog) state — master-detail with a Frente/Verso side switch: the
// active side drives the left list (templates vs backs); the right pane shows the
// one selected sheet, themed by the shared colour picker.
let _catalogTheme = 'duo';
let _activeSide = 'front';          // 'front' | 'back'
let _selectedTemplate = 'vetor';
let _selectedBack = 'standard';

// Emitidos state. Two-step locate: by client → its cohorts, and/or by name. The
// turma index + by-client grouping (from ct_list_all_turmas) resolve a cert's
// turma_id to its cohort + client for both the filters and the table columns.
let _certs = [];
let _filterClientSlug = '';
let _filterTurmaId = '';
let _filterStatus = '';
let _filterQ = '';
let _filterDateFrom = '';
let _filterDateTo = '';
let _clients = [];
let _turmaIndex = {};       // String(turma_id) -> turma row
let _turmasByClient = {};   // client_slug -> [turma rows]
let _issueParticipants = [];
let _issueSelectedIds = new Set();
// Emissão dashboard (ported from backstage/mocks/emissao/a3.html): sortable table
// with a header select-all, KPI cards as status filters, and a bulk-action bar.
let _sortKey = 'created';   // code | holder | client | turma | course | issued | status | created
let _sortDir = 'desc';      // 'asc' | 'desc'
let _selectedCodes = new Set();

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
    case 'signed':  return 'cdx-cert-badge cdx-cert-badge--signed';
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
  const { turma_id, turma_ids, status, q, date_from, date_to } = filters || {};
  if (turma_id) {
    out = out.filter((c) => String(c.turma_id) === String(turma_id));
  } else if (Array.isArray(turma_ids) && turma_ids.length) {
    const set = new Set(turma_ids.map((id) => String(id)));
    out = out.filter((c) => set.has(String(c.turma_id)));
  }
  if (status)   out = out.filter((c) => c.status === status);
  if (q)        out = out.filter((c) => (c.holder_name || '').toLowerCase().includes(q.toLowerCase()));
  // issued_on is an ISO yyyy-mm-dd string, so lexicographic compare == date compare.
  // A cert without an issued_on is excluded while any date bound is active.
  if (date_from) out = out.filter((c) => c.issued_on && c.issued_on >= date_from);
  if (date_to)   out = out.filter((c) => c.issued_on && c.issued_on <= date_to);
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
    // "A4 landscape" keyword forces landscape orientation in the print dialog even
    // when its saved default is portrait (explicit "297mm 210mm" fell back to
    // portrait on some setups). print-color-adjust:exact keeps the themed
    // gradients/colours from being stripped when "Background graphics" is off.
    '<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff}' +
    '.cdx-cert-page,.cdx-cert-page *{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    // Fill the page box exactly; sheet at 100% (not a fixed 297mm) so sub-pixel mm
    // rounding can't overflow and trigger the shrink-to-fit white bars.
    '.cdx-cert-page{width:297mm;height:210mm;overflow:hidden;page-break-after:always}.cdx-cert-page:last-child{page-break-after:auto}' +
    '.cdx-cert-page .cdxc-sheet{width:100%;height:100%;box-shadow:none}</style>' +
    '</head><body>' + (opts.bodyHtml || '') + '</body></html>';
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// One A4 sheet at 96dpi (297mm × 210mm) in CSS px — used to scale previews.
const SHEET_PX_W = 297 * 96 / 25.4;
const SHEET_PX_H = 210 * 96 / 25.4;

// Scale every .cdx-cert-sheet-wrap inside `container` to CONTAIN it: fit both the
// width AND the full stacked height (n sheets + the gaps between them), so the
// whole front + back shows with no scrollbars. Mirrors the Labs preview
// contain-scaling. The sheets keep their fixed mm geometry; we transform them.
function _fitSheets(container) {
  if (!container || typeof window === 'undefined') return;
  const wraps = container.querySelectorAll('.cdx-cert-sheet-wrap');
  if (!wraps.length) return;
  const cs   = window.getComputedStyle(container);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const gap  = parseFloat(cs.rowGap || cs.gap || '0') || 0;
  const n    = wraps.length;
  const availW = Math.max(0, container.clientWidth - padX);
  const availH = Math.max(0, container.clientHeight - padY);
  const scaleW = availW > 0 ? availW / SHEET_PX_W : 1;
  const scaleH = availH > 0 ? (availH - (n - 1) * gap) / (n * SHEET_PX_H) : scaleW;
  const scale  = Math.max(0, Math.min(scaleW, scaleH));
  wraps.forEach((wrap) => {
    const page = wrap.querySelector('.cdx-cert-page');
    if (!page) return;
    page.style.transformOrigin = 'top left';
    page.style.transform = 'scale(' + scale + ')';
    wrap.style.width  = (SHEET_PX_W * scale) + 'px';
    wrap.style.height = (SHEET_PX_H * scale) + 'px';
  });
}

// Scale the single catalog sheet to FILL the pane's width, then let the pane grow
// to the sheet's resulting height: the panel conforms to the image, not the other
// way round, so the whole sheet shows with no cropping and no scrollbar. (The
// fullscreen modal still uses _fitSheets, which CONTAINS within the viewport.)
function _fitSheetWidth(container) {
  if (!container || typeof window === 'undefined') return;
  const wrap = container.querySelector('.cdx-cert-sheet-wrap');
  if (!wrap) return;
  const cs   = window.getComputedStyle(container);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const availW = Math.max(0, container.clientWidth - padX);
  const scale  = availW > 0 ? availW / SHEET_PX_W : 1;
  const page = wrap.querySelector('.cdx-cert-page');
  if (!page) return;
  page.style.transformOrigin = 'top left';
  page.style.transform = 'scale(' + scale + ')';
  wrap.style.width  = (SHEET_PX_W * scale) + 'px';
  wrap.style.height = (SHEET_PX_H * scale) + 'px';
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-certs-shell" id="cdx-certs-shell">' +
      '<div id="cdx-certs-area"></div>' +
    '</div>';
}

// ── Modelos sub-area: master-detail catalog of the 7 templates ────────────────
// Same split shell as the Labs sub-tab (cdx-items-split / cdx-items-list /
// cdx-item-row / cdx-item-preview): the 7 templates list on the left, a live
// front+back preview on the right with the colour-theme picker over it.
function _mountModelos() {
  const area = _q('#cdx-certs-area');
  if (!area) return;

  if (!isTemplate(_selectedTemplate)) _selectedTemplate = CERT_TEMPLATES[0].key;

  area.innerHTML =
    '<div class="cdx-certs-modelos-wrap cdx-labs">' +
      '<div class="cdx-labs-head">' +
        '<h2 class="cdx-labs-title">' + esc(t('certificates.catalog_title')) + '</h2>' +
        '<div class="cdx-labs-hint">' + esc(t('certificates.catalog_hint')) + '</div>' +
      '</div>' +
      '<div class="cdx-items-split cdx-certs-modelos-split">' +
        '<div class="cdx-cert-side">' +
          '<div class="cdx-cert-side-tabs" role="tablist">' +
            '<button type="button" class="cdx-cert-side-tab' + (_activeSide === 'front' ? ' is-active' : '') + '" data-side="front">' + esc(t('certificates.side_front')) + '</button>' +
            '<button type="button" class="cdx-cert-side-tab' + (_activeSide === 'back' ? ' is-active' : '') + '" data-side="back">' + esc(t('certificates.side_back')) + '</button>' +
          '</div>' +
          '<div class="cdx-items-list" id="cdx-certs-tpl-list"></div>' +
        '</div>' +
        '<div class="cdx-item-preview cdx-cert-preview" id="cdx-certs-tpl-preview"></div>' +
      '</div>' +
    '</div>';

  _renderTplList();
  _renderTplPreview();

  const split = area.querySelector('.cdx-certs-modelos-split');
  if (split) {
    const onClick = (e) => {
      const sideTab = e.target.closest('[data-side]');
      if (sideTab) {
        const side = sideTab.dataset.side;
        if (side !== _activeSide) {
          _activeSide = side;
          split.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('is-active', b.dataset.side === side));
          _renderTplList();
          _renderTplPreview();
        }
        return;
      }
      const chip = e.target.closest('.cdx-cert-theme-chip');
      if (chip) {
        _catalogTheme = chip.dataset.theme;
        split.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('is-active', b.dataset.theme === _catalogTheme));
        _renderTplPreview();
        return;
      }
      if (e.target.closest('[data-action="fullscreen"]')) {
        _openCertFullscreen(Object.assign(sampleCert(), { template_slug: _selectedTemplate, theme: _catalogTheme }), _activeSide);
        return;
      }
      const frontRow = e.target.closest('[data-template]');
      if (frontRow) { _selectTemplate(frontRow.dataset.template); return; }
      const backRow = e.target.closest('[data-back]');
      if (backRow) { _selectBack(backRow.dataset.back); return; }
    };
    split.addEventListener('click', onClick);
    _cleanup.push(() => split.removeEventListener('click', onClick));
  }

  const onResize = () => _scaleTplPreview();
  window.addEventListener('resize', onResize);
  _cleanup.push(() => window.removeEventListener('resize', onResize));
}

function _renderTplList() {
  const list = _q('#cdx-certs-tpl-list');
  if (!list) return;
  if (_activeSide === 'back') {
    list.innerHTML = CERT_BACKS.map((b) =>
      '<div class="cdx-item-row' + (b.key === _selectedBack ? ' is-active' : '') + '" data-back="' + esc(b.key) + '">' +
        '<span class="cdx-item-type-icon cdx-cert-tpl-icon">&#9672;</span>' +
        '<div class="cdx-item-info">' +
          '<div class="cdx-item-title">' + esc(t(b.labelKey)) + '</div>' +
          '<div class="cdx-item-sub">' + esc(t(b.descKey)) + '</div>' +
        '</div>' +
      '</div>'
    ).join('');
    return;
  }
  list.innerHTML = CERT_TEMPLATES.map((tpl) =>
    '<div class="cdx-item-row' + (tpl.key === _selectedTemplate ? ' is-active' : '') + '" data-template="' + esc(tpl.key) + '">' +
      '<span class="cdx-item-type-icon cdx-cert-tpl-icon">&#9672;</span>' +
      '<div class="cdx-item-info">' +
        '<div class="cdx-item-title">' + esc(tpl.label) + '</div>' +
        '<div class="cdx-item-sub">' + esc(t('certificates.tpl_desc_' + tpl.key)) + '</div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function _selectTemplate(key) {
  if (!isTemplate(key) || key === _selectedTemplate) return;
  _selectedTemplate = key;
  const list = _q('#cdx-certs-tpl-list');
  if (list) list.querySelectorAll('.cdx-item-row').forEach((r) => r.classList.toggle('is-active', r.dataset.template === key));
  _renderTplPreview();
}

function _selectBack(key) {
  if (key === _selectedBack) return;
  _selectedBack = key;
  const list = _q('#cdx-certs-tpl-list');
  if (list) list.querySelectorAll('.cdx-item-row').forEach((r) => r.classList.toggle('is-active', r.dataset.back === key));
  _renderTplPreview();
}

function _renderTplPreview() {
  const pane = _q('#cdx-certs-tpl-preview');
  if (!pane) return;
  const origin = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const cert   = Object.assign(sampleCert(), { template_slug: _selectedTemplate, theme: _catalogTheme });

  let title, desc;
  if (_activeSide === 'back') {
    const b = CERT_BACKS.find((x) => x.key === _selectedBack) || CERT_BACKS[0];
    title = t(b.labelKey); desc = t(b.descKey);
  } else {
    const tpl = CERT_TEMPLATES.find((x) => x.key === _selectedTemplate) || CERT_TEMPLATES[0];
    title = tpl.label; desc = t('certificates.tpl_desc_' + tpl.key);
  }

  pane.innerHTML =
    '<div class="cdx-preview-head cdx-cert-preview-head">' +
      '<div class="cdx-preview-head-info">' +
        '<div class="cdx-preview-title">' + esc(title) + '</div>' +
        '<span class="cdx-preview-type">' + esc(desc) + '</span>' +
      '</div>' +
      '<div class="cdx-preview-actions">' +
        '<div class="cdx-cert-theme-picker">' +
          '<span class="cdx-cert-theme-label">' + esc(t('certificates.theme')) + '</span>' +
          CERT_THEMES.map((th) =>
            '<button type="button" class="cdx-cert-theme-chip' + (th.key === _catalogTheme ? ' is-active' : '') + '" ' +
              'data-theme="' + esc(th.key) + '">' + esc(t('certificates.theme_' + th.key)) + '</button>'
          ).join('') +
        '</div>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-action="fullscreen">' + esc(t('certificates.fullscreen')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-preview-body cdx-cert-preview-body" id="cdx-certs-tpl-preview-body">' +
      _previewSheetsHtml(cert, origin, _activeSide) +
    '</div>';

  const body = _q('#cdx-certs-tpl-preview-body');
  if (body) hydrate(body, { qr: generateQrSvg, qrUrl: buildValidarUrl(origin, cert.code) });
  _scaleTplPreview();
  // Refit once the pane has its final laid-out size (first mount can run before layout).
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(_scaleTplPreview);
}

// Wrap one (or both) sheets in a sized box so the fixed-mm sheet can be
// transform-scaled. `side` selects 'front' | 'back' | (default) both — the
// catalog shows the one selected side; the Emitidos fullscreen still shows both.
function _previewSheetsHtml(cert, origin, side) {
  const d  = buildCertData(cert, parseCertMeta(cert), origin);
  const tk = certTemplateKey(cert);
  const th = certThemeKey(cert);
  const front = '<div class="cdx-cert-sheet-wrap">' + renderFrontPage(tk, th, d) + '</div>';
  const back  = '<div class="cdx-cert-sheet-wrap">' + renderBackPage(th, d) + '</div>';
  if (side === 'front') return front;
  if (side === 'back')  return back;
  return front + back;
}

function _scaleTplPreview() { _fitSheetWidth(_q('#cdx-certs-tpl-preview-body')); }

// ── Emitidos sub-area ─────────────────────────────────────────────────────────
function _mountEmitidos() {
  const area = _q('#cdx-certs-area');
  if (!area) return;

  area.innerHTML =
    '<div class="cdx-emissao">' +
      '<div class="cdx-emissao-kpis" id="cdx-emissao-kpis"></div>' +
      '<div class="cdx-certs-toolbar">' +
        '<input type="search" class="cdx-certs-search" id="cdx-certs-search" placeholder="' + esc(t('certificates.search_ph')) + '">' +
        '<select id="cdx-certs-filter-client" class="cdx-certs-select">' +
          '<option value="">' + esc(t('certificates.filter_all_clients')) + '</option>' +
        '</select>' +
        '<select id="cdx-certs-filter-turma" class="cdx-certs-select" disabled>' +
          '<option value="">' + esc(t('certificates.filter_all_turmas')) + '</option>' +
        '</select>' +
        '<label class="cdx-certs-datelabel">' + esc(t('certificates.filter_date_from')) +
          '<input type="date" id="cdx-certs-filter-from" class="cdx-certs-date" aria-label="' + esc(t('certificates.filter_date_from')) + '">' +
        '</label>' +
        '<label class="cdx-certs-datelabel">' + esc(t('certificates.filter_date_to')) +
          '<input type="date" id="cdx-certs-filter-to" class="cdx-certs-date" aria-label="' + esc(t('certificates.filter_date_to')) + '">' +
        '</label>' +
        '<span class="cdx-emissao-spacer"></span>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-certs-issue-btn">' + esc(t('certificates.issue_btn')) + '</button>' +
      '</div>' +
      // Bulk-action bar: inline, between the toolbar and the table (revealed when
      // rows are selected), so it follows the theme and never floats over content.
      '<div class="cdx-emissao-bulk" id="cdx-emissao-bulk">' +
        '<b id="cdx-emissao-bulk-count"></b>' +
        '<button class="cdx-btn cdx-btn-sm" data-bulk="sign">' + esc(t('certificates.bulk_sign')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-bulk="send">' + esc(t('certificates.bulk_send')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-bulk="pdf">' + esc(t('certificates.bulk_pdf')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm" data-bulk="revoke">' + esc(t('certificates.bulk_revoke')) + '</button>' +
        '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-bulk="delete">' + esc(t('certificates.bulk_delete')) + '</button>' +
        '<span class="cdx-emissao-spacer"></span>' +
        '<button class="cdx-btn cdx-btn-sm" data-bulk="clear">' + esc(t('certificates.bulk_clear')) + '</button>' +
      '</div>' +
      '<div class="cdx-emissao-tablewrap" id="cdx-certs-list">' +
        '<div class="cdx-empty">' + esc(t('certificates.loading')) + '</div>' +
      '</div>' +
    '</div>';

  _loadCertList();
  _loadFilters();

  // Wire toolbar
  const searchEl = _q('#cdx-certs-search');
  if (searchEl) {
    const onInput = () => { _filterQ = searchEl.value; _selectedCodes.clear(); _refreshEmissao(); };
    searchEl.addEventListener('input', onInput);
    _cleanup.push(() => searchEl.removeEventListener('input', onInput));
  }
  const clientEl = _q('#cdx-certs-filter-client');
  if (clientEl) {
    const onChange = () => {
      _filterClientSlug = clientEl.value;
      _filterTurmaId = '';
      _selectedCodes.clear();
      _populateTurmaFilter(_filterClientSlug);
      _refreshEmissao();
    };
    clientEl.addEventListener('change', onChange);
    _cleanup.push(() => clientEl.removeEventListener('change', onChange));
  }
  const turmaEl = _q('#cdx-certs-filter-turma');
  if (turmaEl) {
    const onChange = () => { _filterTurmaId = turmaEl.value; _selectedCodes.clear(); _refreshEmissao(); };
    turmaEl.addEventListener('change', onChange);
    _cleanup.push(() => turmaEl.removeEventListener('change', onChange));
  }
  const fromEl = _q('#cdx-certs-filter-from');
  if (fromEl) {
    const onChange = () => { _filterDateFrom = fromEl.value; _selectedCodes.clear(); _refreshEmissao(); };
    fromEl.addEventListener('change', onChange);
    _cleanup.push(() => fromEl.removeEventListener('change', onChange));
  }
  const toEl = _q('#cdx-certs-filter-to');
  if (toEl) {
    const onChange = () => { _filterDateTo = toEl.value; _selectedCodes.clear(); _refreshEmissao(); };
    toEl.addEventListener('change', onChange);
    _cleanup.push(() => toEl.removeEventListener('change', onChange));
  }
  // KPI cards double as status filters (toggle).
  const kpis = _q('#cdx-emissao-kpis');
  if (kpis) {
    const onClick = (e) => {
      const card = e.target.closest('[data-status]');
      if (!card) return;
      _filterStatus = (_filterStatus === card.dataset.status) ? '' : card.dataset.status;
      _selectedCodes.clear();
      _refreshEmissao();
    };
    kpis.addEventListener('click', onClick);
    _cleanup.push(() => kpis.removeEventListener('click', onClick));
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
      const th = e.target.closest('[data-sort]');
      if (th) { _toggleSort(th.dataset.sort); return; }
      if (e.target.closest('#cdx-emissao-selall')) { _selectAllVisible(e.target.checked); return; }
      const cb = e.target.closest('input[data-sel]');
      if (cb) { _toggleSel(cb.dataset.sel); return; }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const code   = btn.dataset.code;
      if (action === 'copy-url')  { _copyValidarUrl(code); return; }
      if (action === 'revoke')    { _revokeConfirm(code);  return; }
      if (action === 'delete')    { _deleteConfirm(code);  return; }
      if (action === 'sign')      { _markSigned(code);     return; }
      if (action === 'mark-sent') { _markSent(code);       return; }
      if (action === 'preview')   { _previewCert(code);    return; }
      if (action === 'pdf')       { const cert = _certs.find((x) => x.code === code); if (cert) _printCert(cert); return; }
    };
    list.addEventListener('click', onClick);
    _cleanup.push(() => list.removeEventListener('click', onClick));
  }
  const bulk = _q('#cdx-emissao-bulk');
  if (bulk) {
    const onClick = (e) => {
      const b = e.target.closest('[data-bulk]');
      if (b) _bulkAction(b.dataset.bulk);
    };
    bulk.addEventListener('click', onClick);
    _cleanup.push(() => bulk.removeEventListener('click', onClick));
  }
}

// The filtered set (client → cohort + name + optional status), shared by the KPI
// counts (status excluded) and the table (status included), then sorted.
function _emissaoFiltered(withStatus) {
  const clientTurmaIds = _filterClientSlug
    ? (_turmasByClient[_filterClientSlug] || []).map((tm) => tm.id)
    : null;
  return filterCerts(_certs, {
    turma_id:  _filterTurmaId,
    turma_ids: clientTurmaIds,
    status:    withStatus ? _filterStatus : '',
    q:         _filterQ,
    date_from: _filterDateFrom,
    date_to:   _filterDateTo,
  });
}

function _sortCerts(list) {
  const dir = _sortDir === 'asc' ? 1 : -1;
  const val = (c) => {
    switch (_sortKey) {
      case 'code':   return (c.code || '').toLowerCase();
      case 'holder': return (c.holder_name || '').toLowerCase();
      case 'client': { const tm = _turmaIndex[String(c.turma_id)]; return (tm ? _clientName(tm.client_slug) : '').toLowerCase(); }
      case 'turma':  return _turmaName(_turmaIndex[String(c.turma_id)]).toLowerCase();
      case 'course': return (c.course_title || '').toLowerCase();
      case 'issued': return c.issued_on || '';
      case 'status': return c.status || '';
      default:       return c.created_at || c.id || 0;
    }
  };
  return list.slice().sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
}

function _toggleSort(key) {
  if (_sortKey === key) _sortDir = (_sortDir === 'asc' ? 'desc' : 'asc');
  else { _sortKey = key; _sortDir = 'asc'; }
  _renderCertList();
}

function _refreshEmissao() { _renderKpis(); _renderCertList(); _syncBulk(); }

// KPI cards = status counts over the current client/turma/search set (status
// excluded), each clickable to filter the table by that status.
const _KPIS = [
  { s: 'issued',  k: 'certificates.kpi_awaiting_sign' },
  { s: 'signed',  k: 'certificates.kpi_awaiting_send' },
  { s: 'sent',    k: 'certificates.kpi_sent' },
  { s: 'revoked', k: 'certificates.kpi_revoked' },
];
function _renderKpis() {
  const el = _q('#cdx-emissao-kpis');
  if (!el) return;
  const base = _emissaoFiltered(false);
  el.innerHTML = _KPIS.map((c) => {
    const n = base.filter((x) => x.status === c.s).length;
    return '<button type="button" class="cdx-emissao-kpi cdx-emissao-kpi--' + c.s + (_filterStatus === c.s ? ' is-active' : '') + '" data-status="' + c.s + '">' +
      '<span class="cdx-emissao-kpi-n">' + n + '</span>' +
      '<span class="cdx-emissao-kpi-l">' + esc(t(c.k)) + '</span>' +
    '</button>';
  }).join('');
}

function _toggleSel(code) {
  if (_selectedCodes.has(code)) _selectedCodes.delete(code); else _selectedCodes.add(code);
  _renderCertList(); _syncBulk();
}
function _selectAllVisible(on) {
  const visible = _emissaoFiltered(true);
  visible.forEach((c) => { if (on) _selectedCodes.add(c.code); else _selectedCodes.delete(c.code); });
  _renderCertList(); _syncBulk();
}
function _syncBulk() {
  const bar = _q('#cdx-emissao-bulk');
  if (!bar) return;
  const n = _selectedCodes.size;
  bar.classList.toggle('is-on', n > 0);
  const c = _q('#cdx-emissao-bulk-count');
  if (c) c.textContent = t('certificates.bulk_count').replace('{n}', String(n));
}
async function _bulkAction(kind) {
  if (kind === 'clear') { _selectedCodes.clear(); _renderCertList(); _syncBulk(); return; }
  const codes = Array.from(_selectedCodes);
  if (!codes.length) return;
  if (kind === 'pdf') { _bulkPdf(codes); return; }
  if (kind === 'delete') { _bulkDeleteConfirm(codes); return; }
  // Sign/send aren't real yet — don't record a false signed/sent state in bulk either.
  if (kind === 'sign') { notice.warn(t('certificates.sign_not_wired')); return; }
  if (kind === 'send') { notice.warn(t('certificates.send_not_wired')); return; }
  try {
    for (const code of codes) {
      if (kind === 'revoke') await api.revoke({ code });
    }
    notice.ok(t('certificates.bulk_done').replace('{n}', String(codes.length)));
    _selectedCodes.clear();
    await _loadCertList();
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: bulk ' + kind + ': ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
  }
}

async function _loadCertList() {
  const listEl = _q('#cdx-certs-list');
  if (listEl) listEl.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.loading')) + '</div>';
  try {
    const res = await api.list({});
    _certs = (res && res.certificates) || [];
    _refreshEmissao();
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: list: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
    if (_q('#cdx-certs-list')) _q('#cdx-certs-list').innerHTML = '<div class="cdx-empty">' + esc(t('certificates.error_loading')) + '</div>';
  }
}

// Load the filter sources: clients (for the client picker + name resolution) and
// EVERY turma (to cascade client→cohorts and resolve each cert's turma_id to its
// cohort + client for the table columns).
async function _loadFilters() {
  try {
    const [cRes, tRes] = await Promise.all([
      cohortsApi.listClients(),
      cohortsApi.listAllTurmas(),
    ]);
    _clients = (cRes && cRes.clients) || [];
    const turmas = (tRes && tRes.turmas) || [];
    _turmaIndex = {};
    _turmasByClient = {};
    turmas.forEach((tm) => {
      _turmaIndex[String(tm.id)] = tm;
      const cs = tm.client_slug || '';
      (_turmasByClient[cs] = _turmasByClient[cs] || []).push(tm);
    });
    _populateClientFilter();
    _refreshEmissao(); // re-render so the Client/Cohort columns + KPI counts resolve
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: load filters: ' + (e && e.message || e), 'error');
  }
}

function _clientName(slug) {
  const c = _clients.find((x) => x.slug === slug);
  return c ? (c.display_name || c.name || slug) : (slug || '');
}
function _turmaName(turma) {
  return turma ? (turma.display_name || turma.name || String(turma.id)) : '';
}

function _populateClientFilter() {
  const sel = _q('#cdx-certs-filter-client');
  if (!sel) return;
  const opts = _clients.slice().sort((a, b) =>
    (a.display_name || a.name || '').localeCompare(b.display_name || b.name || ''));
  sel.innerHTML =
    '<option value="">' + esc(t('certificates.filter_all_clients')) + '</option>' +
    opts.map((c) => '<option value="' + esc(c.slug) + '"' + (c.slug === _filterClientSlug ? ' selected' : '') + '>' +
      esc(c.display_name || c.name) + '</option>').join('');
}

function _populateTurmaFilter(clientSlug) {
  const sel = _q('#cdx-certs-filter-turma');
  if (!sel) return;
  const turmas = (clientSlug && _turmasByClient[clientSlug]) ? _turmasByClient[clientSlug].slice() : [];
  turmas.sort((a, b) => _turmaName(a).localeCompare(_turmaName(b)));
  sel.innerHTML =
    '<option value="">' + esc(t('certificates.filter_all_turmas')) + '</option>' +
    turmas.map((tm) => '<option value="' + esc(String(tm.id)) + '">' + esc(_turmaName(tm)) + '</option>').join('');
  sel.disabled = !clientSlug;
}

function _renderCertList() {
  const listEl = _q('#cdx-certs-list');
  if (!listEl) return;
  const visible = _sortCerts(_emissaoFiltered(true));
  if (!visible.length) {
    listEl.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.empty')) + '</div>';
    return;
  }
  const allSel = visible.every((c) => _selectedCodes.has(c.code));
  const arrow = (k) => (_sortKey === k ? ' <span class="cdx-emissao-sort">' + (_sortDir === 'asc' ? '▲' : '▼') + '</span>' : '');
  const th = (k, key) => '<th data-sort="' + k + '" class="cdx-emissao-th' + (_sortKey === k ? ' is-sorted' : '') + '">' + esc(t(key)) + arrow(k) + '</th>';
  listEl.innerHTML =
    '<table class="cdx-certs-table cdx-emissao-table">' +
      '<thead><tr>' +
        '<th class="cdx-emissao-cbcol"><input type="checkbox" id="cdx-emissao-selall"' + (allSel ? ' checked' : '') + '></th>' +
        th('code',   'certificates.col_code') +
        th('holder', 'certificates.col_holder') +
        th('client', 'certificates.col_client') +
        th('turma',  'certificates.col_turma') +
        th('course', 'certificates.col_course') +
        th('issued', 'certificates.col_date') +
        th('status', 'certificates.col_status') +
        '<th>' + esc(t('certificates.col_actions')) + '</th>' +
      '</tr></thead>' +
      '<tbody>' + visible.map((c) => _renderCertRow(c)).join('') + '</tbody>' +
    '</table>';
}

function _renderCertRow(c) {
  const validarUrl = buildValidarUrl(
    (typeof location !== 'undefined' ? location.origin : ''),
    c.code
  );
  const hasPdf = !!(c.pdf_path);
  const turma = _turmaIndex[String(c.turma_id)];
  const clientLabel = turma ? _clientName(turma.client_slug) : '';
  const turmaLabel  = _turmaName(turma);
  const sel = _selectedCodes.has(c.code);
  // Lifecycle next-step button: issued -> assinar, signed -> enviar.
  let nextBtn = '';
  if (c.status === 'issued') nextBtn = '<button class="cdx-btn cdx-btn-sm" data-action="sign" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_sign')) + '</button>';
  else if (c.status === 'signed') nextBtn = '<button class="cdx-btn cdx-btn-sm" data-action="mark-sent" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_send')) + '</button>';
  return '<tr' + (sel ? ' class="is-selected"' : '') + '>' +
    '<td class="cdx-emissao-cbcol"><input type="checkbox" data-sel="' + esc(c.code) + '"' + (sel ? ' checked' : '') + '></td>' +
    '<td class="cdx-certs-code"><code>' + esc(c.code) + '</code></td>' +
    '<td>' + esc(c.holder_name || '') + '</td>' +
    '<td>' + esc(clientLabel || '—') + '</td>' +
    '<td>' + esc(turmaLabel || '—') + '</td>' +
    '<td>' + esc(c.course_title || '') + '</td>' +
    '<td>' + esc(formatIssuedOn(c.issued_on)) + '</td>' +
    '<td><span class="' + statusBadgeClass(c.status) + '">' + esc(t('certificates.status_' + c.status) || c.status) + '</span></td>' +
    '<td class="cdx-certs-actions">' +
      nextBtn +
      '<button class="cdx-btn cdx-btn-sm" data-action="preview" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_preview')) + '</button>' +
      '<button class="cdx-btn cdx-btn-sm" data-action="copy-url" data-code="' + esc(c.code) + '" title="' + esc(validarUrl) + '">' + esc(t('certificates.action_copy_url')) + '</button>' +
      // Every row can produce its PDF (print → Salvar como PDF), independent of a
      // stored file. When a signed PDF is attached later, link that instead.
      (hasPdf
        ? '<a class="cdx-btn cdx-btn-sm" href="' + esc(c.pdf_path) + '" target="_blank" rel="noopener">' + esc(t('certificates.action_download_pdf')) + '</a>'
        : '<button class="cdx-btn cdx-btn-sm" data-action="pdf" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_download_pdf')) + '</button>') +
      (c.status !== 'revoked' ? '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="revoke" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_revoke')) + '</button>' : '') +
      // Delete is offered while issued (an issue-by-mistake that never left the
      // building) OR revoked (clearing an already-invalidated record). A signed/sent
      // cert must be revoked first; revoke keeps the audit record.
      (c.status === 'issued' || c.status === 'revoked' ? '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="delete" data-code="' + esc(c.code) + '">' + esc(t('certificates.action_delete')) + '</button>' : '') +
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

function _deleteConfirm(code) {
  const html =
    '<div class="cdx-modal" style="max-width:400px">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.delete_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + esc(t('certificates.delete_msg').replace('{code}', code)) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-del-cancel">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-del-confirm">' + esc(t('certificates.action_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-del-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-del-confirm').addEventListener('click', async () => {
    closeModal(bd);
    try {
      await api.remove({ code });
      notice.ok(t('certificates.deleted_ok'));
      await _loadCertList();
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: delete: ' + (e && e.message || e), 'error');
      // Surface the worker's guard rather than a generic error.
      const code2 = e && e.data && e.data.error;
      notice.error(code2 === 'only_issued_or_revoked_deletable' ? t('certificates.delete_only_issued') : t('certificates.error_loading'));
    }
  });
}

// Bulk delete: only 'issued' and 'revoked' certs are deletable; 'signed'/'sent'
// must be revoked first. We delete the deletable ones and report how many were
// blocked, so a mixed selection does a partial delete with a clear count instead
// of erroring out on the first non-deletable code.
function _bulkDeleteConfirm(codes) {
  const deletable = codes.filter((code) => {
    const c = _certs.find((x) => x.code === code);
    return c && (c.status === 'issued' || c.status === 'revoked');
  });
  const blocked = codes.length - deletable.length;
  if (!deletable.length) { notice.warn(t('certificates.delete_none_deletable')); return; }
  const msg = t('certificates.bulk_delete_msg').replace('{n}', String(deletable.length)) +
    (blocked > 0 ? ' ' + t('certificates.bulk_delete_blocked_note').replace('{n}', String(blocked)) : '');
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.bulk_delete_title')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + esc(msg) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-bdel-cancel">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-bdel-confirm">' + esc(t('certificates.action_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-bdel-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-bdel-confirm').addEventListener('click', async () => {
    closeModal(bd);
    let done = 0;
    try {
      for (const code of deletable) { await api.remove({ code }); done++; }
      notice.ok(t('certificates.bulk_deleted_ok').replace('{n}', String(done)));
      if (blocked > 0) notice.warn(t('certificates.bulk_delete_blocked').replace('{n}', String(blocked)));
      _selectedCodes.clear();
      await _loadCertList();
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: bulk delete: ' + (e && e.message || e), 'error');
      notice.error(t('certificates.error_loading'));
    }
  });
}

// Sign + send are NOT wired to the real digital signature / email yet. Until they
// are, the action must NOT complete: flipping status to signed/sent would assert
// something false (a real ICP-Brasil signature / a real email) that didn't happen.
// We surface a clear notice and change nothing. (cert_mark_signed/cert_mark_sent
// stay in the facade for when the real flows land.)
async function _markSigned(code) {
  notice.warn(t('certificates.sign_not_wired'));
}

async function _markSent(code) {
  notice.warn(t('certificates.send_not_wired'));
}

// ── Preview + print ───────────────────────────────────────────────────────────
function _previewCert(code) {
  const cert = _certs.find((c) => c.code === code);
  if (!cert) return;
  _openCertFullscreen(cert);
}

// Open the certificate (a saved row or a catalog sample) FULLSCREEN: the real
// front + back scaled to fit the viewport, a print → PDF action and a close (×)
// at the top-right. Mirrors the Labs fullscreen viewer (CVLabViewer): a fixed
// dark overlay, Escape / backdrop-click / × to dismiss.
function _openCertFullscreen(cert, side) {
  const origin  = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const overlay = document.createElement('div');
  overlay.className = 'cdx-cert-fs-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML =
    '<div class="cdx-cert-fs-actions">' +
      '<button type="button" class="cdx-cert-fs-btn" data-action="print">' + esc(t('certificates.print')) + '</button>' +
      '<button type="button" class="cdx-cert-fs-close" aria-label="' + esc(t('certificates.cancel')) + '">&times;</button>' +
    '</div>' +
    '<div class="cdx-cert-fs-body" id="cdx-cert-fs-body">' + _previewSheetsHtml(cert, origin, side) + '</div>';
  document.body.appendChild(overlay);

  const body = overlay.querySelector('#cdx-cert-fs-body');
  hydrate(body, { qr: generateQrSvg, qrUrl: buildValidarUrl(origin, cert.code) });

  const fit = () => _fitSheets(body);
  fit();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fit);

  // Capture-phase + stopPropagation so Escape closes ONLY this overlay — when the
  // preview is opened over the issue modal, the modal's own Escape handler must
  // not also fire (which would discard the form).
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); destroy(); } };
  function destroy() {
    document.removeEventListener('keydown', onKey, true);
    if (typeof window !== 'undefined') window.removeEventListener('resize', fit);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
  overlay.querySelector('.cdx-cert-fs-close').addEventListener('click', destroy);
  overlay.querySelector('[data-action="print"]').addEventListener('click', () => _printCert(cert));
  document.addEventListener('keydown', onKey, true);
  if (typeof window !== 'undefined') window.addEventListener('resize', fit);
}

function _printCert(cert) {
  _printCerts([cert], 'Certificado ' + (cert.code || ''));
}

// Build ONE print document from N certs (each its own front+back pages, separated
// by buildPrintDocument's .cdx-cert-page page-breaks) and open the print → "Save
// as PDF" dialog once. The single-cert print is just N=1. Each cert is hydrated
// with its OWN QR before concatenation.
function _printCerts(certs, title) {
  const origin = (typeof location !== 'undefined' ? location.origin : 'https://pensoia.com');
  const parts = [];
  for (const cert of certs) {
    if (!cert) continue;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderCertHtml(cert, origin);
    hydrate(tmp, { qr: generateQrSvg, qrUrl: buildValidarUrl(origin, cert.code) });
    parts.push(tmp.innerHTML);
  }
  if (!parts.length) return;
  const doc = buildPrintDocument({ cssHref: CERT_CSS_HREF, bodyHtml: parts.join(''), title: title || 'Certificados' });
  const w = window.open('', '_blank');
  if (!w) { notice.warn(t('certificates.print_blocked')); return; }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  w.onload = () => { try { w.focus(); w.print(); } catch (_) {} };
}

// Bulk "Baixar PDF": print every selected cert in one document (one Save-as-PDF).
function _bulkPdf(codes) {
  const certs = codes.map((code) => _certs.find((c) => c.code === code)).filter(Boolean);
  if (!certs.length) return;
  _printCerts(certs, t('certificates.bulk_pdf_title').replace('{n}', String(certs.length)));
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
      '<div class="cdx-cert-issue-previewrow">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" id="cdx-issue-preview">' + esc(t('certificates.issue_preview_btn')) + '</button>' +
        '<small class="cdx-field-hint">' + esc(t('certificates.issue_preview_hint')) + '</small>' +
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

  // Preview the chosen model + theme with the form's current data, before issuing.
  const previewBtn = bd.querySelector('#cdx-issue-preview');
  if (previewBtn) previewBtn.addEventListener('click', () => {
    _openCertFullscreen(_buildIssuePreviewCert(bd, bd.querySelector('#cdx-issue-client')));
  });

  const clientSel = bd.querySelector('#cdx-issue-client');
  const turmaSel  = bd.querySelector('#cdx-issue-turma');
  // Full turmas (with the course-instance fields from ct_list_turmas) for the
  // auto-fill, and the currently-selected one (for capturing course dates at
  // submit). Fetched fresh — the _turmasByClient cache lacks the new columns.
  let _issueTurmas = [];
  let _issueTurma = null;

  clientSel.addEventListener('change', async () => {
    const slug = clientSel.value;
    turmaSel.innerHTML = '<option value="">' + esc(t('certificates.issue_select_turma')) + '</option>';
    turmaSel.disabled = true;
    _issueTurmas = [];
    _issueTurma = null;
    const rosterWrap = bd.querySelector('#cdx-issue-roster-wrap');
    if (rosterWrap) rosterWrap.style.display = 'none';
    if (!slug) return;
    try {
      const res = await cohortsApi.listTurmas({ client_slug: slug });
      _issueTurmas = (res && res.turmas) || [];
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: issue: listTurmas: ' + (e && e.message || e), 'error');
    }
    const turmas = _issueTurmas;
    turmas.slice()
      .sort((a, b) => _turmaName(a).localeCompare(_turmaName(b)))
      .forEach((turma) => {
        const opt = document.createElement('option');
        opt.value = String(turma.id);
        opt.textContent = _turmaName(turma);
        turmaSel.appendChild(opt);
      });
    turmaSel.disabled = !turmas.length;
    if (!turmas.length && window.bsLog) window.bsLog('certs: issue: no cohorts for client ' + slug, 'error');
  });

  turmaSel.addEventListener('change', async () => {
    const turmaId = turmaSel.value;
    const rosterWrap = bd.querySelector('#cdx-issue-roster-wrap');
    const rosterEl   = bd.querySelector('#cdx-issue-roster');
    if (!turmaId) { if (rosterWrap) rosterWrap.style.display = 'none'; _issueTurma = null; return; }
    // Pull the course/instance data from the turma into the form (the promise:
    // pick a turma, the certificate fields fill themselves).
    _issueTurma = _issueTurmas.find((tt) => String(tt.id) === String(turmaId)) || null;
    if (_issueTurma) _autofillIssueFromTurma(bd, _issueTurma);
    if (rosterEl) rosterEl.innerHTML = '<span class="cdx-empty">' + esc(t('certificates.loading')) + '</span>';
    if (rosterWrap) rosterWrap.style.display = '';
    try {
      const res = await cohortsApi.listParticipants({ turma_id: parseInt(turmaId, 10) });
      _issueParticipants = (res && res.participants) || [];
      _issueSelectedIds = new Set(_issueParticipants.map((p) => p.id));
      if (rosterEl) rosterEl.innerHTML = _issueParticipants.length
        ? '<label class="cdx-cert-roster-row cdx-cert-roster-all">' +
            '<input type="checkbox" id="cdx-issue-selall" checked>' +
            '<span class="cdx-cert-roster-allk">' + esc(t('certificates.issue_select_all')) + '</span>' +
          '</label>' +
          _issueParticipants.map((p) =>
            '<label class="cdx-cert-roster-row">' +
              '<input type="checkbox" data-pid="' + esc(String(p.id)) + '" ' + (_issueSelectedIds.has(p.id) ? 'checked' : '') + '>' +
              '<span>' + esc(p.name) + (p.email ? ' <span class="cdx-cert-roster-email">(' + esc(p.email) + ')</span>' : '') + '</span>' +
            '</label>'
          ).join('')
        : '<span class="cdx-empty">' + esc(t('certificates.issue_no_participants')) + '</span>';
      if (rosterEl && _issueParticipants.length) {
        const selAll = rosterEl.querySelector('#cdx-issue-selall');
        const cbs = Array.from(rosterEl.querySelectorAll('input[data-pid]'));
        const syncAll = () => { if (selAll) selAll.checked = cbs.length > 0 && cbs.every((cb) => cb.checked); };
        cbs.forEach((cb) => {
          cb.addEventListener('change', () => {
            const pid = parseInt(cb.dataset.pid, 10);
            if (cb.checked) _issueSelectedIds.add(pid);
            else _issueSelectedIds.delete(pid);
            syncAll();
          });
        });
        if (selAll) selAll.addEventListener('change', () => {
          cbs.forEach((cb) => {
            cb.checked = selAll.checked;
            const pid = parseInt(cb.dataset.pid, 10);
            if (selAll.checked) _issueSelectedIds.add(pid); else _issueSelectedIds.delete(pid);
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
    // Freeze the course period (start/end dates) from the turma into the snapshot.
    if (_issueTurma) {
      if (_issueTurma.date_start) meta.course_start = _issueTurma.date_start;
      if (_issueTurma.date_end) meta.course_end = _issueTurma.date_end;
    }

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

    // Lock the button for the whole in-flight request so a double-click can't
    // fire two issue calls (which could both pass the backend dup-guard before
    // the first cert commits). Restored in finally; the backend guard then
    // covers any deliberate re-click.
    const submitBtn = bd.querySelector('#cdx-issue-submit');
    const prevLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = t('certificates.issue_submitting'); }
    try {
      const res = await api.issue(payload);
      const codes = (res && res.codes) || (res && res.certificates && res.certificates.map((c) => c.code)) || [];
      // The backend dup-guard returns the participants that already had an active
      // cert (so we didn't re-issue). Surface them instead of silently dropping.
      const skipped = (res && res.skipped) || [];
      const resultEl = bd.querySelector('#cdx-issue-result');
      if (resultEl) {
        resultEl.style.display = '';
        resultEl.innerHTML =
          '<div class="cdx-cert-issue-result">' +
            '<strong>' + esc(t('certificates.issue_result_title')) + '</strong>' +
            '<ul>' + codes.map((code) => '<li><code>' + esc(code) + '</code></li>').join('') + '</ul>' +
            (skipped.length
              ? '<div class="cdx-cert-issue-skipped">' +
                  '<strong>' + esc(t('certificates.issue_skipped_title').replace('{n}', String(skipped.length))) + '</strong>' +
                  '<ul>' + skipped.map((s) => '<li>' + esc((s && (s.holder_name || s.code)) || '') + '</li>').join('') + '</ul>' +
                '</div>'
              : '') +
          '</div>';
      }
      notice.ok(t('certificates.issued_ok').replace('{n}', String(codes.length)));
      if (skipped.length) notice.warn(t('certificates.issue_skipped_toast').replace('{n}', String(skipped.length)));
      await _loadCertList();
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: issue: ' + (e && e.message || e), 'error');
      notice.error(t('certificates.error_loading'));
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prevLabel; }
    }
  });
}

// Auto-fill the issue form from the selected turma (decision: emissão pulls from
// the turma, nothing retyped). Overwrites the auto-fillable fields with the
// turma's values when present; the user can still adjust before issuing. The
// nested ementa flattens into the modules textarea as "title :: description"
// lines (what parseModulesText reads at submit).
function _autofillIssueFromTurma(bd, turma) {
  const set = (sel, val) => {
    const el = bd.querySelector(sel);
    if (el && val != null && String(val).trim()) el.value = String(val);
  };
  set('#cdx-issue-course', turma.course_title);
  set('#cdx-issue-hours', turma.hours);
  set('#cdx-issue-place', turma.place);
  set('#cdx-issue-meetings', turma.meetings);
  set('#cdx-issue-format', turma.format ? t('cohorts.fmt_' + turma.format) : '');
  set('#cdx-issue-modality', turma.modality ? t('cohorts.mod_' + turma.modality) : '');
  const modsEl = bd.querySelector('#cdx-issue-modules');
  if (modsEl && turma.ementa_json) {
    const certMods = ementaToCertModules(turma.ementa_json);
    if (certMods.length) modsEl.value = certMods.map((m) => (m.d ? m.t + ' :: ' + m.d : m.t)).join('\n');
  }
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

// Build a certificate-shaped object from the issue form's current values so the
// chosen model + theme can be previewed exactly as it will be issued. Empty
// course/holder fall back to sample text so the preview is never blank. The code
// is a sample placeholder (no real cert is created by previewing).
function _buildIssuePreviewCert(bd, clientSel) {
  const get = (sel) => { const el = bd.querySelector(sel); return el ? String(el.value || '').trim() : ''; };
  let holder = '';
  const firstId = Array.from(_issueSelectedIds)[0];
  if (firstId != null) {
    const p = _issueParticipants.find((x) => x.id === firstId);
    if (p) holder = p.name;
  }
  const meta = _gatherVersoMeta(bd, clientSel);
  return {
    holder_name:  holder || t('certificates.preview_sample_name'),
    course_title: get('#cdx-issue-course') || t('certificates.preview_sample_course'),
    hours:        get('#cdx-issue-hours'),
    issued_on:    get('#cdx-issue-date'),
    issuer:       get('#cdx-issue-issuer'),
    code:         'PREVIEW000',
    template_slug: get('#cdx-issue-template'),
    theme:         get('#cdx-issue-theme'),
    meta_json:     JSON.stringify(meta),
  };
}

// ── Tab contract ──────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  ctx = ctx || {};
  _activeSub = _resolveSub(ctx.sub);
  _cleanup = [];
  _catalogTheme = 'duo';
  _selectedTemplate = 'vetor';
  _certs = [];
  _filterClientSlug = '';
  _filterTurmaId = '';
  _filterStatus  = '';
  _filterQ       = '';
  _clients       = [];
  _turmaIndex    = {};
  _turmasByClient = {};
  _issueParticipants = [];
  _issueSelectedIds  = new Set();
  _sortKey = 'created';
  _sortDir = 'desc';
  _selectedCodes = new Set();

  _renderShell();

  if (_activeSub === 'modelos') _mountModelos();
  else _mountEmitidos();
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) {} });
  _cleanup = [];
  document.querySelectorAll('.cdx-modal-backdrop, .cdx-cert-fs-overlay').forEach((el) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _certs = [];
}
