// theme/presets.js — built-in THEME presets (the seed colour swatches the user
// asked for: teal + blue). One self-contained entry per preset, the same registry
// shape as fonts/layouts: a preset is a named colour bundle {id, labelKey, accent,
// ink, motif}. Applying one sets the deck's three real colours; every shade, panel
// and gradient then DERIVES from them (see theme/derive.js), so the whole deck
// recolours coherently. Add a preset = one entry here. User-saved swatches (the
// "save your own" half) land later on top of this list.

import { clone } from "../core/schema.js";

export const PRESETS = [
  { id: "teal", labelKey: "slides.preset_teal", accent: "#14b8a6", ink: "#134e4a", motif: "#14b8a6" },
  { id: "blue", labelKey: "slides.preset_blue", accent: "#2563eb", ink: "#16345c", motif: "#2563eb" },
];

// The theme fields a SAVED theme captures (the whole look: colours, art, type). A saved
// theme lives per-deck in deck.savedThemes = [{ id, name, theme:{…these fields…} }].
const SAVE_FIELDS = ["accent", "ink", "motif", "art", "font", "fontScale", "anim", "texto"];

/** Snapshot the savable subset of a live theme (deep-cloned, so later edits don't leak). */
export function snapshotTheme(theme) {
  const o = {};
  for (const k of SAVE_FIELDS) if (theme[k] != null) o[k] = clone(theme[k]);
  return o;
}

/** Copy a saved theme's fields back onto a live theme (deep-cloned). Mutates `theme`. */
export function applyThemeFields(theme, saved) {
  for (const k of SAVE_FIELDS) if (saved[k] != null) theme[k] = clone(saved[k]);
  return theme;
}

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/** The gradient swatch shown on a preset chip: the accent into its own dark shade,
 *  so the chip previews the theme's colour as a gradient. */
export function presetSwatch(p) {
  return `linear-gradient(135deg, ${p.accent}, color-mix(in srgb, ${p.accent} 70%, #000))`;
}

/** Picker DATA: one swatch button per preset; applying sets the deck colours. The
 *  `swatch` hook paints the button with the preset gradient (rendered by bar.widget). */
export function presetMenu(currentAccent) {
  return PRESETS.map((p) => ({
    type: "button",
    id: "preset-" + p.id,
    labelKey: p.labelKey,
    swatch: presetSwatch(p),
    on: p.accent === currentAccent,
    run(app) { app.applyPreset(p); },
  }));
}
