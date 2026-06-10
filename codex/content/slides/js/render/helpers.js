// render/helpers.js — shared slot-rendering helpers used by every layout module.
// Layouts compose their own HTML but share these so image-slot markup never drifts.

/** CSS background value for a colour/gradient mask fill. */
export function fillCss(m) {
  if (!m) return "";
  return m.type === "gradient" ? `linear-gradient(${m.angle || 0}deg, ${m.c1}, ${m.c2})` : m.c1;
}

/** Optional recolour overlay: fills the image's opaque (alpha) shape with the mask. */
export function maskOverlay(src, mask) {
  if (!mask) return "";
  return `<div class="maskfill" style="background:${fillCss(mask)};-webkit-mask-image:url('${src}');mask-image:url('${src}')"></div>`;
}

/** Inner markup of a filled image slot: the image (in a transform wrapper) + tools.
 *  `tools` keeps the in-place trocar/máscara buttons. Converted top-level slots
 *  (Slice 2) pass false and drive replace/mask from the stage-docked selection bar;
 *  card images still pass true until Slice 3 migrates them off freeform. */
export function imgInner(path, img, tools = false) {
  const t = `translate(${img.tx || 0}px,${img.ty || 0}px) scale(${img.zoom || 1})`;
  return (
    `<div class="slotimg" data-img="${path}" style="transform:${t}">` +
    `<img src="${img.src}" draggable="false">${maskOverlay(img.src, img.mask)}</div>` +
    (tools
      ? `<div class="imgtools editoronly"><button data-replace="${path}">trocar</button>` +
        `<button data-mask="${path}">máscara</button></div>`
      : "") +
    `<div class="panhint editoronly">scroll = zoom · arraste a moldura</div>`
  );
}

// The empty-state cue shared by EVERY image box (one look everywhere, "outline
// ghost"): a photo glyph + "adicionar imagem". The box is a transparent,
// hairline-framed region (styled in slide.css). The box itself selects on
// single-click; the context bar's "adicionar imagem" button does the pick.
const IMG_GLYPH =
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">` +
  `<rect x="3" y="5" width="18" height="14" rx="2.4" stroke="currentColor" stroke-width="1.6"/>` +
  `<circle cx="8.5" cy="10" r="1.9" fill="currentColor"/>` +
  `<path d="M5 17.5l4.7-5.2 3.2 3.4L16.3 11l3.2 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function imgCue() {
  return `<div class="imgcue">${IMG_GLYPH}<span class="imgcue-lbl">adicionar imagem</span></div>`;
}

/** A drop-target image slot, the unified "image box". `path` is the deck path the
 *  image lives at. Empty and filled both carry data-fkey so the selection layer can
 *  pick them: empty renders the shared add-image cue (single-click selects, the bar's
 *  "adicionar imagem" fills it); filled renders the image and can be reshaped. `tools`
 *  is forwarded to imgInner (cards keep in-place tools; converted slots use the bar). */
export function imgslot(path, img, tools = false) {
  const filled = img && img.src;
  return (
    `<div class="imgslot dropzone ${filled ? "filled" : ""}" data-img="${path}" data-fkey="${path}">` +
    (filled ? imgInner(path, img, tools) : imgCue()) +
    `</div>`
  );
}

/**
 * Editable text element. Carries data-path (where the text is stored) and
 * data-fkey (freeform key, so the selection layer can lift it out of flow).
 * contenteditable is NOT set here: single-click selects, double-click edits,
 * and the editor toggles contenteditable on demand (PowerPoint/Keynote model).
 */
export function ed(tag, path, value, cls = "") {
  return (
    `<${tag} class="editable ${cls}" data-path="${path}" data-fkey="${path}" data-edit="1">` +
    `${value ?? ""}</${tag}>`
  );
}

/**
 * Editable text that is NOT its own freeform unit — used inside a container that
 * already owns a data-fkey (e.g. a card or a topic li). Clicking selects the
 * container; the text edits in place on double-click. `styleRef` ("<list>.<id>")
 * names the object whose `.style` stores this text's block format, so styling
 * travels with the item across reorder (see schema.resolveStyleObj); omitted for
 * layout slots that don't reorder (their style stays in slide.textStyle).
 */
export function edPlain(tag, path, value, cls = "", styleRef = "") {
  const sr = styleRef ? ` data-style-ref="${styleRef}"` : "";
  return `<${tag} class="editable ${cls}" data-path="${path}" data-edit="1"${sr}>${value ?? ""}</${tag}>`;
}

/* ---------- id-keyed list items (cards + topics carry a stable identity) ----------
 * The container element carries data-fkey="<list>.<id>" (the geometry override key,
 * stable across reorder); the editable inside addresses CONTENT by the live index
 * path and names its STYLE home via data-style-ref. Delete/add/mode/move are NOT
 * emitted here — they are descriptor controls on the selection bar (Slice 3). These
 * helpers are the single renderer, shared by the layouts AND inherited by the
 * navigator thumbnails and the presenter window. */

/** One topic bullet. `t` is a {id,text,style?,step?} object; `i` is its current index. */
export function topicItem(t, i, listName = "topics") {
  const step = t.step != null ? t.step : (i + 1);
  const cls = step > 0 ? "reveal" : "";
  return (
    `<li class="${cls}" data-step="${step}" data-fkey="${listName}.${t.id}">` +
    edPlain("span", `${listName}.${i}.text`, t.text, "", `${listName}.${t.id}`) +
    `</li>`
  );
}

/** The topic list (<ul>). `listName` lets ONE layout host several independent lists
 *  (compare's left/right, checklist's dos/donts), each editable through the SAME
 *  topic + container descriptors: the <ul> carries data-list so the container knows
 *  which slot to add into, and each item's fkey/path/style-ref are prefixed with the
 *  list name. Defaults to "topics" so topics/split/imagebox keep the one-arg call. */
export function topicList(topics, listName = "topics") {
  return `<ul class="topiclist" data-list="${listName}">${topics.map((t, i) => topicItem(t, i, listName)).join("")}</ul>`;
}

// The card renderer (cardItem) + the card PART registry now live in
// render/cardparts.js, so any card composes image/title/body parts (and future
// parts) by toggling flags. helpers.js keeps only the low-level slot renderers that
// cardparts.js imports from (one-way: helpers never imports cardparts, no cycle).
