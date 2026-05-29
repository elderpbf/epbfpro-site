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
//   onAIComplete({ prefill, aiContext, tagLabels })   AI step succeeded
// Returns: { destroy() }
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CT_AI_SPEC      (../backstage/js/ct-ai-spec.js)  prompt-building logic
//   window.BSToast         (../backstage/js/bs-toast.js)     optional toast
//   window.bsLog/window.dbg (../backstage/js/debug.js)       optional debug pill
import { content as api, ai as aiApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { glyphSvg } from '../js/glyphs.js';

// AI action glyph (shared sparkle from the Codex glyph library; no emoji).
const AI_GLYPH = glyphSvg('sparkle', { cls: 'cdx-btn-glyph', size: 15 });

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _toast(msg) {
  if (window.BSToast && window.BSToast.show) window.BSToast.show(msg);
}
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
    if (!url) { _toast(t('creator.gdoc_url_required')); return; }
    const btn = container.querySelector('#cf-gdoc-load');
    btn.disabled = true;
    btn.textContent = t('creator.loading');
    api.ingestGdoc({ url, mode: 'single' }).then((res) => {
      btn.disabled = false;
      btn.textContent = t('creator.load');
      if (res && res.preview && res.preview.body_md) {
        rawEl.value = res.preview.body_md;
        rawEl.focus();
        _toast(t('creator.gdoc_imported'));
      } else {
        _toast(t('creator.gdoc_empty'));
      }
    }).catch((err) => {
      btn.disabled = false;
      btn.textContent = t('creator.load');
      _toast(t('creator.gdoc_error') + ' ' + ((err && err.message) || err));
    });
  });

  container.querySelector('#cf-manual').addEventListener('click', function () {
    onManual({ body_md: rawEl.value });
  });

  container.querySelector('#cf-ai').addEventListener('click', async function () {
    const raw = rawEl.value.trim();
    if (!raw) { _toast(t('creator.raw_required')); return; }
    const addEmojis = container.querySelector('#cf-emoji-toggle').checked;
    const btn = this;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = t('creator.ai_generating');
    try {
      const systemPrompt = window.CT_AI_SPEC.buildSystemPrompt(types, tags, { addEmojis });
      const res = await aiApi.chat({
        system: systemPrompt,
        messages: [{ role: 'user', content: raw }],
        temperature: 0.3,
        max_tokens: window.CT_AI_SPEC.MAX_TOKENS
      });
      if (!res || !res.text) { _logAi('no content', res); _toast(t('creator.ai_no_content')); return; }
      let parsed = window.CT_AI_SPEC.parseModelJson(res.text);
      if (!parsed || !parsed.body_md) { _logAi('unparseable / no body_md', res); _toast(t('creator.ai_bad_format')); return; }
      parsed = window.CT_AI_SPEC.enforcePromptVerbatim(parsed, raw);
      // Truncation guard. Deferred cleanup: convert to a cdx confirm modal.
      if (parsed.type !== 'prompt' && window.CT_AI_SPEC.looksTruncated(raw, parsed.body_md)) {
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
      _toast(t('content.error') + ': ' + ((e && e.message) || e));
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  return {
    destroy: () => { container.innerHTML = ''; }
  };
}
