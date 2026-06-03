// edit/menus.js — the editor's menus expressed as DATA: each returns a list of
// control primitives the context bar renders, instead of bespoke dropdown markup
// + handlers inline in app.js. Same primitive vocabulary as the selection
// descriptors (kinds.js), so the one bar renders menus and selections alike.
// No dropdowns: every choice is a row of items.

export function insertMenu() {
  return ["text", "title", "image", "photo", "video"].map((kind) => ({
    type: "button",
    id: "ins-" + kind,
    labelKey: "slides.ed_" + kind,
    closeOnRun: true, // one-shot: dismiss the menu after the pick
    run(app) { app.insertElement(kind); },
  }));
}

export function addSlideMenu(layouts) {
  return layouts.map((L) => ({
    type: "button",
    id: "add-" + L.id,
    label: L.label,
    layoutId: L.id,
    closeOnRun: true,
    run(app) { app.addSlide(L.id); },
  }));
}

export function appearanceMenu(theme, fontScope) {
  return [
    {
      type: "range", id: "font", labelKey: "slides.ed_font",
      value: theme.fontScale, min: 0.7, max: 1.5, step: 0.05,
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
