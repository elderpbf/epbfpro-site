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

// Types whose content IS a file to download. `arquivo` was the only one, hardcoded, and the
// first custom type Élder created (`skill`, a .zip of a Claude skill) landed with NO file field
// at all: the editor draws a block per known slug and a type it has never heard of gets none.
// The symptom is not obvious from the screen: the item saves fine and the trail simply never
// grows a Baixar button, because meta_json.attachment_url was never written.
//
// A list, not a general rule, ON PURPOSE: making every unknown type carry a file would also
// hand one to `conteudo` (42 live items), `link`, `dica` and the rest. The real fix is a
// per-type capability on ct_types, next to `family`; this is the same shape as `family` and is
// where that lives when it comes.
const FILE_TYPES = ['arquivo', 'skill'];

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

// WHAT THE SINGLE CONTENT BOX IS FOR, per type. The box itself lives in editor/ai-box.js and the
// assembling mount places it, but only this module is allowed to know that a `paper` keeps
// complementary notes there while the article is the PDF, or that a package keeps its intro and
// must not be offered "use as a file to download" (a package is not a file).
//
// It exists as a function rather than as three ternaries in item-form.js because
// tests/editor-module.test.mjs enforces that the assembling mount never branches on a type slug,
// and that guard is right: type knowledge in two places is how the two drift.
export function contentBoxSpec(typeSlug) {
  if (isBundleSlug(typeSlug)) {
    return { labelKey: 'editor.projeto_intro_label', placeholderKey: 'editor.projeto_intro_placeholder',
      rows: 4, sources: false };
  }
  if (typeSlug === 'paper') {
    return { labelKey: 'editor.paper_extra_label', placeholderKey: 'editor.paper_extra_placeholder',
      rows: 6, sources: true };
  }
  return { labelKey: 'editor.body_label', placeholderKey: 'editor.body_placeholder', rows: 8, sources: true };
}

// Does moving from one type to another change what the content box IS? The mount asks before
// deciding whether to rebuild it, and asking here keeps the answer next to the spec above.
export function contentBoxChanged(fromSlug, toSlug) {
  const a = contentBoxSpec(fromSlug), b = contentBoxSpec(toSlug);
  return a.labelKey !== b.labelKey || a.sources !== b.sources || a.rows !== b.rows;
}

// THE BODY IS NOT HERE ANY MORE. In the layout Élder approved there is ONE content box, at the
// top of the left column, and the AI is attached to it (editor/ai-box.js owns `#ie-body`). This
// module emits only what a type adds BEYOND a body: a guide's platform tabs, an arquivo's upload,
// a paper's authors, a package's member list. `collectTypeData` still finds `#ie-body` because it
// queries from the editor root, not from this block.
export function buildTypeBlock(typeSlug, body_md, meta) {
  const m = meta || {};

  // Nothing to add: return EMPTY, not an empty container. Élder saw the container
  // (2026-08-08: "theres a green box empty on the bottom"), because .cdx-type-block carries a
  // surface of its own and a type with no extras painted a box around nothing.
  if (typeSlug === 'prompt') return '';
  // A BUNDLE has no content of its own: the body is the sentence that introduces it to the
  // student, and the member list is mounted into #ie-members once this block exists in the DOM.
  // Keyed on the family, not on a fixed slug, so a bundle type created on the types screen
  // works with no code change.
  if (isBundleSlug(typeSlug)) {
    // Only the member list: the package's description IS the content box on the left, and the
    // ".zip" choice sits under that box, next to the thing it governs (buildZipIntro below).
    return '<div class="cdx-type-block"><div id="ie-members"></div></div>';
  }
  if (typeSlug === 'guide') {
    const hasPlatformTabs = !!(m.platform_tabs);
    return '<div class="cdx-type-block">' +
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
      '<div class="cdx-field"><label>' + t('editor.material_file_label') + '</label>' +
        '<div class="cdx-upload-row">' +
          '<input type="file" id="ie-material-file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf">' +
          '<span class="cdx-upload-progress"></span>' +
        '</div>' +
        (m.attachment_url ? '<div class="cdx-upload-filename">' + t('editor.current_file') + ' <a href="' + _esc(m.attachment_url) + '" target="_blank" rel="noopener">' + t('editor.view') + '</a></div>' : '') +
      '</div>' +
    '</div>';
  }
  if (FILE_TYPES.indexOf(typeSlug) >= 0) {
    // Any downloadable file (pdf/docx/zip/…), sourced from the computer OR Google Drive via the
    // shared file-source module. The student gets a "Download" action on the trail (actions.js
    // renders attachment_url generically). The Drive button hides until the Picker key lands.
    return '<div class="cdx-type-block">' +
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
  return '';
}

// The ".zip" choice for a package, rendered by the assembling mount right under the content box
// it governs (Élder 2026-08-07). Default ON for a package that never expressed an opinion: a
// folder of files with no note is the thing the student writes back to ask about.
export function buildZipIntro(meta) {
  const m = meta || {};
  return '<label class="cdx-check-inline"><input type="checkbox" id="ie-zip-intro"' +
    (m.zip_intro !== false ? ' checked' : '') + '> ' + _esc(t('editor.projeto_intro_in_zip')) + '</label>';
}

export function wireTypeBlock(block, typeSlug, onFileSelected, ctx) {
  const memHost = block.querySelector('#ie-members');
  if (memHost && ctx) {
    if (ctx.members) ctx.members.destroy();
    ctx.members = mountMembers(memHost, {
      parentId: ctx.itemId || null,
      children: ctx.children || [],
      onChange: ctx.onMembersChange || function () {},
      // Navigation belongs to the assembling mount (it owns the stack); this module only forwards
      // it, so the Apostila and Lessons mounts, which pass none of these, keep the old behaviour.
      onOpen: ctx.onOpenMember || null,
      onCreateInside: ctx.onCreateInside || null,
      canOpen: ctx.canOpenMember || null,
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
  } else if (isBundleSlug(typeSlug)) {
    // Only written when the user turned it OFF, for the same reason the raw flag is: absence has
    // to keep meaning "the default", or every package saved once would gain an opinion it never
    // expressed. `buildTypeBlock` reads `!== false`, so absent and true are the same thing.
    const zipEl = root.querySelector('#ie-zip-intro');
    meta_json = (zipEl && !zipEl.checked) ? { zip_intro: false } : {};
  } else if (typeSlug === 'material') {
    meta_json = {};
  } else if (FILE_TYPES.indexOf(typeSlug) >= 0) {
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
