// theme/fonts.js — the FONT registry. One self-contained entry per font, exactly
// like the layout-plugin registry (layouts/registry.js) and the card-part registry
// (render/cardparts.js): the picker, the lazy loader, and applyDeckTheme all read
// from this ONE list, so adding/removing a font is a single line here and nothing
// else changes. An entry is:
//   { id, label, stack, webfont? }
//     id      — stored on deck.theme.font; the stable key.
//     label   — what the picker shows.
//     stack   — the CSS font-family value driven onto the --fontFamily token.
//     webfont — OPTIONAL Google-Fonts `family=` value, lazy-loaded on first use.
//               System fonts (Arial/Georgia) and the existing default (Roboto) omit
//               it, so they cost zero network and the default deck renders unchanged.

const SANS = "system-ui, 'Segoe UI', Arial, sans-serif";

// Curated, presentation-grade set. Prune or extend by editing THIS array only.
export const FONTS = [
  // — Sans —
  { id: "roboto", label: "Roboto", stack: `'Roboto', ${SANS}` }, // current default: page already falls back to it, so NO webfont (keeps load light + unchanged)
  { id: "raleway", label: "Raleway", stack: `'Raleway', ${SANS}`, webfont: "Raleway:wght@300;400;700;900" },
  { id: "inter", label: "Inter", stack: `'Inter', ${SANS}`, webfont: "Inter:wght@300;400;700;900" },
  { id: "montserrat", label: "Montserrat", stack: `'Montserrat', ${SANS}`, webfont: "Montserrat:wght@300;400;700;900" },
  { id: "poppins", label: "Poppins", stack: `'Poppins', ${SANS}`, webfont: "Poppins:wght@300;400;700;900" },
  { id: "lato", label: "Lato", stack: `'Lato', ${SANS}`, webfont: "Lato:wght@300;400;700;900" },
  // — Serif (title / contrast) —
  { id: "playfair", label: "Playfair Display", stack: `'Playfair Display', Georgia, serif`, webfont: "Playfair+Display:wght@400;700;900" },
  { id: "merriweather", label: "Merriweather", stack: `'Merriweather', Georgia, serif`, webfont: "Merriweather:wght@300;400;700;900" },
  // — System (no load) —
  { id: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
];

const DEFAULT_ID = "roboto";

/** Look up a registry entry by id; falls back to the default so an unknown or
 *  legacy (pre-font-field) deck never breaks. */
export function getFont(id) {
  return FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === DEFAULT_ID);
}

/** The CSS font-family value for a font id (drives the --fontFamily token). */
export function fontStack(id) {
  return getFont(id).stack;
}

/** The display label for a font id (the picker button shows "Fonte: <label>"). */
export function fontLabel(id) {
  return getFont(id).label;
}

/** The whole registry as lightweight picker rows ({id,label,stack}). */
export function fontOptions() {
  return FONTS.map((f) => ({ id: f.id, label: f.label, stack: f.stack }));
}

// ── Lazy webfont loading ──────────────────────────────────────────────────────
// A font's webfont sheet is fetched on FIRST use (picking it, or opening the
// picker so previews render), never all upfront, to keep the page light. Each
// family loads at most once (guarded by _loaded). System/default fonts no-op.
const _loaded = new Set();

export function ensureFont(id) {
  const f = getFont(id);
  if (!f || !f.webfont || _loaded.has(f.id)) return;
  _loaded.add(f.id);
  if (typeof document === "undefined") return; // test / non-DOM guard
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=" + f.webfont + "&display=swap";
  link.dataset.slidesFont = f.id;
  document.head.appendChild(link);
}

/** Preload every webfont — called when the picker opens so each option's preview
 *  renders in its real typeface. */
export function ensureAll() {
  FONTS.forEach((f) => ensureFont(f.id));
}

// ── Picker DATA (the registry owns its own control list) ──────────────────────
// Built as control primitives for the context bar's dropdown (bar.openDropdown),
// the same button-anchored popover the card "Ajustes" menu uses. Each option
// previews in its own typeface (the `font` hook on the button widget) and marks
// the current selection. Picking sets deck.theme.font, closes the dropdown, and
// reopens Appearance so the "Fonte: <label>" button relabels.
export function fontMenu(currentId) {
  return FONTS.map((f) => ({
    type: "button",
    id: "font-" + f.id,
    label: f.label,
    font: f.stack, // preview the option in its own typeface
    on: f.id === currentId,
    run(app) {
      app.setTheme("font", f.id);
      app.select.hideDropdown();
      app.reopenAppearance();
    },
  }));
}
