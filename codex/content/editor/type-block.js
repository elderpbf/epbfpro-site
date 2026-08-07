// content/editor/type-block.js
// The per-type half of the item editor: the fields that only exist because of the item's content
// type (a guide's platform tabs, a paper's authors and PDF, an arquivo's upload, a bundle's
// member list), plus the markdown preview shared by every type that has a body.
//
// Extracted from item-form.js when the editor stopped being one screen-shaped file. The split is
// by RESPONSIBILITY, not by size: this module knows content types, and it is the only place that
// does. The assembling mount (item-form.js) never branches on a type slug.
//
// Three exports, always used as a set on the same DOM subtree:
//   buildTypeBlock(slug, body, meta)   -> html
//   wireTypeBlock(el, slug, onFile, ctx)
//   collectTypeData(el, slug)          -> { body_md, meta_json }
// Adding a type means touching those three and nothing else.
import { appConfig } from '../../js/codex-api.js';
import { t } from '../../js/i18n.js';
import { esc as _esc } from '../../js/dom.js';
import { mount as mountMembers } from '../item-members.js';
import { createDriveSource, pickLocalFile } from '../../js/file-source.js';
import * as notice from '../../js/notice.js';

// Google Picker key (for the "from Drive" file option): fetched once from the Worker and read
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

// Exported because the assembling mount also repaints the preview after an AI pass. One
// markdown path, not two: two would drift on the day the CDN URL or the fallback changes.
export function renderMarkdown(md, container) {
  if (window.marked) { container.innerHTML = window.marked.parse(md); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  s.onload = function () { container.innerHTML = window.marked.parse(md); };
  document.head.appendChild(s);
}

// Which type slugs belong to the bundle family. It comes from the `ct_types` registry
// (`family` column, migration 0050) and is filled at mount time, because the editor already
// receives the type list.
//
// Only a bundle has members. Élder, 2026-08-06: real parenthood is bundle -> items only, and an
// ordinary item that gains company does NOT become a parent; a new bundle is born holding both.
// The Worker refuses the alternative with `not_a_bundle`; this is the same rule, on screen.
let _bundleSlugs = new Set();
export function isBundleSlug(slug) { return _bundleSlugs.has(slug); }
export function setBundleSlugs(types) {
  _bundleSlugs = new Set((types || []).filter((ty) => ty.family === 'bundle').map((ty) => ty.slug));
}

export function buildTypeBlock(typeSlug, body_md, meta) {
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
  // A BUNDLE has no content of its own: the body is the sentence that introduces it to the
  // student, and the member list is mounted into #ie-members once this block exists in the DOM.
  // Keyed on the family, not on a fixed slug, so a bundle type created on the types screen
  // works with no code change.
  if (isBundleSlug(typeSlug)) {
    return '<div class="cdx-type-block">' +
      '<div class="cdx-field"><label>' + t('editor.projeto_intro_label') + '</label>' +
        '<textarea id="ie-body" rows="3" placeholder="' + _esc(t('editor.projeto_intro_placeholder')) + '">' + _esc(body_md || '') + '</textarea>' +
      '</div>' +
      '<div id="ie-members"></div>' +
    '</div>';
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
    // shared file-source module. The student gets a "Download" action on the trail (actions.js
    // renders attachment_url generically). The Drive button hides until the Picker key lands.
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

export function wireTypeBlock(block, typeSlug, onFileSelected, ctx) {
  const memHost = block.querySelector('#ie-members');
  if (memHost && ctx) {
    if (ctx.members) ctx.members.destroy();
    ctx.members = mountMembers(memHost, {
      parentId: ctx.itemId || null,
      children: ctx.children || [],
      onChange: ctx.onMembersChange || function () {},
    });
  }
  const previewBtn = block.querySelector('#ie-preview-btn');
  if (previewBtn) {
    previewBtn.addEventListener('click', function () {
      const pre = block.querySelector('#ie-preview');
      const bodyEl = block.querySelector('#ie-body');
      if (!pre || !bodyEl) return;
      if (pre.style.display === 'none') {
        pre.style.display = '';
        // Raw items render verbatim on the student page, so the preview mirrors that instead of
        // formatting markdown. The decision comes from the caller (ctx.isVerbatim), which owns
        // the flag, not from the type slug: the flag is what tells the truth since 2026-08-07.
        const raw = ctx && typeof ctx.isVerbatim === 'function' ? ctx.isVerbatim() : (typeSlug === 'prompt');
        if (raw) {
          pre.innerHTML = '<div class="cdx-preview-verbatim">' + _esc(bodyEl.value) + '</div>';
        } else {
          renderMarkdown(bodyEl.value, pre);
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

  // arquivo: pick any file from the computer OR Google Drive (shared file-source module), both
  // handing the File to the same pending-upload path the native file inputs above use.
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

export function collectTypeData(root, typeSlug) {
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
