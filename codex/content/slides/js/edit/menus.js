// edit/menus.js — the editor's menus expressed as DATA: each returns a list of
// control primitives the context bar renders, instead of bespoke dropdown markup
// + handlers inline in app.js. Same primitive vocabulary as the selection
// descriptors (kinds.js), so the one bar renders menus and selections alike.
// No dropdowns: every choice is a row of items.
import { t } from "../../../../js/i18n.js";
import { fontLabel, fontMenu, ensureAll } from "../theme/fonts.js";
import { presetMenu } from "../theme/presets.js";

// "list" and "card" are not free boxes but STACK objects: each drops a growable
// stack (one item to start), bullets for "list" and composable cards for "card".
// They ride the same insertElement entry as the free elements; app.insertElement
// special-cases them (the items live in slots, the asset is just geometry).
export function insertMenu() {
  return ["text", "title", "list", "card", "image", "photo", "video"].map((kind) => ({
    type: "button",
    id: "ins-" + kind,
    labelKey: "slides.ed_" + kind,
    closeOnRun: true, // one-shot: dismiss the menu after the pick
    run(app) { app.insertElement(kind); },
  }));
}

// The +slide picker is a modal of live preview cards (edit/addslide.js), which unifies
// built-in and saved layouts as one concept.

// fontValue: the EFFECTIVE scale the slider should show. In "slide" scope this is
// the slide's per-slide override (player.effFontScale), not the deck default, so the
// slider reflects what's actually applied (5b). Omitted -> falls back to the deck.
export function appearanceMenu(theme, fontScope, fontValue) {
  return [
    // Predefinições: the seed colour swatches (teal/blue). Picking one applies the
    // whole colour bundle; the individual colour pickers below then fine-tune it.
    ...presetMenu(theme.accent),
    { type: "sep" },
    // Font FAMILY: deck-wide, registry-backed. The button opens the font registry
    // as a dropdown (theme/fonts.fontMenu), the same button-anchored popover the
    // card "Ajustes" menu uses; opening it preloads the webfonts so previews render.
    {
      type: "button", id: "fontfam",
      label: t("slides.ed_font") + ": " + fontLabel(theme.font) + " ▾",
      run(app, sel, btnEl) { ensureAll(); app.select.openDropdown(fontMenu(theme.font), btnEl); },
    },
    {
      type: "range", id: "font", labelKey: "slides.ed_font_size",
      value: fontValue != null ? fontValue : theme.fontScale, min: 0.7, max: 1.5, step: 0.05,
      input(app, sel, v) { app.setFontScale(+v); },
    },
    {
      type: "button", id: "fontscope",
      labelKey: fontScope === "slide" ? "slides.ed_scope_slide" : "slides.ed_scope_all",
      run(app) { app.toggleFontScope(); },
    },
    { type: "color", id: "accent", labelKey: "slides.ed_accent", value: theme.accent, input(app, sel, v) { app.setTheme("accent", v); } },
    { type: "color", id: "ink", labelKey: "slides.ed_text_color", value: theme.ink, input(app, sel, v) { app.setTheme("ink", v); } },
    { type: "color", id: "motif", labelKey: "slides.ed_art", value: theme.motif, input(app, sel, v) { app.setTheme("motif", v); } },
  ];
}

// The slide's entrance animation TYPE (fade-up / fade / immediate). Per-element reveal
// ORDER is now centralized in player.autoSteps (every content block animates one-by-one
// in insertion order), so there is no per-slide "revelar 1 a 1" toggle here anymore;
// per-element animation control is the future Phase 7 panel.
export function animMenu(anim) {
  return [{
    type: "choice", id: "anim", value: anim,
    options: [
      { v: "fade-up", labelKey: "slides.ed_anim_fadeup" },
      { v: "fade", labelKey: "slides.ed_anim_fade" },
      { v: "none", labelKey: "slides.ed_anim_none" },
    ],
    write(app, sel, v) { app.setTheme("anim", v); },
  }];
}
