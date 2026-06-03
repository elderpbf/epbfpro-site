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
 * already owns a data-fkey (e.g. a card). Clicking selects the container; the
 * text still edits in place on double-click.
 */
export function edPlain(tag, path, value, cls = "") {
  return (
    `<${tag} class="editable ${cls}" data-path="${path}" data-edit="1">${value ?? ""}</${tag}>`
  );
}
