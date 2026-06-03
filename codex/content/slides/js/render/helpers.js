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

/** A drop-target image slot. `path` is the deck path the image lives at. Both empty
 *  and filled slots carry data-fkey so the selection layer can pick them: an empty
 *  slot is a selectable "image box" (single-click selects, the bar's "add image"
 *  fills it), a filled slot can also be reshaped (move/resize/rotate). `tools` is
 *  forwarded to imgInner (cards keep in-place tools; converted slots use the bar). */
export function imgslot(path, img, label, tools = false) {
  const filled = img && img.src;
  return (
    `<div class="imgslot dropzone ${filled ? "filled" : ""}" data-img="${path}" data-fkey="${path}">` +
    (filled ? imgInner(path, img, tools) : `<span class="drop">${label || "arraste ou clique p/ foto"} ↧</span>`) +
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
