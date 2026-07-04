// content/item-creator.js
// Codex-native "content-first" item creation step (step 1 of 2). Clean ES-module
// port of the legacy window.CTItemCreator: facade-only backend, cdx- styling,
// every string via t(). The legacy global stays live for ClassVault/ClassTrail.
//
// Mount options (the public surface Items relies on):
//   container   element to render into
//   types / tags   ct_types / ct_tags rows (passed to the AI system prompt)
//   titleLabel / closeLabel   header + close-button text ('' hides close)
//   onClose() / onCancel()
//   onManual({ body_md })                       user picked "Continue manually"
//   onFile({ file })                            user picked a local/Drive file (arquivo item)
//   onAIComplete({ prefill, aiContext, tagLabels })   AI step succeeded
// Returns: { destroy() }
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.bsLog/window.dbg (../backstage/js/debug.js)       optional debug pill
import { appConfig, content as api, ai as aiApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { glyphSvg } from '../js/glyphs.js';
import { createDriveSource, pickLocalFile } from '../js/file-source.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import * as aiSpec from '../js/ai-spec.js';

// Google Picker key for the "Arquivo do Drive" import option: fetched once, read live by the
// shared Drive source (same as the Slides gallery + the arquivo type editor). The Drive button
// stays hidden until it lands, so the local-file option always works on its own.
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

// AI action glyph (shared sparkle from the Codex glyph library; no emoji).
const AI_GLYPH = glyphSvg('sparkle', { cls: 'cdx-btn-glyph', size: 15 });

import { esc as _esc } from '../js/dom.js';
// Surface AI failures to the debug pill (a client-side parse failure never
// reaches callWorker's logging, so log it here with a response snippet).
function _logAi(detail, res) {
  const snippet = res && res.text ? String(res.text).slice(0, 400)
    : (res == null ? 'null (rate-limited?)' : JSON.stringify(res).slice(0, 400));
  if (typeof window.bsLog === 'function') window.bsLog('AI format | ' + detail + ' | response: ' + snippet, 'error');
  if (typeof window.dbg === 'function') window.dbg('error', 'AI format: ' + detail);
}

export function mount(container, opts) {
  opts = opts || {};
  const types = opts.types || [];
  const tags = opts.tags || [];
  const titleLabel = opts.titleLabel || t('content.new_item_step1');
  const closeLabel = opts.closeLabel != null ? opts.closeLabel : t('content.close');
  const onClose = opts.onClose || function () {};
  const onCancel = opts.onCancel || function () {};
  const onManual = opts.onManual || function () {};
  const onFile = opts.onFile || function () {};
  const onAIComplete = opts.onAIComplete || function () {};

  const closeBtn = closeLabel
    ? '<button class="cdx-btn cdx-btn-sm" id="cf-close">' + _esc(closeLabel) + '</button>'
    : '';

  container.innerHTML =
    '<div class="cdx-editor">' +
      '<div class="cdx-editor-header">' +
        '<span class="cdx-editor-title">' + _esc(titleLabel) + '</span>' +
        closeBtn +
      '</div>' +
      '<div class="cdx-editor-body">' +
        '<div class="cdx-field">' +
          '<label>' + t('creator.raw_label') + '</label>' +
          '<textarea id="cf-raw" rows="10" placeholder="' + _esc(t('creator.raw_placeholder')) + '"></textarea>' +
        '</div>' +
        '<div class="cdx-gdoc-row">' +
          '<span class="cdx-helper-text">' + t('creator.gdoc_prompt') + '</span>' +
          '<div class="cdx-gdoc-inline">' +
            '<input type="text" id="cf-gdoc-url" placeholder="' + _esc(t('creator.gdoc_url_placeholder')) + '" style="flex:1;min-width:0">' +
            '<button class="cdx-btn cdx-btn-sm" id="cf-gdoc-load" type="button">' + t('creator.load') + '</button>' +
          '</div>' +
          '<p class="cdx-helper-text" id="cf-gdoc-hint">' + t('creator.gdoc_hint') + '</p>' +
        '</div>' +
        '<div class="cdx-gdoc-row">' +
          '<span class="cdx-helper-text">' + t('creator.file_prompt') + '</span>' +
          '<div class="cdx-gdoc-inline">' +
            '<button class="cdx-btn cdx-btn-sm" id="cf-file-local" type="button">' + t('editor.file_from_computer') + '</button>' +
            '<button class="cdx-btn cdx-btn-sm" id="cf-file-drive" type="button" style="display:none">' + t('editor.file_from_drive') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-emoji-toggle-row">' +
          '<label class="cdx-toggle-label">' +
            '<span class="cdx-toggle">' +
              '<input type="checkbox" id="cf-emoji-toggle" checked>' +
              '<span class="cdx-toggle-slider"></span>' +
            '</span>' +
            '<span class="cdx-toggle-text">' + t('creator.emoji_toggle') + '</span>' +
          '</label>' +
          '<p class="cdx-helper-text">' + t('creator.emoji_helper') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-editor-footer">' +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" id="cf-cancel">' + t('content.cancel') + '</button>' +
          '<button class="cdx-btn" id="cf-manual" type="button">' + t('creator.manual') + '</button>' +
          '<button class="cdx-btn cdx-btn-primary" id="cf-ai" type="button">' + AI_GLYPH + ' ' + t('creator.ai_format') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const rawEl = container.querySelector('#cf-raw');
  rawEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.stopPropagation(); });

  const closeEl = container.querySelector('#cf-close');
  if (closeEl) closeEl.addEventListener('click', onClose);
  container.querySelector('#cf-cancel').addEventListener('click', onCancel);

  // GDoc single-item loader: fetches body_md and pastes it into the raw textarea.
  container.querySelector('#cf-gdoc-load').addEventListener('click', function () {
    const url = container.querySelector('#cf-gdoc-url').value.trim();
    if (!url) { toast.err(t('creator.gdoc_url_required')); return; }
    const btn = container.querySelector('#cf-gdoc-load');
    btn.disabled = true;
    btn.textContent = t('creator.loading');
    api.ingestGdoc({ url, mode: 'single' }).then((res) => {
      btn.disabled = false;
      btn.textContent = t('creator.load');
      if (res && res.preview && res.preview.body_md) {
        rawEl.value = res.preview.body_md;
        rawEl.focus();
        toast.ok(t('creator.gdoc_imported'));
      } else {
        toast.err(t('creator.gdoc_empty'));
      }
    }).catch((err) => {
      btn.disabled = false;
      btn.textContent = t('creator.load');
      // api-client already logged the failure to the pill; show the user the
      // actionable fix (the common cause is the doc not being shared publicly).
      notice.warn(t('creator.gdoc_not_shared'));
    });
  });

  // Arquivo import: pick any file from the computer OR Google Drive (shared file-source
  // module) and hand it to onFile, which opens the item form as an 'arquivo' item with the
  // file attached, as easy as importing a Google Doc. Drive button hides until the key lands.
  _primePickerKey();
  const fileLocal = container.querySelector('#cf-file-local');
  const fileDrive = container.querySelector('#cf-file-drive');
  if (fileLocal) fileLocal.addEventListener('click', async () => {
    const f = await pickLocalFile({});
    if (f) onFile({ file: f });
  });
  if (fileDrive) {
    const src = _fileDriveSource();
    const sync = () => { fileDrive.style.display = src.available() ? '' : 'none'; };
    _primePickerKey().then(sync).catch(() => {});
    fileDrive.addEventListener('click', async () => {
      const f = await src.pick({ view: 'any' });
      if (f) onFile({ file: f });
    });
  }

  container.querySelector('#cf-manual').addEventListener('click', function () {
    onManual({ body_md: rawEl.value });
  });

  container.querySelector('#cf-ai').addEventListener('click', async function () {
    const raw = rawEl.value.trim();
    if (!raw) { toast.err(t('creator.raw_required')); return; }
    const addEmojis = container.querySelector('#cf-emoji-toggle').checked;
    const btn = this;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = t('creator.ai_generating');
    try {
      const systemPrompt = aiSpec.buildSystemPrompt(types, tags, { addEmojis });
      const res = await aiApi.chat({
        system: systemPrompt,
        messages: [{ role: 'user', content: raw }],
        temperature: 0.3,
        max_tokens: aiSpec.MAX_TOKENS
      });
      if (!res || !res.text) { _logAi('no content', res); notice.internal(t('creator.ai_no_content')); return; }
      let parsed = aiSpec.parseModelJson(res.text);
      if (!parsed || !parsed.body_md) { _logAi('unparseable / no body_md', res); notice.internal(t('creator.ai_bad_format')); return; }
      parsed = aiSpec.enforcePromptVerbatim(parsed, raw);
      // Truncation guard. Deferred cleanup: convert to a cdx confirm modal.
      if (parsed.type !== 'prompt' && aiSpec.looksTruncated(raw, parsed.body_md)) {
        if (!window.confirm(t('creator.ai_truncated_confirm'))) return;
      }
      const prefill = {
        title:   parsed.title   || '',
        summary: parsed.summary || '',
        type:    parsed.type    || (types[0] && types[0].slug),
        body_md: parsed.body_md || raw
      };
      const aiContext = { rawInput: raw, firstOutput: parsed, addEmojis };
      onAIComplete({ prefill, aiContext, tagLabels: parsed.tag_labels || [] });
    } catch (e) {
      _logAi('exception', null);
      notice.internal(t('content.error') + ': ' + ((e && e.message) || e));
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  return {
    destroy: () => { container.innerHTML = ''; }
  };
}
