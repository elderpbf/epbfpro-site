// content/item-form.js
// Codex-native item editor. ONE screen: the AI box, the shared fields, the per-type block and,
// for a package, the member list, all in the same mount. The "step 1 / step 2" pair is gone
// (Élder 2026-08-06: "isto tudo tem que virar uma tela só... na edição a gente só vê a segunda
// tela, o que é péssimo").
//
// This file ASSEMBLES; it does not know content types (editor/type-block.js does), it does not
// know the AI (editor/ai-box.js does), it does not know what a navigation stack is
// (editor/nav.js does) and it does not paint the breadcrumb (editor/breadcrumb.js does).
//
// Two layers live here, and the split is the point:
//   mount()        owns the STACK: which item you are editing right now, what you left behind on
//                  the way in, and the single Save that writes all of it.
//   _mountLevel()  owns ONE level: the fields on screen. It has no idea it might be level two.
// Before this split, stepping into a member meant the host closing one modal and opening another,
// which is exactly how the old two-screen flow lost what you had typed.
//
// Mount options (the public surface the three hosts rely on):
//   container   element to render into
//   item        existing item for edit mode; null/undefined => create mode
//   prefill     initial values for create mode
//   aiContext   { rawInput, firstOutput, addEmojis } enables "Refazer" from the start
//   types       ct_types rows (slug, label, icon, family)
//   tags        ct_tags rows (id, label); mutated in place when a tag is created inline
//   titleLabel / saveLabel / closeLabel   header + button text ('' hides close)
//   excludeTypes  type slugs to hide from the dropdown
//   onCreateType(cb)  user picked "+ new type"; caller opens its modal then calls cb(slug|null)
//   onDeleteItem(item, done)  host owns the confirm + the release checks; absent => no button
//   saveFn(params, ctx)       host-owned persistence (the Apostila writes into a set)
//   onSave(savedItem) / onCancel() / onDirtyChange(isDirty)
// Returns: { isDirty(), getState(), destroy() }
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.bsLog/window.dbg (../backstage/js/debug.js)       optional debug pill
//   window.marked          (CDN, lazy)                       markdown preview
import { content as api, ai as aiApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { glyphSvg, iconHtml } from '../js/glyphs.js';
import {
  buildTypeBlock, wireTypeBlock, collectTypeData, mergeItemMeta, setBundleSlugs, isBundleSlug, renderMarkdown,
  buildZipIntro, contentBoxSpec, contentBoxChanged,
} from './editor/type-block.js';
import { installResizer } from '../js/resizable.js';
import { mount as mountAiBox } from './editor/ai-box.js';
import { createNav, planSave, resolveMembers, isNewKey, MAX_DEPTH } from './editor/nav.js';
import { breadcrumbHtml, wireBreadcrumb } from './editor/breadcrumb.js';
import * as aiSpec from '../js/ai-spec.js';
import { getChoice, paramsFor } from '../js/ai-models.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';

// AI action glyph (shared sparkle from the Codex glyph library; no emoji).
const AI_GLYPH = glyphSvg('sparkle', { cls: 'cdx-btn-glyph', size: 15 });

import { esc as _esc } from '../js/dom.js';
import { isVerbatim } from '../js/item-download.js';

import { errMsg as _err } from '../js/content-err.js';

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

// Resolve the AI's tag labels to ids, MATCHING ONLY. It used to create whatever the model named,
// which is how a Wikipedia paste minted a brand-new "história" tag in the archive. Élder
// 2026-08-08: the screen promises "ela escolhe tipo e etiqueta entre os que já existem... quando
// nada serve, deixa em branco em vez de inventar categoria", and it was not true.
//
// Creating a tag is a deliberate act and it still has its button ("+ etiqueta"). What the model
// cannot do is grow the vocabulary as a side effect of reading a document, because a taxonomy
// that anything can add to stops being one.
function _tagsByLabels(tags, labels) {
  const ids = [];
  for (const raw of labels) {
    const label = (raw || '').trim();
    if (!label) continue;
    const existing = tags.find((tg) => tg.label.toLowerCase() === label.toLowerCase());
    if (existing) ids.push(existing.id);
  }
  return Promise.resolve(ids);
}

// The header sentence. Élder 2026-08-07 asked the header to SAY WHAT IT IS: with the stack, an
// unlabelled header at level two is indistinguishable from level one, and "Editar item" over a
// package is simply wrong.
function _headerLabel(isEdit, typeSlug, title) {
  const what = isBundleSlug(typeSlug) ? t('editor.header_bundle') : t('editor.header_item');
  if (!isEdit) return t('editor.header_new') + ' ' + what;
  const clean = String(title || '').replace(/^#+\s*/, '').trim();
  return t('editor.header_editing') + ' ' + what + (clean ? ' «' + clean + '»' : '');
}

// ───────────────────────── one level ─────────────────────────
// Everything below is a single editing surface. It knows nothing about the stack: it is HANDED
// callbacks (_onOpenChild, _onCreateChild, _onCrumb, _onSaveAll, _onBack) and calls them.
function _mountLevel(container, opts) {
  opts = opts || {};
  const item = opts.item || null;
  const prefill = opts.prefill || null;
  const aiContext = opts.aiContext || null;
  const types = opts.types || [];
  setBundleSlugs(types);   // which type is a PACKAGE comes from the registry, not a fixed slug
  const tags = opts.tags || [];
  const closeLabel = opts.closeLabel != null ? opts.closeLabel : t('content.close');
  const onCancel = opts.onCancel || function () {};
  const onDirtyChange = opts.onDirtyChange || function () {};
  const onCreateType = opts.onCreateType || null;
  const excludeTypes = Array.isArray(opts.excludeTypes) ? opts.excludeTypes : [];
  const pendingFile = opts.pendingFile || null; // a File chosen before the editor opened

  const nav = opts._nav || null;
  const depth = nav ? nav.depth() : 1;
  const isNested = depth > 1;

  const isEdit = !!item;
  const src = prefill || item || {};
  const _firstVisibleType = excludeTypes.length
    ? types.find((ty) => excludeTypes.indexOf(ty.slug) < 0)
    : types[0];
  const initialType = src.type || (isEdit ? item.type : null) || (_firstVisibleType && _firstVisibleType.slug) || 'prompt';
  const initialTitle = src.title != null ? src.title : '';
  const initialSummary = src.summary != null ? src.summary : '';
  const initialBody = src.body_md != null ? src.body_md : '';
  const initialMeta = src.meta_json
    ? (typeof src.meta_json === 'string' ? JSON.parse(src.meta_json) : src.meta_json)
    : {};
  const initialTagIds = Array.isArray(src.tag_ids)
    ? src.tag_ids
    : (isEdit && Array.isArray(item.tags) ? item.tags.map((tg) => tg.id) : []);

  const titleLabel = opts.titleLabel || _headerLabel(isEdit, initialType, initialTitle);
  const saveLabel = opts.saveLabel || (isNested ? t('editor.save_all') : (isEdit ? t('content.save') : t('content.create')));

  // "Refazer" only makes sense once there IS a first AI output to compare against (Élder's #29g).
  // It ships hidden and the AI box reveals it, instead of the host having to pass an aiContext
  // that only the deleted creator screen ever built.
  const refazerBtn = '<button class="cdx-btn" id="ie-refazer-btn" type="button"' +
    (aiContext ? '' : ' hidden') + '>' + AI_GLYPH + ' ' + t('editor.refazer') + '</button>';
  const closeBtn = closeLabel
    ? '<button class="cdx-btn cdx-btn-sm" id="ie-close">' + _esc(closeLabel) + '</button>'
    : '';
  const deleteBtn = (isEdit && typeof opts.onDeleteItem === 'function')
    ? '<button class="cdx-btn cdx-btn-danger" id="ie-delete" type="button">' + _esc(t('editor.delete_item')) + '</button>'
    : '';

  // ── the layout Élder approved (candidate D, 2026-08-06) ────────────────────
  // TWO COLUMNS with a draggable grip: the item on the left, what is inside it on the right.
  // Not decoration, and I got this wrong once by shipping a single column: with one column the
  // member list sits below the fold, so building a package means scrolling between the thing and
  // its contents. His words when he saw the single column: "there's no right panel... it's like it
  // was fully reversed".
  //
  // The order inside the left column is also his: the CONTENT BOX FIRST, with the AI attached to
  // it, and the identification (title, type, tags, summary) under it. Content first is the point
  // of the merge, because the AI reads what you pasted and fills the rest.
  const wide = '<div class="cdx-ie-toggle" role="group">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-pack="0">' + _esc(t('editor.kind_item')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-pack="1">' + _esc(t('editor.kind_bundle')) + '</button>' +
    '</div>';

  container.innerHTML = '<div class="cdx-editor cdx-ie">' +
    '<div class="cdx-editor-header">' +
      '<span class="cdx-editor-title">' + _esc(titleLabel) + '</span>' +
      wide +
      closeBtn +
    '</div>' +
    '<div class="cdx-editor-body cdx-ie-body">' +
      '<div class="cdx-ie-two" id="ie-split">' +
        '<div class="cdx-ie-left">' +
          // The content box owns #ie-body and carries the AI, the imports and the raw flag.
          '<div id="ie-aibox"></div>' +
          '<div id="ie-zipintro"></div>' +
          '<p class="cdx-ie-note">' + _esc(t('editor.ai_note')) + '</p>' +
          // THE ORDER, and it is the question Élder asked to have answered rather than guessed
          // ("analyse the order of the content so we can make this more reasonable"). Content
          // first, because that is what you arrive with and what the AI reads. Then the two prose
          // fields you read back and correct, title and summary, together because they are the
          // same act. Classification last, because type and tags are the only fields the archive
          // needs and you do not. Summary used to sit BELOW the chips, which split the prose in
          // two around a grid of buttons.
          '<div class="cdx-field"><label>' + t('editor.title_label') + '</label>' +
            '<input type="text" id="ie-title" value="' + _esc(initialTitle) + '" placeholder="' + _esc(t('editor.title_placeholder')) + '">' +
          '</div>' +
          '<div class="cdx-field"><label>' + t('editor.summary_label') + '</label>' +
            '<input type="text" id="ie-summary" value="' + _esc(initialSummary) + '" placeholder="' + _esc(t('editor.summary_placeholder')) + '">' +
          '</div>' +
          // Type and tags side by side: one full row each pushed the list off the screen, and the
          // wide modal is what makes them fit together.
          '<div class="cdx-ie-row2">' +
            '<div class="cdx-field"><label>' + t('editor.type_label') + '</label>' +
              '<input type="hidden" id="ie-type" value="' + _esc(initialType) + '">' +
              '<div class="cdx-type-opts" id="ie-type-opts"></div>' +
            '</div>' +
            '<div class="cdx-field"><label>' + t('editor.tags_label') + '</label>' +
              '<div class="cdx-tag-picker" id="ie-tag-picker"></div>' +
            '</div>' +
          '</div>' +
          '<div id="ie-extras"></div>' +
        '</div>' +
        '<div class="cdx-ie-right" id="ie-right"></div>' +
      '</div>' +
    '</div>' +
    (nav ? '<div id="ie-crumbs">' + breadcrumbHtml(nav.path()) + '</div>' : '') +
    '<div class="cdx-editor-footer">' +
      '<div class="cdx-modal-actions">' +
        deleteBtn +
        (isNested
          ? '<button class="cdx-btn" id="ie-back">&#8592; ' + _esc(t('editor.back_to_parent')) + '</button>'
          : '<button class="cdx-btn" id="ie-cancel">' + t('content.cancel') + '</button>') +
        refazerBtn +
        '<button class="cdx-btn cdx-btn-primary" id="ie-save">' + _esc(saveLabel) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  const root = container;
  const selectedTagIds = new Set(initialTagIds);
  let _pendingAssetFile = null;
  let _pendingAssetField = null;
  // A package's members are not meta_json: they are ct_item_members rows, written AFTER the save
  // (a brand-new item has no id yet to be a parent).
  const _memberCtx = {
    itemId: isEdit && item ? item.id : null,
    children: (src.children || (isEdit && item && item.children) || []),
    members: null,
    onMembersChange: () => markDirty(),
    onOpenMember: opts._onOpenChild || null,
    onCreateInside: opts._onCreateChild || null,
    canOpenMember: opts._canOpenChild || null,
  };
  const typeSel = root.querySelector('#ie-type');
  const typeOptsEl = root.querySelector('#ie-type-opts');
  let lastTypeValue = initialType;
  let isDirty = false;

  function markDirty() { if (!isDirty) { isDirty = true; onDirtyChange(true); } }

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

  // Local mirror of the handle's hasContent(), because the toggle is wired before the handle
  // object exists.
  function level_hasContent() {
    return !!(root.querySelector('#ie-title').value.trim() || _currentBody().trim());
  }

  function _syncHeader() {
    const h = root.querySelector('.cdx-editor-title');
    if (h && !opts.titleLabel) {
      h.textContent = _headerLabel(isEdit, typeSel.value, root.querySelector('#ie-title').value);
    }
  }

  // A PACKAGE's extras are its member list, and that belongs in the RIGHT column. Every other
  // type's extras (platform tabs, an upload, a paper's authors) belong under the fields on the
  // left. One function decides, so the two columns can never both claim the block.
  function renderTypeBlock(typeSlug) {
    const bundle = isBundleSlug(typeSlug);
    const left = root.querySelector('#ie-extras');
    const right = root.querySelector('#ie-right');
    const html = buildTypeBlock(typeSlug, _currentBody(), initialMeta);
    left.innerHTML = bundle ? '' : html;
    right.innerHTML = bundle ? html : '';
    // An ordinary item has nothing on the right, so the right column stops EXISTING and the grid
    // collapses to one. Élder 2026-08-08: "right side still open even when just 1 item". A panel
    // reserved for content that is not there is worse than no panel: it reads as broken.
    const split = root.querySelector('#ie-split');
    if (split) split.classList.toggle('is-single', !bundle);
    const block = bundle ? right : left;
    // The ".zip" choice only exists for a package, and it sits under the box it governs.
    root.querySelector('#ie-zipintro').innerHTML = bundle ? buildZipIntro(initialMeta) : '';
    wireTypeBlock(block, typeSlug, function (file, field) {
      _pendingAssetFile = file;
      _pendingAssetField = field;
      markDirty();
    }, _memberCtx);
    root.querySelectorAll('#ie-extras input, #ie-extras textarea, #ie-extras select, ' +
      '#ie-right input, #ie-right textarea, #ie-zipintro input').forEach((el) => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });
    _paintToggle(bundle);
  }

  // The Item|Pacote switch in the header, valid from the first frame. It was a two-door fork in an
  // earlier design and Élder killed it ("são 2 telas quando eu falei que só seria uma, e se eu
  // mudar de ideia depois a escolha já passou"). As a switch, changing your mind is one click and
  // it exists identically while editing.
  function _paintToggle(bundle) {
    root.querySelectorAll('[data-pack]').forEach((b) => {
      b.classList.toggle('cdx-btn-primary', (b.dataset.pack === '1') === !!bundle);
    });
  }

  // Switching type rebuilds the block, and the body has to survive the switch: typing a prompt,
  // realising it is a guide and losing the text is the kind of loss the one-screen editor was
  // supposed to end. Read before the rebuild, written into the new block.
  let _bodyCarry = initialBody;
  function _currentBody() {
    const el = root.querySelector('#ie-body');
    return el ? el.value : _bodyCarry;
  }
  // The AI context, filled by the first AI pass. Declared here because both the content box and
  // the Refazer button read it.
  let _aiCtx = aiContext;

  renderTypeBlock(initialType);

  // ── the AI box, mounted where the separate creator screen used to be ───────
  // It fills the fields; it does not own them. Every field it writes stays editable by hand,
  // which is the whole reason the two screens could merge without losing anything.
  // The CONTENT BOX. It owns #ie-body, so the body survives a type change for free: the box is not
  // rebuilt when the type block is. It IS rebuilt when the item crosses the item/package line,
  // because a package's box is a description with no file sources (a package is not a file).
  let _aiBox = null;
  function mountContent(typeSlug, keepValue) {
    const spec = contentBoxSpec(typeSlug);
    const prev = _aiBox ? { v: _aiBox.value(), verb: _aiBox.verbatim() } : null;
    if (_aiBox) _aiBox.destroy();
    _aiBox = mountAiBox(root.querySelector('#ie-aibox'), {
      types,
      tags,
      compact: !!opts.compact,
      // What the one box is FOR comes from type-block.js, the only module allowed to know that a
      // paper keeps complementary notes there or that a package must not offer file sources.
      label: t(spec.labelKey),
      placeholder: t(spec.placeholderKey),
      rows: spec.rows,
      sources: spec.sources,
      initialBody: keepValue && prev ? prev.v : _bodyCarry,
      initialVerbatim: prev ? prev.verb
        : (src.verbatim != null ? !!src.verbatim : (isEdit ? isVerbatim(item) : null)),
      renderMarkdown,
      onDirty: markDirty,
      onResult: (parsed, ctx) => {
        root.querySelector('#ie-title').value = parsed.title || '';
        root.querySelector('#ie-summary').value = parsed.summary || '';
        // Same rule as the tags: the model picks from the registry or it picks nothing. An
        // unregistered slug used to land in the field and render as "(não registrado)".
        const known = parsed.type && types.some((ty) => ty.slug === parsed.type);
        if (known && parsed.type !== typeSel.value) { typeSel.value = parsed.type; typeSel.dispatchEvent(new Event('change')); }
        _aiBox.setValue(parsed.body_md || '');
        _bodyCarry = parsed.body_md || '';
        // There IS a first output now, so comparing against it is meaningful. This is what makes
        // "Refazer" appear only after an AI pass instead of sitting there dead.
        _aiCtx = { rawInput: (ctx && ctx.rawInput) || '', firstOutput: parsed, addEmojis: !!(ctx && ctx.addEmojis) };
        const rb = root.querySelector('#ie-refazer-btn');
        if (rb) rb.hidden = false;
        // A file chosen as "use as a download" IS the item: seed the same pending-upload path the
        // arquivo type editor uses, so saving uploads it exactly as a hand-picked file would.
        if (ctx && ctx.file) {
          _pendingAssetFile = ctx.file;
          _pendingAssetField = 'attachment_url';
          const nm = root.querySelector('#ie-doc-filename');
          if (nm) nm.textContent = t('editor.file_selected') + ' ' + ctx.file.name;
        }
        _tagsByLabels(tags, parsed.tag_labels || []).then((ids) => {
          selectedTagIds.clear();
          ids.forEach((id) => selectedTagIds.add(id));
          _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);
        });
        _syncHeader();
        markDirty();
      },
    });
  }
  mountContent(initialType, false);

  // A file picked before the editor opened arrives as opts.pendingFile: seed the same
  // pending-upload path the type editor uses, and show the chosen name.
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
            // The type EXISTS now, so the local registry has to learn it or the chip keeps saying
            // "(não registrado)" about a type that was just created (Élder 2026-08-08). Refetched
            // rather than guessed, because the label and the glyph came from the create form.
            api.listTypes().then((r) => {
              const fresh = (r && r.types) || [];
              const row = fresh.find((ty) => ty.slug === newSlug);
              if (row && !types.some((ty) => ty.slug === newSlug)) {
                types.push(row);
                setBundleSlugs(types);
              }
              _refreshPicker(newSlug);
            }).catch((e) => { notice.internal(_err(e)); _refreshPicker(newSlug); });
            _refreshPicker(newSlug);
            lastTypeValue = newSlug;
            renderTypeBlock(newSlug);
            _syncHeader();
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
    // Leaving the bundle family with members inside would orphan them: only a bundle has a member
    // list, so the rows stop being shown and the next Save writes an empty list. Élder's guard
    // (#30) is to ASK, not to forbid: he may well want to empty a package and turn it into a
    // plain item. Refusing silently would be the worse half of both.
    const leavingBundle = isBundleSlug(lastTypeValue) && !isBundleSlug(typeSel.value);
    const memberCount = _memberCtx.members ? _memberCtx.members.rows().length : 0;
    if (leavingBundle && memberCount) {
      const goOn = window.confirm(t('editor.type_change_drops_members').replace('{n}', String(memberCount)));
      if (!goOn) {
        typeSel.value = lastTypeValue;
        _refreshPicker(lastTypeValue);
        return;
      }
    }
    _bodyCarry = _currentBody();
    // Rebuild the content box only when the new type changes what that box IS.
    const crossed = contentBoxChanged(lastTypeValue, typeSel.value);
    lastTypeValue = typeSel.value;
    _refreshPicker(typeSel.value); // move the is-active highlight to the clicked type
    if (crossed) mountContent(typeSel.value, true);
    renderTypeBlock(typeSel.value);
    _syncHeader();
    markDirty();
  });

  _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);

  root.querySelector('#ie-title').addEventListener('input', () => { markDirty(); _syncHeader(); });
  root.querySelector('#ie-summary').addEventListener('input', markDirty);

  // The Item|Pacote switch picks the FIRST registered type of each family rather than a hard-coded
  // slug, so a bundle type created on the Types screen works with no code change here.
  root.querySelectorAll('[data-pack]').forEach((b) => {
    b.addEventListener('click', () => {
      const wantBundle = b.dataset.pack === '1';
      if (wantBundle === isBundleSlug(typeSel.value)) return;
      const target = types.find((ty) => (ty.family === 'bundle') === wantBundle
        && excludeTypes.indexOf(ty.slug) < 0);
      if (!target) { toast.err(t('editor.no_type_for_kind')); return; }
      // Item -> Pacote on something you have already written is NOT a type change. Élder
      // 2026-08-11: "when a second item is added to a normal item both of them become items of
      // the package". The item keeps being the item it was and moves INSIDE a package that is
      // born to hold it; converting it in place would silently turn a prompt somebody wrote into
      // an empty folder. Handled by the stack, which owns identity; the level cannot do it
      // because it would have to change its own key.
      if (wantBundle && opts._onDemote && level_hasContent()) { opts._onDemote(target.slug); return; }
      typeSel.value = target.slug;
      typeSel.dispatchEvent(new Event('change'));
    });
  });

  // The draggable grip between the two columns is the SHARED js/resizable.js (the same one
  // Releases and the client dossier use). It is installed once here because, unlike the
  // prototype, this screen does not rewrite its own innerHTML on every interaction: only the two
  // extras hosts are repainted, and the grid survives them.
  const _split = root.querySelector('#ie-split');
  const _uninstallRz = _split
    ? installResizer(_split, { storeKey: 'cdx_rz_item_editor', defaultPx: 620, min: 340, max: 900 })
    : null;

  const closeBtnEl = root.querySelector('#ie-close');
  if (closeBtnEl) closeBtnEl.addEventListener('click', () => onCancel());
  const cancelEl = root.querySelector('#ie-cancel');
  if (cancelEl) cancelEl.addEventListener('click', () => onCancel());
  const backEl = root.querySelector('#ie-back');
  if (backEl) backEl.addEventListener('click', () => { if (opts._onBack) opts._onBack(); });

  const crumbHost = root.querySelector('#ie-crumbs');
  if (crumbHost && opts._onCrumb) wireBreadcrumb(crumbHost, opts._onCrumb);

  const delEl = root.querySelector('#ie-delete');
  if (delEl) delEl.addEventListener('click', () => opts.onDeleteItem(item));

  root.querySelector('#ie-refazer-btn').addEventListener('click', async function () {
    if (!_aiCtx) return;
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
      const diff = aiSpec.computeEditDiff(_aiCtx.firstOutput, current);
      const systemPrompt = aiSpec.buildRefineSystemPrompt({ addEmojis: _aiCtx.addEmojis });
      const userMsg = aiSpec.buildRefineUserMessage(_aiCtx.rawInput, _aiCtx.firstOutput, diff);

      // The SAME AI the user chose for the content step answers the Refazer: swapping models
      // halfway through an item compared against itself would give a difference with no cause.
      const res = await aiApi.chat(Object.assign({
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
        temperature: 0.3,
        max_tokens: aiSpec.MAX_TOKENS
      }, paramsFor(getChoice().id)));
      if (!res || !res.text) { _logAi('no content', res); notice.internal(t('editor.ai_no_content')); return; }
      let parsed = aiSpec.parseModelJson(res.text);
      if (!parsed || !parsed.body_md) { _logAi('unparseable / no body_md', res); notice.internal(t('editor.ai_bad_format')); return; }
      // The raw flag comes from the box the user actually ticked, not from a guess about the type.
      parsed = aiSpec.applyVerbatim(parsed, _aiCtx.rawInput, _aiBox.verbatim());

      _aiCtx.firstOutput = parsed;
      root.querySelector('#ie-title').value = parsed.title || '';
      root.querySelector('#ie-summary').value = parsed.summary || '';
      if (parsed.type) { root.querySelector('#ie-type').value = parsed.type; _refreshPicker(parsed.type); }
      if (bodyEl) bodyEl.value = parsed.body_md || '';
      _bodyCarry = parsed.body_md || '';
      const newTagIds = await _tagsByLabels(tags, parsed.tag_labels || []);
      selectedTagIds.clear();
      newTagIds.forEach((id) => selectedTagIds.add(id));
      _renderTagPicker(root.querySelector('#ie-tag-picker'), tags, selectedTagIds, markDirty);
      const pre = root.querySelector('#ie-preview');
      if (pre && pre.style.display !== 'none') renderMarkdown(parsed.body_md || '', pre);
      _syncHeader();
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

  function getState() {
    const type = typeSel.value;
    const title = root.querySelector('#ie-title').value.trim();
    const summary = root.querySelector('#ie-summary').value.trim();
    const typeData = collectTypeData(root, type);
    // The raw flag rides in meta_json, and it is written only once the user has actually chosen.
    // Writing `false` by default would silently un-raw every existing prompt on its next save,
    // because absence is exactly what means "follow the type" (see isVerbatim).
    const chosen = _aiBox.verbatim();
    // Laid over what is already STORED, never replacing it: the form only speaks for the keys its
    // own type block draws, and the attachment is not one of them (mergeItemMeta / §25.5).
    let meta = mergeItemMeta(initialMeta, typeData.meta_json, type);
    if (typeof chosen === 'boolean') meta = Object.assign({}, meta || {}, { verbatim: chosen });
    return {
      type, title, summary,
      body_md: typeData.body_md,
      meta_json: meta,
      tag_ids: Array.from(selectedTagIds)
    };
  }

  // Everything this level is holding, in the shape editor/nav.js stores and planSave() reads.
  // Called on the way OUT (stepping into a member, or clicking a crumb) and on Save.
  function getDraft() {
    const state = getState();
    const d = {
      isNew: !isEdit,
      params: {
        type: state.type,
        title: state.title,
        summary: state.summary || null,
        body_md: state.body_md,
        meta_json: state.meta_json ? JSON.stringify(state.meta_json) : null,
        tag_ids: state.tag_ids,
      },
      // The content box is the one file selector (§25.4), and it hands its file over through
      // onResult, which only fires if the AI ran. Picking a file and pressing Save straight
      // after used to upload nothing, silently: no error, no attachment, no button on the trail.
      pendingFile: _pendingAssetFile || (_aiBox ? _aiBox.pendingFile() : null),
      pendingField: _pendingAssetField || 'attachment_url',
      verbatim: _aiBox.verbatim(),
      dirty: isDirty,
    };
    if (isBundleSlug(state.type) && _memberCtx.members) {
      d.members = _memberCtx.members.members();
      d.memberRows = _memberCtx.members.rows();
    }
    return d;
  }

  root.querySelector('#ie-save').addEventListener('click', function () {
    const state = getState();
    if (state.type === '__new__') { toast.err(t('editor.select_type')); return; }
    if (!state.title) { toast.err(t('editor.title_required')); return; }
    opts._onSaveAll(this);
  });

  return {
    isDirty: () => isDirty,
    getState,
    getDraft,
    // A one-line summary of what this level holds, for the row it becomes when the item is
    // demoted into a package. Cheap enough to ask for on every toggle.
    asMemberRow: (key) => {
      const st = getState();
      const ty = types.find((x) => x.slug === st.type);
      return { key, id: isEdit && item ? Number(item.id) : null, title: st.title,
        type: st.type, type_label: (ty && ty.label) || st.type, isNew: !isEdit, indent: 0 };
    },
    hasContent: () => {
      const st = getState();
      return !!(st.title || (st.body_md || '').trim());
    },
    members: () => _memberCtx.members,
    addMember: (entry) => { if (_memberCtx.members) _memberCtx.members.add(entry); markDirty(); },
    destroy: () => {
      if (_uninstallRz) _uninstallRz();
      if (_aiBox) _aiBox.destroy();
      container.innerHTML = '';
    }
  };
}

// ── persistence, shared by both save paths ───────────────────────────────────
// Writes ONE draft and returns the id it now has. Members are NOT written here: they need every
// sibling to exist first, so the stack's save does that pass separately.
async function _persist(draft, existingId, opts) {
  const params = Object.assign({}, draft.params);
  let saveRes;
  // saveFn override: the Apostila editor persists into a set (createItem with set_id) or the
  // working copy (saveDraftSection), not the plain bank.
  if (typeof opts.saveFn === 'function') {
    if (existingId) params.id = existingId;
    saveRes = await opts.saveFn(params, { isEdit: !!existingId, item: opts.item });
  } else if (existingId) { params.id = existingId; saveRes = await api.updateItem(params); }
  else { saveRes = await api.createItem(params); }
  if (saveRes && saveRes.error) throw new Error(saveRes.error);
  const savedItem = saveRes && (saveRes.item || saveRes.section) ? (saveRes.item || saveRes.section) : null;
  const savedId = existingId || (savedItem ? savedItem.id : (saveRes && saveRes.id ? saveRes.id : null));

  if (draft.pendingFile && savedId) {
    const b64 = await _readFileAsBase64(draft.pendingFile);
    const uploadRes = await api.uploadAsset({
      item_id: savedId,
      filename: draft.pendingFile.name,
      content_b64: b64
    });
    const assetUrl = uploadRes && uploadRes.url;
    if (assetUrl && draft.pendingField) {
      const meta = draft.params.meta_json ? JSON.parse(draft.params.meta_json) : {};
      meta[draft.pendingField] = assetUrl;
      await api.updateItem({ id: savedId, meta_json: JSON.stringify(meta) });
    }
  }
  return savedId;
}

// ───────────────────────── public API: the stack ─────────────────────────
export function mount(container, opts) {
  opts = opts || {};
  const types = opts.types || [];
  setBundleSlugs(types);
  const nav = createNav({ maxDepth: MAX_DEPTH });
  let level = null;
  let destroyed = false;

  // Mutable: a demotion replaces the root, because the screen stops being the item and becomes
  // the package that now holds it.
  let _rootKey = opts.item ? Number(opts.item.id) : nav.nextNewKey();
  const rootKey = _rootKey;
  nav.push({
    key: _rootKey,
    id: opts.item ? Number(opts.item.id) : null,
    title: (opts.item && opts.item.title) || (opts.prefill && opts.prefill.title) || '',
    isNew: !opts.item,
    isBundle: isBundleSlug((opts.item && opts.item.type) || (opts.prefill && opts.prefill.type)),
  });
  // Level options, keyed the same way the drafts are. Holds what a level needs that a draft does
  // not carry: the loaded item (for its id and tags) and the per-level overrides.
  const levelOpts = new Map();
  levelOpts.set(_rootKey, { item: opts.item || null, prefill: opts.prefill || null, aiContext: opts.aiContext || null, pendingFile: opts.pendingFile || null });

  function _stash() {
    if (!level) return;
    const entry = nav.current();
    const d = level.getDraft();
    nav.stash(entry.key, d);
    entry.title = d.params.title || entry.title;
    entry.isBundle = isBundleSlug(d.params.type);
  }

  // Anything typed and not yet written, anywhere in the stack.
  function _anyDirty() {
    if (level && level.isDirty()) return true;
    return nav.drafts().some(([, d]) => d && d.dirty);
  }

  // A member row whose own level has a draft shows what the draft says, not what it said when the
  // row was created. Without this, naming a "+ criar aqui" item one level down and coming back
  // would show a blank row, and the package would look like it contained nothing.
  function _freshRows(rows) {
    return (rows || []).map((r) => {
      const d = nav.draft(r.key);
      if (!d || !d.params) return r;
      return Object.assign({}, r, { title: d.params.title || r.title, type: d.params.type || r.type });
    });
  }

  function _paint() {
    if (destroyed) return;
    const entry = nav.current();
    const lo = levelOpts.get(entry.key) || {};
    const draft = nav.draft(entry.key);
    // Coming BACK to a level restores what was typed, not what the server has. That is the whole
    // of "leaving a member never discards" (Élder 2026-08-07, #28).
    const prefill = draft ? {
      type: draft.params.type,
      title: draft.params.title,
      summary: draft.params.summary,
      body_md: draft.params.body_md,
      meta_json: draft.params.meta_json,
      tag_ids: draft.params.tag_ids,
      verbatim: draft.verbatim,
      children: _freshRows(draft.memberRows),
    } : lo.prefill;

    if (level) level.destroy();
    level = _mountLevel(container, Object.assign({}, opts, {
      item: lo.item || null,
      prefill,
      aiContext: lo.aiContext || null,
      pendingFile: draft ? draft.pendingFile : (lo.pendingFile || null),
      titleLabel: nav.depth() === 1 ? opts.titleLabel : null,
      saveLabel: nav.depth() === 1 ? opts.saveLabel : null,
      // Deleting is offered only at the root. One level down you are inside a package, and
      // "delete" there reads as "take it out of the package", which is what Remove already does.
      onDeleteItem: nav.depth() === 1 ? opts.onDeleteItem : null,
      onCancel: _cancelAll,
      onSave: opts.onSave,
      _nav: nav,
      _onCrumb: _goToCrumb,
      _onBack: _goBack,
      _onOpenChild: _openChild,
      _onCreateChild: nav.canPush() ? _createChild : null,
      _canOpenChild: (row) => nav.canPush() && !!row && !isNewKey(row.key),
      _onSaveAll: _saveAll,
      _onDemote: _demoteIntoPackage,
    }));
  }

  function _goToCrumb(index) {
    _stash();
    if (nav.popTo(index)) _paint();
  }
  function _goBack() {
    _stash();
    if (nav.pop()) _paint();
  }

  // Stepping INTO a member. The parent's draft is stashed first, so what it holds survives even
  // though its DOM is about to be thrown away.
  function _openChild(row) {
    if (!nav.canPush()) { toast.err(t('editor.depth_limit')); return; }
    if (isNewKey(row.key)) { toast.err(t('editor.open_unsaved')); return; }
    _stash();
    api.getItem({ id: row.id }).then((d) => {
      const it = (d && d.item) || null;
      if (!it) { toast.err(t('editor.open_failed')); return; }
      levelOpts.set(Number(it.id), { item: it, prefill: null, aiContext: null, pendingFile: null });
      nav.push({ key: Number(it.id), id: Number(it.id), title: it.title, isNew: false, isBundle: isBundleSlug(it.type) });
      _paint();
    }).catch((e) => notice.internal(_err(e)));
  }

  // "+ criar aqui": a blank level whose result becomes a member of the package below it. The row
  // is added to the parent's list IMMEDIATELY, with a temporary key, so the package shows what it
  // is about to contain instead of looking unchanged until the save.
  function _createChild() {
    if (!nav.canPush()) { toast.err(t('editor.depth_limit')); return; }
    const key = nav.nextNewKey();
    if (level) level.addMember({ key, id: null, title: '', type: '', type_label: '', indent: 0, isNew: true });
    _stash();
    levelOpts.set(key, { item: null, prefill: null, aiContext: null, pendingFile: null });
    nav.push({ key, id: null, title: '', isNew: true, isBundle: false });
    _paint();
  }

  // An item that gains company does not become a parent: a PACKAGE is born holding it. Élder has
  // said this twice, first as the model (2026-08-06, "um item que ganha companhia não vira pai,
  // nasce um pacote que segura os dois") and then as the screen (2026-08-11). The prototype showed
  // it and the merge lost it.
  //
  // Mechanically it is an identity change, which is why it lives here and not in the level: the
  // thing on screen stops being the item and becomes a NEW package, while the item it was keeps
  // its own key, its own draft and its own id, and turns into member number one.
  //
  // Note what is NOT written yet. Nothing is saved: the package is a draft like any other, and one
  // Save writes the item, then the package, then the list that names both, in that order, because
  // planSave already knows a member has to exist before it can be listed.
  function _demoteIntoPackage(bundleSlug) {
    const entry = nav.current();
    const oldKey = entry.key;
    const row = level.asMemberRow(oldKey);
    _stash();                                   // the item keeps its draft, under its own key

    const packKey = nav.nextNewKey();
    levelOpts.set(packKey, { item: null, prefill: null, aiContext: null, pendingFile: null });
    nav.stash(packKey, {
      isNew: true,
      params: { type: bundleSlug, title: '', summary: null, body_md: '', meta_json: null, tag_ids: [] },
      members: [{ key: oldKey, indent: 0 }],
      memberRows: [row],
      verbatim: null,
      dirty: true,
    });
    // Replace the level in place rather than pushing: the package is not INSIDE the item, it is
    // what the screen is about now. Pushing would draw a breadcrumb crumb for a parent the
    // package does not have.
    nav.replaceCurrent({ key: packKey, id: null, title: '', isNew: true, isBundle: true });
    if (nav.depth() === 1) _rootKey = packKey;
    _paint();
    toast.ok(t('editor.became_package'));
  }

  function _cancelAll() {
    if (_anyDirty() && !window.confirm(t('editor.discard_confirm'))) return;
    (opts.onCancel || function () {})();
  }

  // ONE Save writes the level you are on AND every level you passed through. Élder 2026-08-07:
  // "um Save grava o pacote e todos os membros mexidos". The order is the plan's, not this
  // function's: new items first (a member with no id cannot be listed), then the edits, then the
  // member lists, which is the only pass that can name every id.
  async function _saveAll(saveBtn) {
    _stash();
    if (saveBtn) saveBtn.disabled = true;
    try {
      const plan = planSave(nav.drafts());
      const idByKey = new Map();
      for (const [key, d] of nav.drafts()) if (!d.isNew) idByKey.set(key, Number(key));

      for (const step of plan) {
        if (step.op === 'create') {
          const lo = levelOpts.get(step.key) || {};
          const draft = nav.draft(step.key);
          if (!step.params.title) throw new Error(t('editor.title_required'));
          const id = await _persist(draft, null, Object.assign({}, opts, { item: lo.item || null }));
          idByKey.set(step.key, Number(id));
        } else if (step.op === 'update') {
          const lo = levelOpts.get(step.key) || {};
          const draft = nav.draft(step.key);
          await _persist(draft, Number(step.key), Object.assign({}, opts, { item: lo.item || null }));
        } else if (step.op === 'members') {
          const parentId = idByKey.get(step.key);
          if (!parentId) continue;
          const res = await api.setItemMembers({
            parent_item_id: parentId,
            children: resolveMembers(step.children, idByKey),
          });
          if (res && res.error) throw new Error(res.error);
        }
      }

      const savedRootId = idByKey.get(_rootKey) || null;
      nav.clearDrafts();
      (opts.onSave || function () {})({ id: savedRootId });
    } catch (err) {
      // The error goes out as a TOAST, not only as notice.internal. Élder 2026-08-05: "após
      // clicar em criar deve ter a mensagem de sucesso ou erro". Success already closed the modal
      // and said so; failure was MUTE, because notice.internal only shows with the debug pill on.
      toast.err(_err(err));
      notice.internal(_err(err));
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  _paint();

  return {
    isDirty: () => _anyDirty(),
    getState: () => (level ? level.getState() : null),
    destroy: () => { destroyed = true; if (level) level.destroy(); level = null; },
  };
}
