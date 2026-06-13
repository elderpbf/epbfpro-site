// edit/gallerybox.js — the image GALLERY context box. The single surface for adding an
// image: it shows the deck's central gallery FIRST (past uploads as thumbnails), then the
// ways to add a new one (Upload now; Google Drive next). Picking a thumbnail places that
// image into the open target (an image slot, or a new free asset); each thumbnail can be
// deleted. Opened from the empty-slot "adicionar imagem" / "trocar" controls and from
// "＋ inserir → imagem". Built on the shared ui/contextbox popover, anchored to its trigger.
// The box is pure presentation: every mutation goes through an app method (uploadToGallery /
// placeFromGallery / deleteGalleryImage), which records + persists + refreshes the box.
import { t } from "../../../../js/i18n.js";
import { listImages } from "../core/gallery.js";
import { createContextBox } from "../ui/contextbox.js";

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

// One context box per editor instance (so it tears down with the deck, no stale root).
function boxOf(app) {
  if (!app._galleryBox) app._galleryBox = createContextBox({ root: app.root, className: "cdx-gallerybox" });
  return app._galleryBox;
}

function build(app, target) {
  const wrap = el("div", "gb-inner");

  const head = el("div", "gb-head");
  head.appendChild(el("span", "gb-title", t("slides.gallery")));
  const x = el("button", "gb-x", "✕");
  x.type = "button";
  x.onclick = () => closeGalleryBox(app);
  head.appendChild(x);
  wrap.appendChild(head);

  // Add-source row: Upload (a real file input) + Google Drive (next increment).
  const src = el("div", "gb-src");
  const up = el("label", "gb-up");
  up.appendChild(el("span", "gb-up-ic", "⬆"));
  up.appendChild(el("span", null, t("slides.gallery_upload")));
  const inp = el("input", "gb-file");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) app.uploadToGallery(f, target); };
  up.appendChild(inp);
  src.appendChild(up);
  const drive = el("button", "gb-drive", t("slides.gallery_drive"));
  drive.type = "button";
  const driveOn = !!(app._drivePicker && app._drivePicker.available());
  drive.disabled = !driveOn;
  drive.title = driveOn ? t("slides.gallery_drive") : t("slides.gallery_soon");
  if (driveOn) drive.onclick = () => app.importFromDrive(target);
  src.appendChild(drive);
  wrap.appendChild(src);

  // The gallery itself, shown first. Empty state until the first upload.
  const imgs = listImages(app.deck());
  if (!imgs.length) {
    wrap.appendChild(el("div", "gb-empty", t("slides.gallery_empty")));
  } else {
    const grid = el("div", "gb-grid");
    for (const g of imgs) {
      const cell = el("div", "gb-cell");
      const b = el("button", "gb-thumb");
      b.type = "button";
      b.title = g.name || "";
      const im = el("img");
      im.src = g.url;
      im.alt = g.name || "";
      im.loading = "lazy";
      b.appendChild(im);
      b.onclick = () => app.placeFromGallery(g.id, target);
      cell.appendChild(b);
      const del = el("button", "gb-del", "✕");
      del.type = "button";
      del.title = t("slides.delete");
      del.onclick = (e) => { e.stopPropagation(); app.deleteGalleryImage(g.id); };
      cell.appendChild(del);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
  }
  return wrap;
}

/** Open (or toggle) the gallery box anchored under `anchorEl`, picking into `target`
 *  ({ kind:"slot", path } | { kind:"asset", assetType }). */
export function openGalleryBox(app, target, anchorEl) {
  boxOf(app).open(() => build(app, target), anchorEl || null);
}

/** Rebuild the open box in place (after an upload / delete reseeds the grid). */
export function refreshGalleryBox(app) {
  if (app && app._galleryBox) app._galleryBox.refresh();
}

export function closeGalleryBox(app) {
  if (app && app._galleryBox) app._galleryBox.close();
}
