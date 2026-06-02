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

/** Inner markup of a filled image slot: the image (in a transform wrapper) + tools. */
export function imgInner(path, img) {
  const t = `translate(${img.tx || 0}px,${img.ty || 0}px) scale(${img.zoom || 1})`;
  return (
    `<div class="slotimg" data-img="${path}" style="transform:${t}">` +
    `<img src="${img.src}" draggable="false">${maskOverlay(img.src, img.mask)}</div>` +
    `<div class="imgtools editoronly"><button data-replace="${path}">trocar</button>` +
    `<button data-mask="${path}">máscara</button></div>` +
    `<div class="panhint editoronly">scroll = zoom · arraste a moldura</div>`
  );
}

/** A drop-target image slot. `path` is the deck path the image lives at. A filled
 *  slot also carries data-fkey so it can be reshaped (move/resize/rotate). */
export function imgslot(path, img, label) {
  const filled = img && img.src;
  return (
    `<div class="imgslot dropzone ${filled ? "filled" : ""}" data-img="${path}"${filled ? ` data-fkey="${path}"` : ""}>` +
    (filled ? imgInner(path, img) : `<span class="drop">${label || "arraste ou clique p/ foto"} ↧</span>`) +
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
