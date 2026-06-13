// certificates/certificates.js
// Codex Certificados tab: Modelos (template editor) | Emitidos (registry + issue flow).
//
// Architecture mirrors questions/questions.js: exports SUBTABS, subtabs(), mount(),
// unmount(). Each sub-area is handled inline (no separate sub-modules) to keep
// the file self-contained while respecting the module boundary rules.
//
// Sealed boundary: this module IS allowed to import from content/slides/js/ because
// modules.test.mjs ALLOWED_CROSS_TAB includes it (see the allowance added below).
// It mirrors exactly how content/slides.js accesses the editor.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../backstage/js/api-client.js)
//   window.bsLog        (../backstage/js/debug.js)

import { certificates as api, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as notice from '../js/notice.js';
import {
  CERT_TOKENS,
  listTemplates,
  createTemplate,
  removeTemplate,
  mountTemplateEditor,
} from './cert-template.js';
import * as editor from '../content/slides/js/app.js';
import { newDeck } from '../content/slides/js/core/deck.js';
import { makeWorkerAi } from '../content/slides/js/ai/aiService.js';
import { ai as aiApi } from '../js/codex-api.js';
import { createLibrary } from '../content/slides/adapters/library.js';
import { generateQrDataUrl } from './vendor/qr.js';

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

// Modelos state
let _templates = [];
let _openTemplateSlug = null;
let _templateEditorHandles = null;
let _library = null;

// Emitidos state
let _certs = [];
let _filterTurmaId = '';
let _filterStatus = '';
let _filterQ = '';
let _clients = [];
let _turmas = [];
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
 * Build the token-values object for substituteTokens from a certificate row.
 * The qr value is a data URL, built from the validar URL.
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
 * Assemble the issue-API payload from form fields.
 * PURE — no side effects; tested in isolation.
 * @param {object} fields  { turmaId, participantIds, templateSlug, courseTitle, hours, issuedOn, issuer }
 * @returns {object}  ready to pass to api.issue()
 */
export function buildIssuePayload(fields) {
  return {
    turma_id:        fields.turmaId,
    participant_ids: fields.participantIds,
    template_slug:   fields.templateSlug   || undefined,
    course_title:    fields.courseTitle    || '',
    hours:           fields.hours          || undefined,
    issued_on:       fields.issuedOn       || undefined,
    issuer:          fields.issuer         || undefined,
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

// ── DOM helpers ───────────────────────────────────────────────────────────────
function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }

// ── Shell ─────────────────────────────────────────────────────────────────────
function _renderShell(sub) {
  _viewEl.innerHTML =
    '<div class="cdx-certs-shell" id="cdx-certs-shell">' +
      '<div id="cdx-certs-area"></div>' +
    '</div>';
}

// ── Modelos sub-area ──────────────────────────────────────────────────────────
function _mountModelos() {
  if (!_library) _library = createLibrary({});
  const area = _q('#cdx-certs-area');
  if (!area) return;

  area.innerHTML =
    '<div class="cdx-certs-modelos">' +
      '<aside class="cdx-certs-sidebar" id="cdx-certs-tpl-sidebar">' +
        '<div class="cdx-certs-sidebar-head">' +
          '<span class="cdx-certs-sidebar-title">' + t('certificates.sub_modelos') + '</span>' +
          '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-certs-tpl-new">' + t('certificates.tpl_new') + '</button>' +
        '</div>' +
        '<div id="cdx-certs-tpl-list">' +
          '<div class="cdx-empty">' + t('certificates.loading') + '</div>' +
        '</div>' +
      '</aside>' +
      '<div class="cdx-certs-editor-region" id="cdx-certs-editor-region">' +
        '<div class="cdx-certs-palette-wrap" id="cdx-certs-palette-wrap" style="display:none">' +
          '<div class="cdx-certs-palette-title">' + t('certificates.palette_title') + '</div>' +
          '<p class="cdx-certs-palette-hint">' + t('certificates.palette_hint') + '</p>' +
          '<div class="cdx-certs-palette-chips" id="cdx-certs-palette-chips"></div>' +
        '</div>' +
        '<div class="cdx-certs-editor-mount" id="cdx-certs-editor-mount">' +
          '<div class="cdx-empty">' + t('certificates.tpl_placeholder') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  _renderPalette();
  _loadTemplates();

  const newBtn = _q('#cdx-certs-tpl-new');
  if (newBtn) {
    const onClick = () => _createTemplate();
    newBtn.addEventListener('click', onClick);
    _cleanup.push(() => newBtn.removeEventListener('click', onClick));
  }

  const list = _q('#cdx-certs-tpl-list');
  if (list) {
    const onClick = (e) => {
      const delBtn = e.target.closest('[data-action="del-template"]');
      if (delBtn) { e.stopPropagation(); _confirmDeleteTemplate(delBtn.dataset.slug); return; }
      const row = e.target.closest('[data-slug]');
      if (row && !e.target.closest('button')) _openTemplate(row.dataset.slug);
    };
    list.addEventListener('click', onClick);
    _cleanup.push(() => list.removeEventListener('click', onClick));
  }
}

function _renderPalette() {
  const chips = _q('#cdx-certs-palette-chips');
  if (!chips) return;
  chips.innerHTML = CERT_TOKENS.map((tok) =>
    '<button class="cdx-cert-chip" data-token="{{' + esc(tok.key) + '}}" title="' + esc(t('certificates.palette_hint')) + '">' +
      '<code>{{' + esc(tok.key) + '}}</code>' +
      '<span class="cdx-cert-chip-label">' + esc(t('certificates.token_' + tok.key) || tok.label) + '</span>' +
    '</button>'
  ).join('');
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-token]');
    if (!btn) return;
    const token = btn.dataset.token;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(token)
        .then(() => notice.ok(t('certificates.copied')))
        .catch(() => notice.warn(token));
    }
  });
}

async function _loadTemplates() {
  const list = _q('#cdx-certs-tpl-list');
  if (list) list.innerHTML = '<div class="cdx-empty">' + t('certificates.loading') + '</div>';
  try {
    _templates = await listTemplates();
    _renderTemplateList();
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: load templates: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
    if (list) list.innerHTML = '<div class="cdx-empty">' + t('certificates.error_loading') + '</div>';
  }
}

function _renderTemplateList() {
  const list = _q('#cdx-certs-tpl-list');
  if (!list) return;
  if (!_templates.length) {
    list.innerHTML = '<div class="cdx-empty">' + t('certificates.tpl_empty') + '</div>';
    return;
  }
  list.innerHTML = _templates.map((tpl) => {
    const active = tpl.slug === _openTemplateSlug ? ' is-active' : '';
    const sub = tpl.updated_at ? formatIssuedOn(tpl.updated_at.slice(0, 10)) : '';
    return '<div class="cdx-certs-tpl-row' + active + '" data-slug="' + esc(tpl.slug) + '">' +
      '<div class="cdx-certs-tpl-row-info">' +
        '<div class="cdx-certs-tpl-row-title">' + esc(tpl.title || t('certificates.tpl_untitled')) + '</div>' +
        (sub ? '<div class="cdx-certs-tpl-row-sub">' + esc(t('certificates.tpl_modified') + ' ' + sub) + '</div>' : '') +
      '</div>' +
      '<button class="cdx-certs-tpl-del" data-action="del-template" data-slug="' + esc(tpl.slug) + '" ' +
        'title="' + esc(t('certificates.tpl_delete')) + '" type="button">&times;</button>' +
    '</div>';
  }).join('');
}

async function _createTemplate() {
  const title = t('certificates.tpl_new_default');
  try {
    const slug = await createTemplate(title);
    await _loadTemplates();
    _openTemplate(slug);
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: create template: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
  }
}

function _confirmDeleteTemplate(slug) {
  const tpl = _templates.find((t) => t.slug === slug);
  const name = (tpl && tpl.title) || t('certificates.tpl_untitled');
  const msg = t('certificates.tpl_confirm_delete').replace('{name}', name);
  const html =
    '<div class="cdx-modal" style="max-width:420px">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.tpl_delete')) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + esc(msg) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-tpl-del-cancel">' + esc(t('certificates.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-tpl-del-confirm">' + esc(t('certificates.tpl_delete')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-tpl-del-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-tpl-del-confirm').addEventListener('click', async () => {
    closeModal(bd);
    try {
      await removeTemplate(slug);
      if (_openTemplateSlug === slug) {
        _teardownTemplateEditor();
        _openTemplateSlug = null;
        const mount = _q('#cdx-certs-editor-mount');
        if (mount) mount.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.tpl_placeholder')) + '</div>';
        const palette = _q('#cdx-certs-palette-wrap');
        if (palette) palette.style.display = 'none';
      }
      await _loadTemplates();
      notice.ok(t('certificates.tpl_deleted'));
    } catch (e) {
      if (window.bsLog) window.bsLog('certs: delete template: ' + (e && e.message || e), 'error');
      notice.error(t('certificates.error_loading'));
    }
  });
}

function _openTemplate(slug) {
  if (slug === _openTemplateSlug) return;
  _teardownTemplateEditor();
  _openTemplateSlug = slug;
  _renderTemplateList();

  const mount = _q('#cdx-certs-editor-mount');
  const palette = _q('#cdx-certs-palette-wrap');
  if (!mount) return;

  mount.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.loading')) + '</div>';
  if (palette) palette.style.display = '';

  // Clear the mount before mounting the editor
  mount.innerHTML = '';

  try {
    _templateEditorHandles = mountTemplateEditor(mount, {
      slug,
      editor,
      newDeckFn: newDeck,
      aiService: makeWorkerAi(aiApi.chat),
      library: _library,
    });
  } catch (e) {
    if (window.bsLog) window.bsLog('certs: open template: ' + (e && e.message || e), 'error');
    notice.error(t('certificates.error_loading'));
    if (mount) mount.innerHTML = '<div class="cdx-empty">' + esc(t('certificates.error_loading')) + '</div>';
  }
}

function _teardownTemplateEditor() {
  if (_templateEditorHandles) {
    try { _templateEditorHandles.unmount(); } catch (_) {}
    _templateEditorHandles = null;
  }
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

// ── Preview cert modal ────────────────────────────────────────────────────────
function _previewCert(code) {
  const cert = _certs.find((c) => c.code === code);
  if (!cert) return;
  const validarUrl = buildValidarUrl(
    (typeof location !== 'undefined' ? location.origin : ''),
    cert.code
  );
  const html =
    '<div class="cdx-modal cdx-cert-preview-modal" style="max-width:700px">' +
      '<div class="cdx-modal-title">' + esc(t('certificates.preview_title')) + '</div>' +
      '<dl class="cdx-cert-preview-dl">' +
        '<dt>' + esc(t('certificates.col_code'))   + '</dt><dd><code>' + esc(cert.code) + '</code></dd>' +
        '<dt>' + esc(t('certificates.col_holder')) + '</dt><dd>' + esc(cert.holder_name || '') + '</dd>' +
        '<dt>' + esc(t('certificates.col_course')) + '</dt><dd>' + esc(cert.course_title || '') + '</dd>' +
        '<dt>' + esc(t('certificates.col_date'))   + '</dt><dd>' + esc(formatIssuedOn(cert.issued_on)) + '</dd>' +
        '<dt>' + esc(t('certificates.col_status')) + '</dt><dd>' + esc(t('certificates.status_' + cert.status) || cert.status) + '</dd>' +
        '<dt>' + esc(t('certificates.col_url'))    + '</dt>' +
        '<dd><a href="' + esc(validarUrl) + '" target="_blank" rel="noopener">' + esc(validarUrl) + '</a></dd>' +
      '</dl>' +
      '<p class="cdx-cert-preview-note">' + esc(t('certificates.preview_note')) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-prev-close">' + esc(t('certificates.cancel')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-prev-close').addEventListener('click', () => closeModal(bd));
}

// ── Issue flow ────────────────────────────────────────────────────────────────
function _openIssueFlow() {
  const html =
    '<div class="cdx-modal cdx-cert-issue-modal" style="max-width:600px;max-height:88vh;overflow-y:auto">' +
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

      // Step 3: metadata
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_template')) + '</label>' +
        '<select id="cdx-issue-template">' +
          '<option value="">' + esc(t('certificates.issue_no_template')) + '</option>' +
          _templates.map((tpl) => '<option value="' + esc(tpl.slug) + '">' + esc(tpl.title || t('certificates.tpl_untitled')) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_course_title')) + '</label>' +
        '<input type="text" id="cdx-issue-course" placeholder="' + esc(t('certificates.issue_course_ph')) + '">' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_hours')) + '</label>' +
        '<input type="text" id="cdx-issue-hours" placeholder="' + esc(t('certificates.issue_hours_ph')) + '">' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_issued_on')) + '</label>' +
        '<input type="date" id="cdx-issue-date" value="' + esc(new Date().toISOString().slice(0, 10)) + '">' +
      '</div>' +
      '<div class="cdx-field">' +
        '<label>' + esc(t('certificates.issue_issuer')) + '</label>' +
        '<input type="text" id="cdx-issue-issuer" value="' + esc(t('certificates.issue_issuer_default')) + '" placeholder="' + esc(t('certificates.issue_issuer_ph')) + '">' +
      '</div>' +

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
    const templateSlug= bd.querySelector('#cdx-issue-template').value;

    if (!turmaId) { notice.warn(t('certificates.issue_select_turma')); return; }
    if (!courseTitle) { notice.warn(t('certificates.issue_course_required')); return; }
    if (_issueSelectedIds.size === 0) { notice.warn(t('certificates.issue_no_selection')); return; }

    const payload = buildIssuePayload({
      turmaId:       parseInt(turmaId, 10),
      participantIds: Array.from(_issueSelectedIds),
      templateSlug:  templateSlug || undefined,
      courseTitle,
      hours:         hours || undefined,
      issuedOn:      issuedOn || undefined,
      issuer:        issuer || undefined,
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

// ── Tab contract ──────────────────────────────────────────────────────────────
export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  ctx = ctx || {};
  _activeSub = _resolveSub(ctx.sub);
  _cleanup = [];
  _templates = [];
  _openTemplateSlug = null;
  _templateEditorHandles = null;
  _certs = [];
  _filterTurmaId = '';
  _filterStatus  = '';
  _filterQ       = '';
  _clients       = [];
  _turmas        = [];
  _issueParticipants = [];
  _issueSelectedIds  = new Set();

  _renderShell(_activeSub);

  if (_activeSub === 'modelos') _mountModelos();
  else _mountEmitidos();
}

export function unmount() {
  _teardownTemplateEditor();
  _cleanup.forEach((fn) => { try { fn(); } catch (_) {} });
  _cleanup = [];
  document.querySelectorAll('.cdx-modal-backdrop').forEach((bd) => {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
  });
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  _templates = [];
  _openTemplateSlug = null;
  _certs = [];
  _library = null;
}
