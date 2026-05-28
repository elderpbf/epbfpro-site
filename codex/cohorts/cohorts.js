// cohorts/cohorts.js
// Codex — Cohorts tab: Clients | Turmas | Aulas (three-column layout).
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.callWorker   (../backstage/js/api-client.js)
//   window.BSToast      (../backstage/js/bs-toast.js)  — optional, graceful fallback
//   window.WORKER_URL   (set by api-client or auth.js)
import { cohorts as api, cp as cpApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _clients = [];
let _selectedClientSlug = null;
let _turmas = [];
let _turmaAulas = [];
let _relClientSlug = null;
let _relTurmaSlug = null;
let _cpSessions = [];
let _cleanup = []; // teardown functions pushed by mount

// ── Helpers ─────────────────────────────────────────────────────────────────

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function _toast(msg) {
  if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
}

function _toastError(msg) {
  if (window.showToastError) window.showToastError(msg);
  else _toast(msg);
}

function _baseUrl() {
  return location.protocol + '//' + location.host;
}

function _turmaUrl(clientSlug, turmaSlug, token) {
  return _baseUrl() + '/trilha/' + clientSlug + '/' + turmaSlug + '?k=' + token;
}

function _iconSrc(iconPath) {
  if (!iconPath) return null;
  if (iconPath.startsWith('http')) return iconPath;
  return (window.WORKER_URL || '') + '/r2/' + iconPath;
}

function _fmtDate(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  return p[2] + '/' + p[1];
}

function _aulaDateStatus(a) {
  const today = new Date().toISOString().slice(0, 10);
  if (a.happened_on) return { text: t('cohorts.date_happened') + ' ' + _fmtDate(a.happened_on), cls: 'cdx-rel-date-ocorreu' };
  if (a.scheduled_for) {
    if (a.rescheduled_from && a.scheduled_for > today)
      return { text: t('cohorts.date_rescheduled') + ' ' + _fmtDate(a.scheduled_for), cls: 'cdx-rel-date-remarcada' };
    if (a.scheduled_for > today)
      return { text: t('cohorts.date_scheduled') + ' ' + _fmtDate(a.scheduled_for), cls: 'cdx-rel-date-agendada' };
    return { text: t('cohorts.date_happened') + ' ' + _fmtDate(a.scheduled_for), cls: 'cdx-rel-date-ocorreu' };
  }
  return { text: t('cohorts.date_tbd'), cls: 'cdx-rel-date-adefinir' };
}

function _readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── IDs for pane elements (so we can querySelector safely) ──────────────────
const IDS = {
  clientsList:    'cdx-clients-list',
  turmasList:     'cdx-turmas-list',
  aulasList:      'cdx-aulas-list',
  turmasTitle:    'cdx-turmas-pane-title',
  aulasTitle:     'cdx-aulas-pane-title',
  btnNewClient:   'cdx-btn-new-client',
  btnNewTurma:    'cdx-btn-new-turma',
};

// ── DOM refs (set in mount after render) ────────────────────────────────────
function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// ── Modal helpers ────────────────────────────────────────────────────────────

function _openModal(html, opts) {
  opts = opts || {};
  const bd = document.createElement('div');
  bd.className = 'cdx-modal-backdrop';
  bd.innerHTML = html;

  if (!opts.disableBackdropClose) {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) _closeModal(bd);
    });
  }

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      _closeModal(bd);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  _cleanup.push(() => document.removeEventListener('keydown', escHandler));

  document.body.appendChild(bd);
  const first = bd.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  return bd;
}

function _closeModal(bd) {
  const target = bd || document.querySelector('.cdx-modal-backdrop');
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

// ── Typed-name delete confirmation modal ─────────────────────────────────────

function _openDeleteConfirm(opts) {
  // opts: { title, warningHtml, confirmName, onConfirm }
  const html =
    '<div class="cdx-modal" style="max-width:440px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<div class="cdx-danger-zone">' + opts.warningHtml + '</div>' +
      '<div class="cdx-field" style="margin-top:1rem">' +
        '<label>' + _esc(t('cohorts.confirm_type_name')) + ' <strong>' + _esc(opts.confirmName) + '</strong></label>' +
        '<input type="text" id="cdx-del-confirm-input" autocomplete="off" placeholder="">' +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-del-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-del-confirm" disabled>' + t('cohorts.delete_confirm_btn') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html, { disableBackdropClose: true });
  const input = bd.querySelector('#cdx-del-confirm-input');
  const confirmBtn = bd.querySelector('#cdx-del-confirm');
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim() !== opts.confirmName;
  });
  bd.querySelector('#cdx-del-cancel').addEventListener('click', () => _closeModal(bd));
  confirmBtn.addEventListener('click', () => {
    if (input.value.trim() !== opts.confirmName) return;
    _closeModal(bd);
    opts.onConfirm();
  });
}

// ── Archive confirmation modal ────────────────────────────────────────────────

function _openArchiveConfirm(opts) {
  // opts: { title, message, onConfirm }
  const html =
    '<div class="cdx-modal" style="max-width:400px">' +
      '<div class="cdx-modal-title">' + _esc(opts.title) + '</div>' +
      '<p style="margin:0 0 1.2rem;font-size:0.88rem;color:var(--text-secondary)">' + _esc(opts.message) + '</p>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-arc-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-arc-confirm">' + t('cohorts.archive') + '</button>' +
      '</div>' +
    '</div>';
  const bd = _openModal(html);
  bd.querySelector('#cdx-arc-cancel').addEventListener('click', () => _closeModal(bd));
  bd.querySelector('#cdx-arc-confirm').addEventListener('click', () => {
    _closeModal(bd);
    opts.onConfirm();
  });
}

// ── Shell layout ─────────────────────────────────────────────────────────────

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-three-pane">' +

      // Column 1: Clients
      '<div class="cdx-pane">' +
        '<div class="cdx-pane-header">' +
          '<span class="cdx-pane-title">' + t('cohorts.col_clients') + '</span>' +
          '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="' + IDS.btnNewClient + '">' + t('cohorts.new_client') + '</button>' +
        '</div>' +
        '<div class="cdx-pane-body" id="' + IDS.clientsList + '">' +
          '<div class="cdx-empty">' + t('cohorts.loading') + '</div>' +
        '</div>' +
      '</div>' +

      // Column 2: Turmas
      '<div class="cdx-pane">' +
        '<div class="cdx-pane-header">' +
          '<span class="cdx-pane-title" id="' + IDS.turmasTitle + '">' + t('cohorts.col_turmas') + '</span>' +
          '<button class="cdx-btn cdx-btn-sm cdx-btn-primary" id="' + IDS.btnNewTurma + '" style="display:none">' + t('cohorts.new_turma') + '</button>' +
        '</div>' +
        '<div class="cdx-pane-body" id="' + IDS.turmasList + '">' +
          '<div class="cdx-empty">' + t('cohorts.select_client_prompt') + '</div>' +
        '</div>' +
      '</div>' +

      // Column 3: Aulas
      '<div class="cdx-pane">' +
        '<div class="cdx-pane-header">' +
          '<span class="cdx-pane-title" id="' + IDS.aulasTitle + '">' + t('cohorts.col_aulas') + '</span>' +
        '</div>' +
        '<div class="cdx-pane-body">' +
          '<div id="' + IDS.aulasList + '">' +
            '<div class="cdx-empty">' + t('cohorts.select_turma_prompt') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';

  // Wire header buttons (once, in shell)
  _q(IDS.btnNewClient).addEventListener('click', () => _openClientForm(null));
  _q(IDS.btnNewTurma).addEventListener('click', () => {
    if (_selectedClientSlug) _openTurmaForm(null);
  });

  // Wire delegated click handlers once on the list containers (innerHTML
  // re-renders only replace inner content, not the container element itself,
  // so one listener on the container handles all re-renders safely).
  _q(IDS.clientsList).addEventListener('click', _onClientsClick);
  _q(IDS.turmasList).addEventListener('click', _onTurmasClick);
}

// ── Clients ───────────────────────────────────────────────────────────────────

function _loadClients() {
  const el = _q(IDS.clientsList);
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading') + '</div>';
  api.listClients().then((data) => {
    _clients = data.clients || [];
    _renderClients();
    if (!_selectedClientSlug && _clients.length) {
      const first = _clients.find(c => c.status !== 'archived') || _clients[0];
      if (first) _selectClient(first.slug);
    }
  }).catch(() => {
    const el2 = _q(IDS.clientsList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _renderClients() {
  const el = _q(IDS.clientsList);
  if (!el) return;
  if (!_clients.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('cohorts.no_clients') + '</div>';
    return;
  }
  el.innerHTML = _clients.map((c) => {
    const sel = c.slug === _selectedClientSlug ? ' selected' : '';
    const archivedBadge = c.status === 'archived'
      ? ' <span class="cdx-badge cdx-badge-archived">' + t('cohorts.archived') + '</span>'
      : '';
    const src = _iconSrc(c.icon_path);
    const iconHtml = src
      ? '<img class="cdx-icon-preview" src="' + _esc(src) + '" alt="">'
      : '';
    return (
      '<div class="cdx-card' + sel + '" data-slug="' + _esc(c.slug) + '">' +
        '<div class="cdx-card-name">' + iconHtml + _esc(c.display_name || c.name) + archivedBadge + '</div>' +
        '<div class="cdx-card-meta">' + _esc(c.slug) + '</div>' +
        '<div class="cdx-card-actions">' +
          '<button class="cdx-btn cdx-btn-sm" data-action="edit-client" data-slug="' + _esc(c.slug) + '">' + t('cohorts.edit') + '</button>' +
          (c.status !== 'archived'
            ? '<button class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="archive-client" data-slug="' + _esc(c.slug) + '">' + t('cohorts.archive') + '</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }).join('');
  // Delegated click listener is wired once in _renderShell; no re-wiring on re-render.
}

function _onClientsClick(e) {
  const card = e.target.closest('.cdx-card');
  if (!card) return;
  const action = e.target.dataset.action;
  if (action === 'edit-client') {
    e.stopPropagation();
    const c = _clients.find(x => x.slug === e.target.dataset.slug);
    if (c) _openClientForm(c);
    return;
  }
  if (action === 'archive-client') {
    e.stopPropagation();
    _archiveClient(e.target.dataset.slug);
    return;
  }
  // Card body click = select
  if (!e.target.closest('button, a, img')) {
    _selectClient(card.dataset.slug);
  }
}

function _selectClient(slug) {
  _selectedClientSlug = slug;
  _renderClients();
  const title = _q(IDS.turmasTitle);
  const btnNewTurma = _q(IDS.btnNewTurma);
  const client = _clients.find(c => c.slug === slug);
  if (client) {
    if (title) title.textContent = t('cohorts.col_turmas') + ': ' + (client.display_name || client.name);
    if (btnNewTurma) btnNewTurma.style.display = '';
  }
  // Switching client clears aulas column
  _clearAulasColumn();
  _loadTurmas(slug);
}

function _archiveClient(slug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_client_title'),
    message: t('cohorts.archive_client_msg'),
    onConfirm() {
      api.archiveClient({ slug }).then(() => {
        _toast(t('cohorts.client_archived'));
        _loadClients();
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

// ── Client form ───────────────────────────────────────────────────────────────

function _openClientForm(client) {
  const isEdit = !!client;
  const currentIconPath = isEdit ? (client.icon_path || '') : '';
  let iconPreviewHtml = '';
  if (currentIconPath) {
    const src = _iconSrc(currentIconPath);
    iconPreviewHtml =
      '<div class="cdx-icon-preview-row">' +
        '<img class="cdx-icon-preview" src="' + _esc(src) + '" alt="' + t('cohorts.icon_current') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_current') + '</span>' +
      '</div>' +
      '<div class="cdx-icon-preview-row" id="cdx-cf-new-preview-row" style="display:none">' +
        '<img id="cdx-cf-new-preview-img" class="cdx-icon-preview" src="" alt="' + t('cohorts.icon_preview') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_new') + '</span>' +
      '</div>';
  } else {
    iconPreviewHtml =
      '<div class="cdx-icon-preview-row" id="cdx-cf-new-preview-row" style="display:none">' +
        '<img id="cdx-cf-new-preview-img" class="cdx-icon-preview" src="" alt="' + t('cohorts.icon_preview') + '">' +
        '<span class="cdx-helper-text">' + t('cohorts.icon_preview') + '</span>' +
      '</div>';
  }

  const deleteBlock = isEdit
    ? '<div class="cdx-danger-zone" style="margin-top:1.25rem">' +
        '<div class="cdx-danger-zone-label">' + t('cohorts.danger_zone') + '</div>' +
        '<button class="cdx-btn cdx-btn-danger" id="cdx-cf-delete" type="button">' + t('cohorts.delete_client_btn') + '</button>' +
        '<p class="cdx-helper-text">' + t('cohorts.delete_client_warning') + '</p>' +
      '</div>'
    : '';

  const html =
    '<div class="cdx-modal" style="max-width:500px">' +
      '<div class="cdx-modal-title">' + (isEdit ? t('cohorts.edit_client') : t('cohorts.new_client_title')) + '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_name_internal') + '</label>' +
        '<input type="text" id="cdx-cf-name" value="' + _esc(isEdit ? client.name : '') + '" placeholder="' + t('cohorts.field_name_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_display_name') + '</label>' +
        '<input type="text" id="cdx-cf-display" value="' + _esc(isEdit ? (client.display_name || '') : '') + '" placeholder="' + t('cohorts.field_display_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('cohorts.field_icon') + '</label>' +
        iconPreviewHtml +
        '<div class="cdx-icon-mode-row">' +
          '<label><input type="radio" name="cdx-cf-icon-mode" value="url" id="cdx-cf-icon-mode-url"> ' + t('cohorts.icon_mode_url') + '</label>' +
          '<label><input type="radio" name="cdx-cf-icon-mode" value="upload" id="cdx-cf-icon-mode-upload" checked> ' + t('cohorts.icon_mode_upload') + '</label>' +
        '</div>' +
        '<div id="cdx-cf-icon-url-wrap" style="display:none">' +
          '<input type="text" id="cdx-cf-icon-url" placeholder="https://..." value="">' +
        '</div>' +
        '<div id="cdx-cf-icon-file-wrap">' +
          '<input type="file" id="cdx-cf-icon-file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml">' +
          '<div class="cdx-file-error" id="cdx-cf-icon-file-error" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      deleteBlock +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-cf-cancel">' + t('cohorts.cancel') + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-cf-save">' + (isEdit ? t('cohorts.save') : t('cohorts.create')) + '</button>' +
      '</div>' +
    '</div>';

  const bd = _openModal(html);

  // Icon mode toggle
  const modeUrl    = bd.querySelector('#cdx-cf-icon-mode-url');
  const modeUpload = bd.querySelector('#cdx-cf-icon-mode-upload');
  const urlWrap    = bd.querySelector('#cdx-cf-icon-url-wrap');
  const fileWrap   = bd.querySelector('#cdx-cf-icon-file-wrap');
  modeUrl.addEventListener('change', () => { urlWrap.style.display = ''; fileWrap.style.display = 'none'; });
  modeUpload.addEventListener('change', () => { urlWrap.style.display = 'none'; fileWrap.style.display = ''; });

  // File validation + preview
  const fileErrEl  = bd.querySelector('#cdx-cf-icon-file-error');
  const previewImg = bd.querySelector('#cdx-cf-new-preview-img');
  const previewRow = bd.querySelector('#cdx-cf-new-preview-row');
  bd.querySelector('#cdx-cf-icon-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    fileErrEl.style.display = 'none';
    fileErrEl.textContent = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      fileErrEl.textContent = t('cohorts.icon_too_large');
      fileErrEl.style.display = '';
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (previewImg) { previewImg.src = ev.target.result; }
      if (previewRow) previewRow.style.display = '';
    };
    reader.readAsDataURL(file);
  });

  bd.querySelector('#cdx-cf-cancel').addEventListener('click', () => _closeModal(bd));

  // Delete button (edit only)
  if (isEdit) {
    bd.querySelector('#cdx-cf-delete').addEventListener('click', () => {
      _closeModal(bd);
      _openDeleteConfirm({
        title: t('cohorts.delete_client_btn'),
        warningHtml: '<p style="font-size:0.85rem;color:var(--text-secondary);margin:0">' + t('cohorts.delete_client_warning') + '</p>',
        confirmName: client.name,
        onConfirm() {
          api.deleteClient({ slug: client.slug }).then(() => {
            _toast(t('cohorts.client_deleted'));
            if (_selectedClientSlug === client.slug) {
              _selectedClientSlug = null;
              _turmas = [];
              _renderTurmas();
              const title = _q(IDS.turmasTitle);
              const btn = _q(IDS.btnNewTurma);
              if (title) title.textContent = t('cohorts.col_turmas');
              if (btn) btn.style.display = 'none';
              _clearAulasColumn();
            }
            _loadClients();
          }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
        }
      });
    });
  }

  // Save button
  bd.querySelector('#cdx-cf-save').addEventListener('click', () => {
    const name    = bd.querySelector('#cdx-cf-name').value.trim();
    const display = bd.querySelector('#cdx-cf-display').value.trim();
    if (!name) { _toast(t('cohorts.name_required')); return; }
    const slug = isEdit ? client.slug : _slugify(name);
    if (!slug) { _toast(t('cohorts.slug_invalid')); return; }

    const iconMode = bd.querySelector('input[name="cdx-cf-icon-mode"]:checked').value;
    const iconUrl  = bd.querySelector('#cdx-cf-icon-url').value.trim();
    const iconFile = bd.querySelector('#cdx-cf-icon-file').files[0];

    const params = { name, display_name: display || null, slug };
    const call = isEdit ? api.updateClient(params) : api.createClient(params);

    call.then(() => {
      if (iconMode === 'url' && iconUrl) {
        return api.setClientIcon({ slug, mode: 'url', value: iconUrl });
      } else if (iconMode === 'upload' && iconFile) {
        return _readFileAsBase64(iconFile).then(b64 =>
          api.setClientIcon({ slug, mode: 'upload', value: b64, filename: iconFile.name })
        );
      }
      return Promise.resolve();
    }).then(() => {
      _closeModal(bd);
      _toast(isEdit ? t('cohorts.client_updated') : t('cohorts.client_created'));
      _loadClients();
    }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
  });
}

// ── Turmas ────────────────────────────────────────────────────────────────────

function _loadTurmas(clientSlug) {
  const el = _q(IDS.turmasList);
  if (el) el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading') + '</div>';
  api.listTurmas({ client_slug: clientSlug }).then((data) => {
    _turmas = data.turmas || [];
    _renderTurmas();
    if (_turmas.length) {
      const first = _turmas.find(t => t.status !== 'archived') || _turmas[0];
      if (first) _selectTurmaForAulas(first.client_slug, first.slug);
    }
  }).catch(() => {
    const el2 = _q(IDS.turmasList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _renderTurmas() {
  const el = _q(IDS.turmasList);
  if (!el) return;
  if (!_turmas.length) {
    el.innerHTML = '<div class="cdx-empty">' + t('cohorts.no_turmas') + '</div>';
    return;
  }

  const WP_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">' +
      '<path d="M20.52 3.48A11.78 11.78 0 0 0 12.05 0C5.5 0 .18 5.32.18 11.87a11.83 11.83 0 0 0 1.59 5.94L0 24l6.34-1.66a11.86 11.86 0 0 0 5.71 1.46h.01c6.55 0 11.87-5.32 11.87-11.87a11.79 11.79 0 0 0-3.41-8.45zM12.06 21.7h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.76.99 1-3.66-.23-.38a9.85 9.85 0 0 1-1.51-5.2c0-5.44 4.43-9.87 9.87-9.87a9.79 9.79 0 0 1 6.97 2.89 9.79 9.79 0 0 1 2.89 6.98c0 5.44-4.43 9.83-9.85 9.83zm5.4-7.36c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.74-1.64-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.08 3.18 5.05 4.45.71.31 1.26.49 1.68.63.71.22 1.35.19 1.86.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/>' +
    '</svg>';
  const CP_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>' +
    '</svg>';

  el.innerHTML = _turmas.map((turma) => {
    const url = turma.token ? _turmaUrl(turma.client_slug, turma.slug, turma.token) : null;
    const sel = (turma.client_slug === _relClientSlug && turma.slug === _relTurmaSlug) ? ' selected' : '';
    const archivedBadge = turma.status === 'archived'
      ? ' <span class="cdx-badge cdx-badge-archived">' + t('cohorts.archived') + '</span>'
      : '';
    const displayName = turma.display_name || '';
    const realName = turma.name || '';
    const subtitle = (displayName && displayName !== realName)
      ? '<div class="cdx-card-meta">' + t('cohorts.display_name_prefix') + ' ' + _esc(displayName) + '</div>'
      : '';
    const aulaCount = turma.aula_count || 0;
    const aulaCountLabel = aulaCount === 1 ? '1 ' + t('cohorts.aula_singular') : aulaCount + ' ' + t('cohorts.aula_plural');

    const wpOk = !!turma.whatsapp_url;
    const cpOk = !!turma.classpulse_session_id;

    const wpIcon = wpOk
      ? '<a class="cdx-card-mini-icon is-on" href="' + _esc(turma.whatsapp_url) + '" target="_blank" rel="noopener" title="' + t('cohorts.whatsapp_open') + '" data-stop>' + WP_SVG + '</a>'
      : '<span class="cdx-card-mini-icon is-off" title="' + t('cohorts.whatsapp_none') + '">' + WP_SVG + '</span>';
    const cpIcon =
      '<span class="cdx-card-mini-icon ' + (cpOk ? 'is-on' : 'is-off') + '" title="' + t('cohorts.classpulse') + ': ' + (cpOk ? t('cohorts.defined') : t('cohorts.not_defined')) + '">' + CP_SVG + '</span>';

    const urlRow = url
      ? '<div class="cdx-card-url-row">' +
          '<button type="button" class="cdx-card-url-text" data-action="copy-url" data-url="' + _esc(url) + '" title="' + t('cohorts.copy_url') + '">' + _esc(url) + '</button>' +
          '<a class="cdx-card-url-open" href="' + _esc(url) + '" target="_blank" rel="noopener" title="' + t('cohorts.open_url') + '" data-stop>&#8599;</a>' +
        '</div>'
      : '<div class="cdx-card-url-row is-disabled"><span class="cdx-card-url-text" aria-disabled="true">' + t('cohorts.url_unavailable') + '</span></div>';

    return (
      '<div class="cdx-card' + sel + '" data-id="' + _esc(turma.id) + '" data-client-slug="' + _esc(turma.client_slug) + '" data-turma-slug="' + _esc(turma.slug) + '">' +
        '<div class="cdx-card-name">' + _esc(realName) + archivedBadge + '</div>' +
        subtitle +
        '<div class="cdx-card-info-row">' +
          '<span class="cdx-card-info-chip">' + aulaCountLabel + '</span>' +
          '<span class="cdx-card-mini-icons">' + wpIcon + cpIcon + '</span>' +
        '</div>' +
        urlRow +
        '<div class="cdx-card-actions">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-action="edit-turma" data-id="' + _esc(turma.id) + '">' + t('cohorts.edit') + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-action="regen-token" data-client-slug="' + _esc(turma.client_slug) + '" data-turma-slug="' + _esc(turma.slug) + '" title="' + t('cohorts.regen_token_title') + '">&#8635;</button>' +
          (turma.status !== 'archived'
            ? '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger" data-action="archive-turma" data-client-slug="' + _esc(turma.client_slug) + '" data-turma-slug="' + _esc(turma.slug) + '">' + t('cohorts.archive') + '</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }).join('');
  // Delegated click listener is wired once in _renderShell; no re-wiring on re-render.
}

function _onTurmasClick(e) {
  const card = e.target.closest('.cdx-card');
  if (!card) return;

  // Stop-propagation marker on links/buttons
  if (e.target.dataset.stop !== undefined || e.target.closest('[data-stop]')) {
    // Let the natural link behavior happen; just don't select the card.
    return;
  }

  const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

  if (action === 'edit-turma') {
    e.stopPropagation();
    const btn = e.target.closest('[data-action="edit-turma"]');
    const turma = _turmas.find(x => String(x.id) === String(btn.dataset.id));
    if (turma) _openTurmaForm(turma);
    return;
  }
  if (action === 'archive-turma') {
    e.stopPropagation();
    const btn = e.target.closest('[data-action="archive-turma"]');
    _archiveTurma(btn.dataset.clientSlug, btn.dataset.turmaSlug);
    return;
  }
  if (action === 'regen-token') {
    e.stopPropagation();
    const btn = e.target.closest('[data-action="regen-token"]');
    _regenToken(btn.dataset.clientSlug, btn.dataset.turmaSlug);
    return;
  }
  if (action === 'copy-url') {
    e.stopPropagation();
    const btn = e.target.closest('[data-action="copy-url"]');
    _copyUrl(btn.dataset.url);
    return;
  }

  // Card body = select turma
  if (!e.target.closest('button, a')) {
    _selectTurmaForAulas(card.dataset.clientSlug, card.dataset.turmaSlug);
  }
}

function _archiveTurma(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.archive_turma_title'),
    message: t('cohorts.archive_turma_msg'),
    onConfirm() {
      api.archiveTurma({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
        _toast(t('cohorts.turma_archived'));
        _loadTurmas(clientSlug);
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _regenToken(clientSlug, turmaSlug) {
  _openArchiveConfirm({
    title: t('cohorts.regen_token_title'),
    message: t('cohorts.regen_token_msg'),
    onConfirm() {
      api.regenTurmaToken({ client_slug: clientSlug, slug: turmaSlug }).then(() => {
        _toast(t('cohorts.token_regenerated'));
        _loadTurmas(clientSlug);
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    }
  });
}

function _copyUrl(url) {
  navigator.clipboard.writeText(url)
    .then(() => _toast(t('cohorts.link_copied')))
    .catch(() => _toast(t('cohorts.copy_failed') + ': ' + url));
}

// ── Turma form ────────────────────────────────────────────────────────────────

function _openTurmaForm(turma) {
  const isEdit = !!turma;

  const cpLoad = _cpSessions.length
    ? Promise.resolve()
    : cpApi.listSessions().then(d => { _cpSessions = (d && d.sessions) || []; }).catch(() => {});

  cpLoad.then(() => {
    const cpOptions = '<option value="">' + t('cohorts.none') + '</option>' +
      _cpSessions.map(s => {
        const sel = (isEdit && turma.classpulse_session_id === s.id) ? ' selected' : '';
        return '<option value="' + _esc(s.id) + '"' + sel + '>' + _esc(s.name) + '</option>';
      }).join('');

    const html =
      '<div class="cdx-modal" style="max-width:600px;max-height:90vh;overflow-y:auto">' +
        '<div class="cdx-modal-title">' + (isEdit ? t('cohorts.edit_turma') : t('cohorts.new_turma_title')) + '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_name_internal') + '</label>' +
          '<input type="text" id="cdx-tf-name" value="' + _esc(isEdit ? turma.name : '') + '" placeholder="' + t('cohorts.turma_name_placeholder') + '">' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_display_name') + '</label>' +
          '<input type="text" id="cdx-tf-display" value="' + _esc(isEdit ? (turma.display_name || '') : '') + '" placeholder="' + t('cohorts.field_display_placeholder') + '">' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_whatsapp') + '</label>' +
          '<input type="text" id="cdx-tf-whatsapp" value="' + _esc(isEdit ? (turma.whatsapp_url || '') : '') + '" placeholder="https://chat.whatsapp.com/...">' +
        '</div>' +
        '<div class="cdx-field"><label>' + t('cohorts.field_classpulse') + '</label>' +
          '<select id="cdx-tf-classpulse">' + cpOptions + '</select>' +
        '</div>' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" id="cdx-tf-cancel">' + t('cohorts.cancel') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" id="cdx-tf-save">' + (isEdit ? t('cohorts.save') : t('cohorts.create')) + '</button>' +
        '</div>' +
      '</div>';

    const bd = _openModal(html);
    bd.querySelector('#cdx-tf-cancel').addEventListener('click', () => _closeModal(bd));

    bd.querySelector('#cdx-tf-save').addEventListener('click', () => {
      const name      = bd.querySelector('#cdx-tf-name').value.trim();
      const display   = bd.querySelector('#cdx-tf-display').value.trim();
      const whatsapp  = bd.querySelector('#cdx-tf-whatsapp').value.trim();
      const cpSession = bd.querySelector('#cdx-tf-classpulse').value;
      if (!name) { _toast(t('cohorts.name_required')); return; }

      const slug = isEdit ? turma.slug : _slugify(name);
      if (!slug) { _toast(t('cohorts.slug_invalid')); return; }

      const baseParams = {
        client_slug: _selectedClientSlug,
        name,
        display_name: display || null,
        slug,
      };

      const firstCall = isEdit
        ? api.updateTurma(baseParams)
        : api.createTurma(baseParams);

      firstCall.then(() => {
        const metaChanged = isEdit && (
          whatsapp !== (turma.whatsapp_url || '') ||
          cpSession !== (String(turma.classpulse_session_id || ''))
        );
        const needMeta = isEdit ? metaChanged : !!(whatsapp || cpSession);
        const metaSlug = isEdit ? turma.slug : slug;
        if (needMeta) {
          return api.updateTurmaMeta({
            client_slug: _selectedClientSlug,
            slug: metaSlug,
            whatsapp_url: whatsapp || null,
            classpulse_session_id: cpSession || null,
          });
        }
        return Promise.resolve();
      }).then(() => {
        _closeModal(bd);
        _toast(isEdit ? t('cohorts.turma_updated') : t('cohorts.turma_created'));
        _loadTurmas(_selectedClientSlug);
      }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
    });
  });
}

// ── Aulas column ──────────────────────────────────────────────────────────────

function _clearAulasColumn() {
  _relClientSlug = null;
  _relTurmaSlug = null;
  _turmaAulas = [];
  const hdr = _q(IDS.aulasTitle);
  if (hdr) hdr.textContent = t('cohorts.col_aulas');
  const list = _q(IDS.aulasList);
  if (list) list.innerHTML = '<div class="cdx-empty">' + t('cohorts.select_turma_prompt') + '</div>';
  _renderTurmas();
}

function _selectTurmaForAulas(clientSlug, turmaSlug) {
  if (!clientSlug || !turmaSlug) return;
  if (clientSlug === _relClientSlug && turmaSlug === _relTurmaSlug) return;
  _relClientSlug = clientSlug;
  _relTurmaSlug = turmaSlug;
  const hdr = _q(IDS.aulasTitle);
  if (hdr) {
    const found = _turmas.find(x => x.client_slug === clientSlug && x.slug === turmaSlug);
    const name = found ? (found.display_name || found.name) : '';
    hdr.textContent = name ? t('cohorts.col_aulas') + ': ' + name : t('cohorts.col_aulas');
  }
  _loadTurmaAulas(clientSlug, turmaSlug);
  _renderTurmas();
}

function _loadTurmaAulas(clientSlug, turmaSlug) {
  const el = _q(IDS.aulasList);
  if (!el) return;
  el.innerHTML = '<div class="cdx-empty">' + t('cohorts.loading_aulas') + '</div>';
  api.listAulas({ client_slug: clientSlug, turma_slug: turmaSlug }).then((d) => {
    _turmaAulas = (d.aulas || []).slice().sort((a, b) => (a.aula_number || 0) - (b.aula_number || 0));
    _renderTurmaAulas();
  }).catch(() => {
    const el2 = _q(IDS.aulasList);
    if (el2) el2.innerHTML = '<div class="cdx-empty">' + t('cohorts.error_loading') + '</div>';
  });
}

function _renderTurmaAulas() {
  const el = _q(IDS.aulasList);
  if (!el) return;

  const addBtnHtml =
    '<div class="cdx-aulas-toolbar">' +
      '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary" id="cdx-btn-add-aula">' + t('cohorts.new_aula') + '</button>' +
    '</div>';

  if (!_turmaAulas.length) {
    el.innerHTML = addBtnHtml + '<div class="cdx-empty">' + t('cohorts.no_aulas') + '</div>';
  } else {
    el.innerHTML = addBtnHtml +
      '<div class="cdx-aulas-col-list">' +
        _turmaAulas.map((a, idx) => _renderAulaColRow(a, idx)).join('') +
      '</div>';
  }

  _wireAulasColEvents();
}

function _renderAulaColRow(a, idx) {
  const ds = _aulaDateStatus(a);
  const titleHtml = a.title
    ? _esc(a.title)
    : '<span class="is-empty">' + t('cohorts.aula_no_title') + '</span>';
  return (
    '<div class="cdx-aula-col-row" data-aula-idx="' + idx + '">' +
      '<div class="cdx-aula-col-row-display">' +
        '<div class="cdx-aula-col-row-main">' +
          '<span class="cdx-rel-aula-label">' + t('cohorts.aula_label') + ' ' + _esc(a.aula_number) + '</span>' +
          '<span class="cdx-aula-col-row-title">' + titleHtml + '</span>' +
        '</div>' +
        '<span class="cdx-rel-aula-date ' + ds.cls + '">' + _esc(ds.text) + '</span>' +
      '</div>' +
    '</div>'
  );
}

function _renderAulaColEditor(a) {
  return (
    '<div class="cdx-aula-col-editor">' +
      '<div class="cdx-field">' +
        '<label>' + t('cohorts.aula_field_title') + '</label>' +
        '<input type="text" class="cdx-aula-title" value="' + _esc(a.title || '') + '" placeholder="' + t('cohorts.aula_title_placeholder') + '">' +
      '</div>' +
      '<div class="cdx-aula-col-editor-grid">' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_scheduled') + '</label>' +
          '<input type="date" class="cdx-aula-scheduled" value="' + _esc(a.scheduled_for || '') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_happened') + '</label>' +
          '<input type="date" class="cdx-aula-happened" value="' + _esc(a.happened_on || '') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_rescheduled_from') + '</label>' +
          '<input type="date" class="cdx-aula-rescheduled-from" value="' + _esc(a.rescheduled_from || '') + '">' +
        '</div>' +
        '<div class="cdx-field">' +
          '<label>' + t('cohorts.aula_field_rescheduled_note') + '</label>' +
          '<input type="text" class="cdx-aula-rescheduled-note" value="' + _esc(a.rescheduled_note || '') + '" placeholder="' + t('cohorts.aula_note_placeholder') + '">' +
        '</div>' +
      '</div>' +
      '<div class="cdx-aula-col-editor-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-aula-delete">' + t('cohorts.delete') + '</button>' +
        '<div class="cdx-aula-col-editor-actions-right">' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-aula-cancel">' + t('cohorts.close') + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary cdx-aula-save">' + t('cohorts.save') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function _wireAulasColEvents() {
  const addBtn = _q('cdx-btn-add-aula');
  if (addBtn) addBtn.addEventListener('click', _addNewAulaCol);

  const el = _q(IDS.aulasList);
  if (!el) return;
  el.querySelectorAll('.cdx-aula-col-row').forEach((row) => {
    const display = row.querySelector('.cdx-aula-col-row-display');
    if (display) display.addEventListener('click', () => _expandAulaCol(row));
  });
}

function _addNewAulaCol() {
  const nums = _turmaAulas.map(a => a.aula_number || 0);
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newAula = {
    id: null,
    aula_number: nextNum,
    title: '',
    scheduled_for: null,
    happened_on: null,
    rescheduled_from: null,
    rescheduled_note: null,
    _isNew: true,
  };
  _turmaAulas.push(newAula);
  _renderTurmaAulas();
  const rows = (_q(IDS.aulasList) || document).querySelectorAll('.cdx-aula-col-row');
  const newRow = rows[rows.length - 1];
  if (newRow) _expandAulaCol(newRow);
}

function _expandAulaCol(row) {
  const idx = parseInt(row.dataset.aulaIdx, 10);
  const aula = _turmaAulas[idx];
  if (!aula) return;

  // Collapse any other open editor
  const el = _q(IDS.aulasList);
  if (el) {
    el.querySelectorAll('.cdx-aula-col-row.is-editing').forEach((r) => {
      if (r !== row) _collapseAulaCol(r);
    });
  }

  row.classList.add('is-editing');
  const display = row.querySelector('.cdx-aula-col-row-display');
  if (display) display.style.display = 'none';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = _renderAulaColEditor(aula);
  row.appendChild(wrapper.firstChild);
  _wireAulaEditorEvents(row, aula, idx);
  const titleInput = row.querySelector('.cdx-aula-title');
  if (titleInput) setTimeout(() => titleInput.focus(), 0);
}

function _collapseAulaCol(row) {
  row.classList.remove('is-editing');
  const display = row.querySelector('.cdx-aula-col-row-display');
  if (display) display.style.display = '';
  const editor = row.querySelector('.cdx-aula-col-editor');
  if (editor) editor.parentNode.removeChild(editor);
}

function _wireAulaEditorEvents(row, aula, idx) {
  const saveBtn   = row.querySelector('.cdx-aula-save');
  const cancelBtn = row.querySelector('.cdx-aula-cancel');
  const deleteBtn = row.querySelector('.cdx-aula-delete');
  const titleInput = row.querySelector('.cdx-aula-title');
  const schedInput = row.querySelector('.cdx-aula-scheduled');
  const happInput  = row.querySelector('.cdx-aula-happened');
  const rfromInput = row.querySelector('.cdx-aula-rescheduled-from');
  const rnoteInput = row.querySelector('.cdx-aula-rescheduled-note');

  saveBtn.addEventListener('click', () => {
    const payload = {
      client_slug: _relClientSlug,
      turma_slug: _relTurmaSlug,
      aula_number: aula.aula_number,
      title: titleInput.value.trim(),
      scheduled_for:    schedInput.value || null,
      happened_on:      happInput.value  || null,
      rescheduled_from: rfromInput.value || null,
      rescheduled_note: rnoteInput.value.trim() || null,
    };
    const isNew = !!aula._isNew;
    const params = Object.assign({}, payload);
    if (!isNew) params.id = aula.id;

    const call = isNew ? api.createAula(params) : api.updateAula(params);
    call.then((res) => {
      if (isNew) {
        const created = (res && res.aula) || res;
        if (created && created.id) {
          aula.id = created.id;
          aula._isNew = false;
        }
      }
      aula.title            = payload.title;
      aula.scheduled_for    = payload.scheduled_for;
      aula.happened_on      = payload.happened_on;
      aula.rescheduled_from = payload.rescheduled_from;
      aula.rescheduled_note = payload.rescheduled_note;
      _toast(t('cohorts.aula_saved'));
      _renderTurmaAulas();
    }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
  });

  cancelBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas.splice(idx, 1);
      _renderTurmaAulas();
    } else {
      _collapseAulaCol(row);
    }
  });

  deleteBtn.addEventListener('click', () => {
    if (aula._isNew) {
      _turmaAulas.splice(idx, 1);
      _renderTurmaAulas();
      return;
    }
    // Use inline confirm modal instead of confirm()
    _openArchiveConfirm({
      title: t('cohorts.delete_aula_title') + ' ' + aula.aula_number,
      message: t('cohorts.delete_aula_msg'),
      onConfirm() {
        api.deleteAula({ id: aula.id }).then(() => {
          _turmaAulas.splice(idx, 1);
          _toast(t('cohorts.aula_deleted'));
          _renderTurmaAulas();
        }).catch(err => _toastError(t('cohorts.error') + ': ' + (err.message || err)));
      }
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  _clients = [];
  _selectedClientSlug = null;
  _turmas = [];
  _turmaAulas = [];
  _relClientSlug = null;
  _relTurmaSlug = null;
  _cpSessions = [];
  _cleanup = [];

  _renderShell();
  _loadClients();
}

export function unmount() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
  // Remove any stray modal left by this module
  document.querySelectorAll('.cdx-modal-backdrop').forEach(bd => bd.parentNode && bd.parentNode.removeChild(bd));
}
