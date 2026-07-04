// content/item-form.js
// Codex-native item editor. A clean ES-module port of the legacy
// window.CTItemForm: native imports, backend through the codex-api facade only,
// cdx- styling (drops the classtrail.css dependency), every string via t().
// The legacy global stays live for ClassVault/ClassTrail until Phase 3/4.
//
// Mount options (the public surface Items relies on):
//   container   element to render into
//   item        existing item for edit mode; null/undefined => create mode
//   prefill     initial values for create mode (e.g. from the AI step-1)
//   aiContext   { rawInput, firstOutput, addEmojis } enables the "Refazer" button
//   types       ct_types rows (slug, label, icon)
//   tags        ct_tags rows (id, label); mutated in place when a tag is created inline
//   titleLabel / saveLabel / closeLabel   header + button text ('' hides close)
//   excludeTypes  type slugs to hide from the dropdown
//   onCreateType(cb)  user picked "+ new type"; caller opens its modal then calls cb(slug|null)
//   onSave(savedItem) / onCancel() / onDirtyChange(isDirty)
// Returns: { isDirty(), getState(), destroy() }
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.bsLog/window.dbg (../backstage/js/debug.js)       optional debug pill
//   window.marked          (CDN, lazy)                       markdown preview
import { appConfig, content as api, ai as aiApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { glyphSvg, iconHtml } from '../js/glyphs.js';
import { createDriveSource, pickLocalFile } from '../js/file-source.js';
import * as aiSpec from '../js/ai-spec.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';

// AI action glyph (shared sparkle from the Codex glyph library; no emoji).
const AI_GLYPH = glyphSvg('sparkle', { cls: 'cdx-btn-glyph', size: 15 });

import { esc as _esc } from '../js/dom.js';

import { errMsg as _err } from '../js/content-err.js';

// Google Picker key (for the "Do Drive" file option): fetched once from the Worker and read
// live by the shared Drive source, exactly like the Slides gallery. The Drive button stays
// hidden until it lands, so the local-upload path always works on its own.
let _pickerKey = '';
let _pickerKeyPromise = null;
function _primePickerKey() {
  if (!_pickerKeyPromise) {
    _pickerKeyPromise = appConfig.get()
      .then((r) => { _pickerKey = (r && r.config && r.config.googlePickerApiKey) || ''; })
      .catch((e) => { _pickerKey = ''; notice.internal(e); });
  }
  return _pickerKeyPromise;
}
function _fileDriveSource() {
  return createDriveSource({
    getApiKey: () => _pickerKey,
    getToken: () => (window.BS_GOOGLE ? window.BS_GOOGLE.requestToken() : null),
  });
}

// Surface AI failures to the debug pill (client-side parse failures never reach
// callWorker's logging, so log them here with a response snippet).
function _logAi(detail, res) {
  const snippet = res && res.text ? String(res.text).slice(0, 400)
    : (res == null ? 'null (rate-limited?)' : JSON.stringify(res).slice(0, 400));
  if (typeof window.bsLog === 'function') window.bsLog('AI refine | ' + detail + ' | response: ' + snippet, 'error');
  if (typeof window.dbg === 'function') window.dbg('error', 'AI refine: ' + detail);
}

function _readFileAsBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const result = e.target.result;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _renderMarkdown(md, container) {
  if (window.marked) { container.innerHTML = window.marked.parse(md); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  s.onload = function () { container.innerHTML = window.marked.parse(md); };
  document.head.appendChild(s);
}

function _buildTypeOptsHtml(types, selectedSlug, includeNewOption, excludeTypes) {
  const excluded = excludeTypes && excludeTypes.length ? excludeTypes : null;
  const visible = excluded ? types.filter((ty) => excluded.indexOf(ty.slug) < 0) : types;
  let html = visible.map((ty) => {
    const active = ty.slug === selectedSlug ? ' is-active' : '';
    return '<button type="button" class="cdx-type-opt' + active + '" data-val="' + _esc(ty.slug) + '">' +
      '<span class="cdx-type-opt-icon">' + iconHtml(ty.icon, { size: 14 }) + '</span>' +
      '<span>' + _esc(ty.label) + '</span>' +
    '</button>';
  }).join('');
  const isExcludedSlug = excluded && excluded.indexOf(selectedSlug) >= 0;
  if (selectedSlug && !isExcludedSlug && !visible.find((ty) => ty.slug === selectedSlug)) {
    html = '<button type="button" class="cdx-type-opt is-active" data-val="' + _esc(selectedSlug) + '">' +
      '<span>' + _esc(selectedSlug + t('editor.unregistered_suffix')) + '</span>' +
    '</button>' + html;
  }
  if (includeNewOption) {
    html += '<button type="button" class="cdx-type-opt cdx-type-opt-new" data-val="__new__">' +
      '<span>' + _esc(t('editor.new_type_option')) + '</span>' +
    '</button>';
  }
  return html;
}

function _buildTypeBlock(typeSlug, body_md, meta) {
  const m = meta || {};
  const hasBody = '<div class="cdx-field"><label>' + t('editor.body_label') + '</label>' +
    '<textarea id="ie-body" rows="10" placeholder="' + _esc(t('editor.body_placeholder')) + '">' + _esc(body_md || '') + '</textarea>' +
    '<div class="cdx-editor-toolbar">' +
      '<button class="cdx-btn cdx-btn-sm" id="ie-preview-btn" type="button">' + t('editor.preview_show') + '</button>' +
    '</div>' +
    '<div class="cdx-preview-area" id="ie-preview" style="display:none"></div>' +
  '</div>';

  if (typeSlug === 'prompt') {
    return '<div class="cdx-type-block">' + hasBody + '</div>';
  }
  if (typeSlug === 'guide') {
    const hasPlatformTabs = !!(m.platform_tabs);
    return '<div class="cdx-type-block">' +
      hasBody +
      '<div class="cdx-field">' +
        '<label class="cdx-toggle-label">' +
          '<span class="cdx-toggle">' +
            '<input type="checkbox" id="ie-platform-toggle"' + (hasPlatformTabs ? ' checked' : '') + '>' +
            '<span class="cdx-toggle-slider"></span>' +
          '</span>' +
          '<span class="cdx-toggle-text">' + t('editor.platform_toggle') + '</span>' +
        '</label>' +
      '</div>' +
      '<div id="ie-platform-tabs-wrap" style="display:' + (hasPlatformTabs ? '' : 'none') + '">' +
        '<div class="cdx-platform-tabs">' +
          '<div class="cdx-field"><label>' + t('editor.platform_windows') + '</label>' +
            '<textarea id="ie-pt-windows" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.windows) || '') + '</textarea>' +
          '</div>' +
          '<div class="cdx-field"><label>' + t('editor.platform_mac') + '</label>' +
            '<textarea id="ie-pt-mac" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.mac) || '') + '</textarea>' +
          '</div>' +
          '<div class="cdx-field"><label>' + t('editor.platform_linux') + '</label>' +
            '<textarea id="ie-pt-linux" rows="5">' + _esc((m.platform_tabs && m.platform_tabs.linux) || '') + '</textarea>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  if (typeSlug === 'material') {
    return '<div class="cdx-type-block">' +
      hasBody +
      '<div class="cdx-field"><label>' + t('editor.material_file_label') + '</label>' +
        '<div class="cdx-upload-row">' +
          '<input type="file" id="ie-material-file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf">' +
          '<span class="cdx-upload-progress"></span>' +
        '</div>' +
        (m.attachment_url ? '<div class="cdx-upload-filename">' + t('editor.current_file') + ' <a href="' + _esc(m.attachment_url) + '" target="_blank" rel="noopener">' + t('editor.view') + '</a></div>' : '') +
      '</div>' +
    '</div>';
  }
  if (typeSlug === 'arquivo') {
    // Any downloadable file (pdf/docx/zip/…), sourced from the computer OR Google Drive via the
    // shared file-source module. The student gets a "Baixar" action in the trail (actions.js
    // renders attachment_url generically). Drive button hides until the Picker key is configured.
    return '<div class="cdx-type-block">' +
      hasBody +
      '<div class="cdx-field"><label>' + t('editor.arquivo_file_label') + '</label>' +
        '<div class="cdx-upload-row">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" id="ie-doc-local">' + t('editor.file_from_computer') + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" id="ie-doc-drive" style="display:none">' + t('editor.file_from_drive') + '</button>' +
          '<span class="cdx-upload-progress"></span>' +
        '</div>' +
        '<div class="cdx-upload-filename" id="ie-doc-filename">' +
          (m.attachment_url ? t('editor.current_file') + ' <a href="' + _esc(m.attachment_url) + '" target="_blank" rel="noopener">' + t('editor.view') + '</a>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }
  if (typeSlug === 'paper') {
    return '<div class="cdx-type-block">' +
      '<div class="cdx-field"><label>' + t('editor.authors_label') + '</label>' +
        '<input type="text" id="ie-paper-authors" value="' + _esc(m.authors || '') + '" placeholder="' + _esc(t('editor.authors_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.year_label') + '</label>' +
        '<input type="number" id="ie-paper-year" value="' + _esc(m.year || '') + '" placeholder="' + _esc(t('editor.year_placeholder')) + '" min="1900" max="2099">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.abstract_label') + '</label>' +
        '<textarea id="ie-paper-abstract" rows="4" placeholder="' + _esc(t('editor.abstract_placeholder')) + '">' + _esc(m.abstract || '') + '</textarea>' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.paper_pdf_label') + '</label>' +
        '<div class="cdx-upload-row">' +
          '<input type="file" id="ie-paper-pdf" accept=".pdf,application/pdf">' +
          '<span class="cdx-upload-progress"></span>' +
        '</div>' +
        (m.pdf_url ? '<div class="cdx-upload-filename">' + t('editor.current_pdf') + ' <a href="' + _esc(m.pdf_url) + '" target="_blank" rel="noopener">' + t('editor.view') + '</a></div>' : '') +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.paper_extra_label') + '</label>' +
        '<textarea id="ie-body" rows="6" placeholder="' + _esc(t('editor.paper_extra_placeholder')) + '">' + _esc(body_md || '') + '</textarea>' +
      '</div>' +
    '</div>';
  }
  if (typeSlug === 'model_info') {
    const strengths = Array.isArray(m.strengths) ? m.strengths.join('\n') : (m.strengths || '');
    return '<div class="cdx-type-block">' +
      '<div class="cdx-field"><label>' + t('editor.mi_provider_label') + '</label>' +
        '<input type="text" id="ie-mi-provider" value="' + _esc(m.provider || '') + '" placeholder="' + _esc(t('editor.mi_provider_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.mi_model_id_label') + '</label>' +
        '<input type="text" id="ie-mi-model-id" value="' + _esc(m.model_id || '') + '" placeholder="' + _esc(t('editor.mi_model_id_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.mi_context_label') + '</label>' +
        '<input type="number" id="ie-mi-context" value="' + _esc(m.context_window || '') + '" placeholder="' + _esc(t('editor.mi_context_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.mi_strengths_label') + '</label>' +
        '<textarea id="ie-mi-strengths" rows="4" placeholder="' + _esc(t('editor.mi_strengths_placeholder')) + '">' + _esc(strengths) + '</textarea>' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.mi_doc_url_label') + '</label>' +
        '<input type="text" id="ie-mi-doc-url" value="' + _esc(m.doc_url || '') + '" placeholder="' + _esc(t('editor.mi_doc_url_placeholder')) + '">' +
      '</div>' +
    '</div>';
  }
  return '<div class="cdx-type-block">' + hasBody + '</div>';
}

function _wireTypeBlockEvents(block, typeSlug, onFileSelected) {
  const previewBtn = block.querySelector('#ie-preview-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', function () {
      const pre = block.querySelector('#ie-preview');
      const bodyEl = block.querySelector('#ie-body');
      if (!pre || !bodyEl) return;
      if (pre.style.display === 'none') {
        pre.style.display = '';
        // Prompts render verbatim on the student page (CTRenderer.renderPrompt);
        // mirror that here so the preview matches reality instead of formatting markdown.
        if (typeSlug === 'prompt') {
          pre.innerHTML = '<div class="cdx-preview-verbatim">' + _esc(bodyEl.value) + '</div>';
        } else {
          _renderMarkdown(bodyEl.value, pre);
        }
        previewBtn.textContent = t('editor.preview_hide');
      } else {
        pre.style.display = 'none';
        previewBtn.textContent = t('editor.preview_show');
      }
    });
  }

  block.querySelectorAll('textarea').forEach((ta) => {
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.stopPropagation(); });
  });

  const platformToggle = block.querySelector('#ie-platform-toggle');
  if (platformToggle) {
    platformToggle.addEventListener('change', function () {
      const wrap = block.querySelector('#ie-platform-tabs-wrap');
      if (wrap) wrap.style.display = platformToggle.checked ? '' : 'none';
    });
  }

  const materialFile = block.querySelector('#ie-material-file');
  if (materialFile) {
    materialFile.addEventListener('change', function () {
      const f = materialFile.files[0];
      if (f) onFileSelected(f, 'attachment_url');
    });
  }

  const paperPdf = block.querySelector('#ie-paper-pdf');
  if (paperPdf) {
    paperPdf.addEventListener('change', function () {
      const f = paperPdf.files[0];
      if (f) onFileSelected(f, 'pdf_url');
    });
  }

  // arquivo: pick any file from the computer OR Google Drive (shared file-source module),
  // both handing the File to the same pending-upload path as the native file inputs above.
  const docLocal = block.querySelector('#ie-doc-local');
  const docDrive = block.querySelector('#ie-doc-drive');
  if (docLocal || docDrive) {
    const nameEl = block.querySelector('#ie-doc-filename');
    const showPicked = (f) => { if (nameEl && f) nameEl.textContent = t('editor.file_selected') + ' ' + f.name; };
    if (docLocal) docLocal.addEventListener('click', async () => {
      const f = await pickLocalFile({});
      if (f) { onFileSelected(f, 'attachment_url'); showPicked(f); }
    });
    if (docDrive) {
      const src = _fileDriveSource();
      const syncAvail = () => { docDrive.style.display = src.available() ? '' : 'none'; };
      _primePickerKey().then(syncAvail).catch(() => {});
      docDrive.addEventListener('click', async () => {
        const f = await src.pick({ view: 'any' });
        if (f) { onFileSelected(f, 'attachment_url'); showPicked(f); }
      });
    }
  }
}

function _collectTypeData(root, typeSlug) {
  let body_md = '';
  let meta_json = null;
  const bodyEl = root.querySelector('#ie-body');
  if (bodyEl) body_md = bodyEl.value;

  if (typeSlug === 'guide') {
    const platformToggle = root.querySelector('#ie-platform-toggle');
    if (platformToggle && platformToggle.checked) {
      meta_json = {
        platform_tabs: {
          windows: (root.querySelector('#ie-pt-windows') || {}).value || '',
          mac:     (root.querySelector('#ie-pt-mac') || {}).value || '',
          linux:   (root.querySelector('#ie-pt-linux') || {}).value || ''
        }
      };
    }
  } else if (typeSlug === 'material') {
    meta_json = {};
  } else if (typeSlug === 'arquivo') {
    meta_json = {}; // attachment_url is set by the pending-file upload on save
  } else if (typeSlug === 'paper') {
    meta_json = {
      authors:  (root.querySelector('#ie-paper-authors') || {}).value || null,
      year:     (root.querySelector('#ie-paper-year') || {}).value || null,
      abstract: (root.querySelector('#ie-paper-abstract') || {}).value || null
    };
  } else if (typeSlug === 'model_info') {
    const strengthsEl = root.querySelector('#ie-mi-strengths');
    const strengthsArr = strengthsEl
      ? strengthsEl.value.split('\n').map((s) => s.trim()).filter(Boolean)
      : [];
    meta_json = {
      provider:       (root.querySelector('#ie-mi-provider') || {}).value || null,
      model_id:       (root.querySelector('#ie-mi-model-id') || {}).value || null,
      context_window: (root.querySelector('#ie-mi-context') || {}).value || null,
      strengths:      strengthsArr,
      doc_url:        (root.querySelector('#ie-mi-doc-url') || {}).value || null
    };
    body_md = '';
  }
  return { body_md, meta_json };
}

function _renderTagPicker(container, tags, selectedTagIds, onChange) {
  function render() {
    const chips = tags.map((tg) => {
      const active = selectedTagIds.has(tg.id);
      return '<button type="button" class="cdx-tag-chip' + (active ? ' active' : '') +
        '" data-id="' + tg.id + '">' + _esc(tg.label) + '</button>';
    }).join('');
    container.innerHTML =
      '<div class="cdx-tag-chip-row">' + chips +
        '<button type="button" class="cdx-tag-add-chip">' + t('editor.add_tag') + '</button>' +
      '</div>';

    container.querySelectorAll('.cdx-tag-chip').forEach((btn) => {
      btn.addEventListener('click', function () {
        const id = parseInt(btn.dataset.id, 10);
        if (selectedTagIds.has(id)) selectedTagIds.delete(id);
        else selectedTagIds.add(id);
        btn.classList.toggle('active');
        if (onChange) onChange();
      });
    });

    const addBtn = container.querySelector('.cdx-tag-add-chip');
    addBtn.addEventListener('click', function () {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cdx-tag-add-input';
      input.placeholder = t('editor.tag_name_placeholder');
      addBtn.replaceWith(input);
      input.focus();
      function commit() {
        const label = input.value.trim();
        if (!label) { render(); return; }
        api.createTag({ label }).then((res) => {
          if (res && res.tag) {
            if (!tags.find((x) => x.id === res.tag.id)) {
              tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
              tags.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
            }
            selectedTagIds.add(res.tag.id);
          }
          render();
          if (onChange) onChange();
        }).catch((err) => { notice.internal(_err(err)); render(); });
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
        else if (e.key === 'Escape') { render(); }
      });
      input.addEventListener('blur', commit);
    });
  }
  render();
}

async function _tagsByLabels(tags, labels) {
  const ids = [];
  for (const raw of labels) {
    const label = (raw || '').trim();
    if (!label) continue;
    const existing = tags.find((tg) => tg.label.toLowerCase() === label.toLowerCase());
    if (existing) { ids.push(existing.id); continue; }
    try {
      const res = await api.createTag({ label });
      if (res && res.tag) {
        if (!tags.find((tg) => tg.id === res.tag.id)) {
          tags.push({ id: res.tag.id, label: res.tag.label, item_count: 0 });
        }
        ids.push(res.tag.id);
      }
    } catch (_) { /* skip */ }
  }
  return ids;
}

// ───────────────────────── public API ─────────────────────────
export function mount(container, opts) {
  opts = opts || {};
  const item = opts.item || null;
  const prefill = opts.prefill || null;
  const aiContext = opts.aiContext || null;
  const types = opts.types || [];
  const tags = opts.tags || [];
  const titleLabel = opts.titleLabel || (item ? t('content.edit_item') : t('content.new_item'));
  const saveLabel = opts.saveLabel || (item ? t('content.save') : t('content.create'));
  const closeLabel = opts.closeLabel != null ? opts.closeLabel : t('content.close');
  const onSave = opts.onSave || function () {};
  const onCancel = opts.onCancel || function () {};
  const onDirtyChange = opts.onDirtyChange || function () {};
  const onCreateType = opts.onCreateType || null;
  const excludeTypes = Array.isArray(opts.excludeTypes) ? opts.excludeTypes : [];
  const pendingFile = opts.pendingFile || null; // a File chosen at the creator step (arquivo import)

  const isEdit = !!item;
  const src = prefill || item || {};
  const _firstVisibleType = excludeTypes.length
    ? types.find((ty) => excludeTypes.indexOf(ty.slug) < 0)
    : types[0];
  const initialType = src.type || (isEdit ? item.type : null) || (_firstVisibleType && _firstVisibleType.slug) || 'prompt';
  const initialTitle = src.title != null ? src.title : '';
  const initialSummary = src.summary != null ? src.summary : '';
  const initialBody = src.body_md != null ? src.body_md : '';
  const initialMeta = (isEdit && item.meta_json)
    ? (typeof item.meta_json === 'string' ? JSON.parse(item.meta_json) : item.meta_json)
    : {};
  const initialTagIds = Array.isArray(src.tag_ids)
    ? src.tag_ids
    : (isEdit && Array.isArray(item.tags) ? item.tags.map((tg) => tg.id) : []);

  const refazerBtn = aiContext
    ? '<button class="cdx-btn" id="ie-refazer-btn" type="button">' + AI_GLYPH + ' ' + t('editor.refazer') + '</button>'
    : '';
  const closeBtn = closeLabel
    ? '<button class="cdx-btn cdx-btn-sm" id="ie-close">' + _esc(closeLabel) + '</button>'
    : '';

  container.innerHTML = '<div class="cdx-editor">' +
    '<div class="cdx-editor-header">' +
      '<span class="cdx-editor-title">' + _esc(titleLabel) + '</span>' +
      closeBtn +
    '</div>' +
    '<div class="cdx-editor-body">' +
      '<div class="cdx-field"><label>' + t('editor.title_label') + '</label>' +
        '<input type="text" id="ie-title" value="' + _esc(initialTitle) + '" placeholder="' + _esc(t('editor.title_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.type_label') + '</label>' +
        '<input type="hidden" id="ie-type" value="' + _esc(initialType) + '">' +
        '<div class="cdx-type-opts" id="ie-type-opts"></div>' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.summary_label') + '</label>' +
        '<input type="text" id="ie-summary" value="' + _esc(initialSummary) + '" placeholder="' + _esc(t('editor.summary_placeholder')) + '">' +
      '</div>' +
      '<div class="cdx-field"><label>' + t('editor.tags_label') + '</label>' +
        '<div class="cdx-tag-picker" id="ie-tag-picker"></div>' +
      '</div>' +
      '<div id="ie-type-block"></div>' +
    '</div>' +
    '<div class="cdx-editor-footer">' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="ie-cancel">' + t('content.cancel') + '</button>' +
        refazerBtn +
        '<button class="cdx-btn cdx-btn-primary" id="ie-save">' + _esc(saveLabel) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  const root = container;
  const selectedTagIds = new Set(initialTagIds);
  let _pendingAssetFile = null;
  let _pendingAssetField = null;
  const typeSel = root.querySelector('#ie-type');
  const typeOptsEl = root.querySelector('#ie-type-opts');
  let lastTypeValue = initialType;
  let isDirty = false;

  function markDirty() { if (!isDirty) { isDirty = true; onDirtyChange(true); } }
  function clearDirty() { if (isDirty) { isDirty = false; onDirtyChange(false); } }

  function _refreshPicker(slug) {
    typeOptsEl.innerHTML = _buildTypeOptsHtml(types, slug, !!onCreateType, excludeTypes);
  }
  _refreshPicker(initialType);

  typeOptsEl.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-val]');
    if (!btn) return;
    typeSel.value = btn.dataset.val;
    typeSel.dispatchEvent(new Event('change'));
  });

  function renderTypeBlock(typeSlug) {
    const block = root.querySelector('#ie-type-block');
    block.innerHTML = _buildTypeBlock(typeSlug, initialBody, initialMeta);
    _wireTypeBlockEvents(block, typeSlug, function (file, field) {
      _pendingAssetFile = file;
      _pendingAssetField = field;
      markDirty();
    });
    block.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });
  }

  renderTypeBlock(initialType);

  // A file picked at the creator step (arquivo import) arrives as opts.pendingFile: seed the
  // same pending-upload path the type editor uses, and show the chosen name. The type is
  // already 'arquivo' via prefill.type, so its block (with #ie-doc-filename) is mounted.
  if (pendingFile) {
    _pendingAssetFile = pendingFile;
    _pendingAssetField = 'attachment_url';
    markDirty();
    const nm = root.querySelector('#ie-doc-filename');
    if (nm) nm.textContent = t('editor.file_selected') + ' ' + pendingFile.name;
  }

  typeSel.addEventListener('change', function () {
    if (typeSel.value === '__new__') {
      if (onCreateType) {
        onCreateType(function (newSlug) {
          if (newSlug) {
            typeSel.value = newSlug;
            _refreshPicker(newSlug);
            lastTypeValue = newSlug;
            renderTypeBlock(newSlug);
            markDirty();
          } else {
            typeSel.value = lastTypeValue;
            _refreshPicker(lastTypeValue);
          }
        });
      } else {
        typeSel.value = lastTypeValue;
        _refreshPicker(lastTypeValue);
      }
      return;
    }
    lastTypeValue = typeSel.value;
    _refreshPicker(typeSel.value); // move the is-active highlight to the clicked type (was only set at build)
    renderTypeBlock(typeSel.value);
    markDirty();
  });

  _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);

  root.querySelector('#ie-title').addEventListener('input', markDirty);
  root.querySelector('#ie-summary').addEventListener('input', markDirty);

  const closeBtnEl = root.querySelector('#ie-close');
  if (closeBtnEl) closeBtnEl.addEventListener('click', () => onCancel());
  root.querySelector('#ie-cancel').addEventListener('click', () => onCancel());

  if (aiContext) {
    root.querySelector('#ie-refazer-btn').addEventListener('click', async function () {
      const btn = this;
      const prev = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = t('editor.refazer_loading');
      try {
        const currentTagLabels = Array.from(selectedTagIds).map((id) => {
          const tg = tags.find((x) => x.id === id);
          return tg ? tg.label : null;
        }).filter(Boolean);

        const bodyEl = root.querySelector('#ie-body');
        const current = {
          title: root.querySelector('#ie-title').value.trim(),
          summary: root.querySelector('#ie-summary').value.trim(),
          type: root.querySelector('#ie-type').value,
          body_md: bodyEl ? bodyEl.value : '',
          tag_labels: currentTagLabels
        };
        const diff = aiSpec.computeEditDiff(aiContext.firstOutput, current);
        const systemPrompt = aiSpec.buildRefineSystemPrompt({ addEmojis: aiContext.addEmojis });
        const userMsg = aiSpec.buildRefineUserMessage(aiContext.rawInput, aiContext.firstOutput, diff);

        const res = await aiApi.chat({
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
          temperature: 0.3,
          max_tokens: aiSpec.MAX_TOKENS
        });
        if (!res || !res.text) { _logAi('no content', res); notice.internal(t('editor.ai_no_content')); return; }
        let parsed = aiSpec.parseModelJson(res.text);
        if (!parsed || !parsed.body_md) { _logAi('unparseable / no body_md', res); notice.internal(t('editor.ai_bad_format')); return; }
        parsed = aiSpec.enforcePromptVerbatim(parsed, aiContext.rawInput);

        aiContext.firstOutput = parsed;
        root.querySelector('#ie-title').value = parsed.title || '';
        root.querySelector('#ie-summary').value = parsed.summary || '';
        if (parsed.type) { root.querySelector('#ie-type').value = parsed.type; _refreshPicker(parsed.type); }
        if (bodyEl) bodyEl.value = parsed.body_md || '';
        const newTagIds = await _tagsByLabels(tags, parsed.tag_labels || []);
        selectedTagIds.clear();
        newTagIds.forEach((id) => selectedTagIds.add(id));
        _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);
        const pre = root.querySelector('#ie-preview');
        if (pre && pre.style.display !== 'none') _renderMarkdown(parsed.body_md || '', pre);
        markDirty();
        toast.ok(t('editor.item_redone'));
      } catch (e) {
        _logAi('exception', null);
        notice.internal(_err(e));
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
  }

  function getState() {
    const type = typeSel.value;
    const title = root.querySelector('#ie-title').value.trim();
    const summary = root.querySelector('#ie-summary').value.trim();
    const typeData = _collectTypeData(root, type);
    return {
      type, title, summary,
      body_md: typeData.body_md,
      meta_json: typeData.meta_json,
      tag_ids: Array.from(selectedTagIds)
    };
  }

  root.querySelector('#ie-save').addEventListener('click', async function () {
    const state = getState();
    if (state.type === '__new__') { toast.err(t('editor.select_type')); return; }
    if (!state.title) { toast.err(t('editor.title_required')); return; }

    const params = {
      type: state.type,
      title: state.title,
      summary: state.summary || null,
      body_md: state.body_md,
      meta_json: state.meta_json ? JSON.stringify(state.meta_json) : null,
      tag_ids: state.tag_ids
    };

    const saveBtn = this;
    saveBtn.disabled = true;
    try {
      let saveRes;
      // saveFn override: the Apostila editor persists into a set (createItem with set_id)
      // or the working copy (saveDraftSection), not the plain bank. When absent the default
      // bank create/update path runs unchanged.
      if (typeof opts.saveFn === 'function') {
        if (isEdit && item) params.id = item.id;
        saveRes = await opts.saveFn(params, { isEdit, item });
      } else if (isEdit) { params.id = item.id; saveRes = await api.updateItem(params); }
      else { saveRes = await api.createItem(params); }
      if (saveRes && saveRes.error) throw new Error(saveRes.error);
      const savedItem = saveRes && (saveRes.item || saveRes.section) ? (saveRes.item || saveRes.section) : null;
      const savedId = isEdit
        ? item.id
        : (savedItem ? savedItem.id : (saveRes && saveRes.id ? saveRes.id : null));

      if (_pendingAssetFile && savedId) {
        const progressEl = root.querySelector('.cdx-upload-progress');
        if (progressEl) progressEl.textContent = t('editor.uploading');
        const b64 = await _readFileAsBase64(_pendingAssetFile);
        const uploadRes = await api.uploadAsset({
          item_id: savedId,
          filename: _pendingAssetFile.name,
          content_b64: b64
        });
        const assetUrl = uploadRes && uploadRes.url;
        if (assetUrl && _pendingAssetField) {
          const updatedMeta = Object.assign({}, state.meta_json || {});
          updatedMeta[_pendingAssetField] = assetUrl;
          await api.updateItem({ id: savedId, meta_json: JSON.stringify(updatedMeta) });
          if (savedItem) savedItem.meta_json = JSON.stringify(updatedMeta);
        }
        if (progressEl) progressEl.textContent = '';
      }

      clearDirty();
      onSave(savedItem || { id: savedId });
    } catch (err) {
      notice.internal(_err(err));
      saveBtn.disabled = false;
    }
  });

  return {
    isDirty: () => isDirty,
    getState,
    destroy: () => { container.innerHTML = ''; }
  };
}
