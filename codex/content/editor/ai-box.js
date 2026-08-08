// content/editor/ai-box.js
// The content-first box that opens the item editor: paste or import the raw text, let the AI read
// it, and have it fill the fields below.
//
// This used to be a whole separate screen (content/item-creator.js, "step 1 of 2"), and creating
// an item meant crossing from it into the editor. Élder, 2026-08-06: "I think this all has to
// become one screen, especially because when editing you only ever see the second one, which is
// terrible". So the step became a block, the editor grew it at the top, and creating and editing
// are now the same screen with the same affordances.
//
// It does not own any field it fills. It hands a parsed result to the caller and the caller
// writes the fields, because the fields belong to the editor and are also editable by hand.
//
// mount(host, opts) -> { value(), verbatim(), setVerbatim(b), pendingFile(), reset(), destroy() }
//   opts.types / opts.tags     feed the AI system prompt
//   opts.initialVerbatim       true | false | null (null = nobody chose yet)
//   opts.compact               true hides the import row (inline hosts, e.g. the lessons pane)
//   opts.onResult(parsed)      an AI pass succeeded; parsed carries body_raw + body_ai + verbatim
//   opts.onDirty()             the user typed or toggled something
import { appConfig, ai as aiApi, content as api } from '../../js/codex-api.js';
import { t } from '../../js/i18n.js';
import { glyphSvg } from '../../js/glyphs.js';
import { esc as _esc } from '../../js/dom.js';
import { createDriveSource, pickLocalFile } from '../../js/file-source.js';
import { extractText, hasExtractableText } from '../../js/file-text.js';
import { AI_CHOICES, getChoice, setChoice, paramsFor } from '../../js/ai-models.js';
import { openMenu } from '../../js/menu.js';
import * as aiSpec from '../../js/ai-spec.js';
import * as notice from '../../js/notice.js';
import * as toast from '../../js/toast.js';

const AI_GLYPH = glyphSvg('sparkle', { cls: 'cdx-btn-glyph', size: 15 });

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

// Client-side parse failures never reach callWorker's logging, so they get logged here with a
// snippet of what came back. Without it "the AI did nothing" is unexplainable after the fact.
function _logAi(detail, res) {
  const snippet = res && res.text ? String(res.text).slice(0, 400)
    : (res == null ? 'null (rate-limited?)' : JSON.stringify(res).slice(0, 400));
  if (typeof window.bsLog === 'function') window.bsLog('AI format | ' + detail + ' | response: ' + snippet, 'error');
  if (typeof window.dbg === 'function') window.dbg('error', 'AI format: ' + detail);
}

export function mount(host, opts = {}) {
  const types = opts.types || [];
  const tags = opts.tags || [];
  const onResult = opts.onResult || function () {};
  const onDirty = opts.onDirty || function () {};
  // null means nobody chose: the AI's own type guess decides, which is what keeps every existing
  // item behaving exactly as before. Once the user touches the checkbox it stops being null and
  // the choice wins over the guess.
  let verbatim = (typeof opts.initialVerbatim === 'boolean') ? opts.initialVerbatim : null;
  let pickedFile = null;

  const importRow = opts.compact ? '' :
    '<div class="cdx-aib-sources">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" id="aib-file">' + t('editor.file_from_computer') + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" id="aib-drive" style="display:none">' + t('editor.file_from_drive') + '</button>' +
      '<input type="text" id="aib-gdoc" placeholder="' + _esc(t('creator.gdoc_url_placeholder')) + '">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" id="aib-gdoc-load">' + t('creator.load') + '</button>' +
    '</div>' +
    '<div class="cdx-aib-picked" id="aib-picked" style="display:none">' +
      '<span id="aib-filename"></span>' +
      '<label class="cdx-radio-label"><input type="radio" name="aib-mode" value="extract" checked> ' + _esc(t('creator.file_extract')) + '</label>' +
      '<label class="cdx-radio-label"><input type="radio" name="aib-mode" value="download"> ' + _esc(t('creator.file_download')) + '</label>' +
      '<span class="cdx-helper-text" id="aib-status"></span>' +
    '</div>';

  host.innerHTML =
    '<div class="cdx-field cdx-aib">' +
      '<label>' + t('creator.raw_label') +
        '<span class="cdx-aib-actions">' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary" id="aib-run">' + AI_GLYPH + ' ' + t('creator.ai_format') + '</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-primary cdx-ai-pick" id="aib-pick" title="' + _esc(t('editor.ai_which')) + '">▾</button>' +
        '</span>' +
      '</label>' +
      '<textarea id="aib-raw" rows="6" placeholder="' + _esc(t('creator.raw_placeholder')) + '"></textarea>' +
      importRow +
      '<div class="cdx-aib-flags">' +
        '<label class="cdx-radio-label"><input type="checkbox" id="aib-emoji" checked> ' + _esc(t('creator.emoji_toggle')) + '</label>' +
        '<label class="cdx-radio-label"><input type="checkbox" id="aib-verbatim"' + (verbatim ? ' checked' : '') + '> ' + _esc(t('editor.keep_raw')) + '</label>' +
      '</div>' +
    '</div>';

  const rawEl = host.querySelector('#aib-raw');
  const verbEl = host.querySelector('#aib-verbatim');
  rawEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.stopPropagation(); });
  rawEl.addEventListener('input', onDirty);

  verbEl.addEventListener('change', () => {
    verbatim = verbEl.checked;
    onDirty();
    // Flipping the checkbox costs no AI call: applyVerbatim kept both bodies, so the caller can
    // swap the field content from what it already has.
    if (_last) onResult(aiSpec.applyVerbatim(_last, _last.body_raw, verbatim));
  });
  let _last = null;

  // Which AI answers. The caret sits ON the AI button because the choice is about that action,
  // not a screen preference parked in a corner.
  const pickEl = host.querySelector('#aib-pick');
  const paintChoice = () => { pickEl.title = t('editor.ai_which') + ': ' + getChoice().label; };
  paintChoice();
  pickEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = getChoice().id;
    openMenu(pickEl, AI_CHOICES.map((c) => ({
      label: (c.id === current ? '✓ ' : '   ') + c.label,
      onClick: () => { setChoice(c.id); paintChoice(); },
    })));
  });

  // ── importing raw text ────────────────────────────────────────────────────
  const fileMode = () => {
    const r = host.querySelector('input[name="aib-mode"]:checked');
    return r ? r.value : 'extract';
  };
  async function onFilePicked(f) {
    if (!f) return;
    pickedFile = f;
    const panel = host.querySelector('#aib-picked');
    const nameEl = host.querySelector('#aib-filename');
    const statusEl = host.querySelector('#aib-status');
    if (nameEl) nameEl.textContent = f.name;
    if (panel) panel.style.display = '';
    onDirty();
    if (hasExtractableText(f)) {
      if (statusEl) statusEl.textContent = t('creator.file_extracting');
      let text = '';
      try { text = await extractText(f); } catch (_) { text = ''; }
      if (text) { rawEl.value = text; if (statusEl) statusEl.textContent = t('creator.file_extracted'); }
      else if (statusEl) statusEl.textContent = t('creator.file_no_text');
    } else if (statusEl) {
      statusEl.textContent = t('creator.file_no_text');
    }
  }

  if (!opts.compact) {
    _primePickerKey();
    const fileBtn = host.querySelector('#aib-file');
    const driveBtn = host.querySelector('#aib-drive');
    fileBtn.addEventListener('click', async () => { await onFilePicked(await pickLocalFile({})); });
    const src = createDriveSource({
      getApiKey: () => _pickerKey,
      getToken: () => (window.BS_GOOGLE ? window.BS_GOOGLE.requestToken() : null),
    });
    _primePickerKey().then(() => { driveBtn.style.display = src.available() ? '' : 'none'; }).catch(() => {});
    driveBtn.addEventListener('click', async () => { await onFilePicked(await src.pick({ view: 'any' })); });

    host.querySelector('#aib-gdoc-load').addEventListener('click', function () {
      const url = host.querySelector('#aib-gdoc').value.trim();
      if (!url) { toast.err(t('creator.gdoc_url_required')); return; }
      const btn = this;
      btn.disabled = true;
      btn.textContent = t('creator.loading');
      api.ingestGdoc({ url, mode: 'single' }).then((res) => {
        btn.disabled = false;
        btn.textContent = t('creator.load');
        if (res && res.preview && res.preview.body_md) {
          rawEl.value = res.preview.body_md;
          rawEl.focus();
          onDirty();
          toast.ok(t('creator.gdoc_imported'));
        } else {
          toast.err(t('creator.gdoc_empty'));
        }
      }).catch(() => {
        btn.disabled = false;
        btn.textContent = t('creator.load');
        // api-client already logged the failure; show the actionable fix instead, since the
        // usual cause is a doc that was never shared publicly.
        notice.warn(t('creator.gdoc_not_shared'));
      });
    });
  }

  // ── the AI pass ───────────────────────────────────────────────────────────
  host.querySelector('#aib-run').addEventListener('click', async function () {
    const raw = rawEl.value.trim();
    // A file with no extractable text (an image, a binary) still gets a pass from its metadata:
    // the AI does what it can with the filename and type rather than refusing outright.
    const isDownload = pickedFile && fileMode() === 'download';
    const aiInput = raw || (pickedFile
      ? ('Arquivo para os alunos: ' + pickedFile.name + (pickedFile.type ? ' (' + pickedFile.type + ')' : ''))
      : '');
    if (!aiInput) { toast.err(t('creator.raw_required')); return; }
    const addEmojis = host.querySelector('#aib-emoji').checked;
    const btn = this;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = t('creator.ai_generating');
    try {
      const res = await aiApi.chat(Object.assign({
        system: aiSpec.buildSystemPrompt(types, tags, { addEmojis }),
        messages: [{ role: 'user', content: aiInput }],
        temperature: 0.3,
        max_tokens: aiSpec.MAX_TOKENS,
      }, paramsFor(getChoice().id)));
      if (!res || !res.text) { _logAi('no content', res); notice.internal(t('creator.ai_no_content')); return; }
      let parsed = aiSpec.parseModelJson(res.text);
      if (!parsed || !parsed.body_md) { _logAi('unparseable / no body_md', res); notice.internal(t('creator.ai_bad_format')); return; }
      parsed = aiSpec.applyVerbatim(parsed, aiInput, verbatim);
      _last = parsed;
      // The checkbox catches up with what the AI decided, so the screen never disagrees with
      // the text it is showing.
      verbatim = parsed.verbatim;
      verbEl.checked = !!verbatim;
      if (isDownload) parsed.type = 'arquivo';   // the file IS the item; the AI still filled the rest
      if (parsed.type !== 'prompt' && aiSpec.looksTruncated(aiInput, parsed.body_md)) {
        if (!window.confirm(t('creator.ai_truncated_confirm'))) return;
      }
      onResult(parsed, { addEmojis, rawInput: aiInput, file: isDownload ? pickedFile : null });
    } catch (e) {
      _logAi('exception', null);
      notice.internal(t('content.error') + ': ' + ((e && e.message) || e));
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  return {
    value: () => rawEl.value,
    verbatim: () => verbatim,
    setVerbatim: (b) => { verbatim = b; verbEl.checked = !!b; },
    pendingFile: () => (pickedFile && fileMode() === 'download' ? pickedFile : null),
    reset: () => { rawEl.value = ''; pickedFile = null; _last = null; },
    destroy: () => { host.innerHTML = ''; },
  };
}
