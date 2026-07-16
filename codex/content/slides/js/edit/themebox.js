// edit/themebox.js — the "Tema" box: ONE panel that edits the whole deck theme in a
// single place (presets, palette, deck font + size, and the typography roles). Opened
// from the chrome "Tema" button. Unlike the context bar (buttons only), this is a
// dense settings panel with native form controls, the same way the +slide modal is its
// own surface. Every control writes straight to an `app` method (applyPreset / setTheme
// / setRole / setFontScale / toggleFontScope / applyThemeToAll), which records,
// re-applies the theme, and refreshes. The panel reads the registries (presets / fonts
// / roles), so adding a preset, font, or role needs no change here.
import { t } from "../../../../js/i18n.js";
import { PRESETS, presetSwatch } from "../theme/presets.js";
import { FONTS } from "../theme/fonts.js";
import { ROLES } from "../theme/roles.js";
import { ARTKITS } from "../theme/art.js";

let panel = null;
let openBtn = null;
let onDoc = null;

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

function section(titleKey) {
  const s = el("section", "tb-sec");
  s.appendChild(el("div", "tb-sec-h", t(titleKey)));
  return s;
}

function fontSelect(value, onChange, withInherit) {
  const sel = el("select", "tb-sel");
  if (withInherit) {
    const o = el("option", null, t("slides.tb_inherit"));
    o.value = "";
    sel.appendChild(o);
  }
  for (const f of FONTS) {
    const o = el("option", null, f.label);
    o.value = f.id;
    o.style.fontFamily = f.stack;
    sel.appendChild(o);
  }
  sel.value = value || "";
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function toggleBtn(label, cls, on, onClick) {
  const b = el("button", "tb-tg " + cls + (on ? " on" : ""), label);
  b.type = "button";
  b.onclick = () => { const next = !b.classList.contains("on"); b.classList.toggle("on", next); onClick(next); };
  return b;
}

// One typography role row: label · font · size · B I U S · colour.
function roleRow(app, role) {
  const papeis = (app.deck().theme.texto && app.deck().theme.texto.papeis) || {};
  const p = papeis[role.id] || {};
  const row = el("div", "tb-role");
  row.appendChild(el("span", "tb-role-name", t(role.labelKey)));

  row.appendChild(fontSelect(p.font, (v) => app.setRole(role.id, "font", v || null), true));

  const size = el("input", "tb-size");
  size.type = "range";
  size.min = "0.6"; size.max = "1.6"; size.step = "0.05";
  size.value = p.size != null ? p.size : 1;
  size.oninput = () => app.setRole(role.id, "size", +size.value === 1 ? null : +size.value);
  row.appendChild(size);

  const fmt = el("span", "tb-fmt");
  fmt.appendChild(toggleBtn("B", "tb-b", p.weight === 900, (on) => app.setRole(role.id, "weight", on ? 900 : null)));
  fmt.appendChild(toggleBtn("I", "tb-i", !!p.italic, (on) => app.setRole(role.id, "italic", on ? true : null)));
  fmt.appendChild(toggleBtn("U", "tb-u", !!p.underline, (on) => app.setRole(role.id, "underline", on ? true : null)));
  fmt.appendChild(toggleBtn("S", "tb-s", !!p.strike, (on) => app.setRole(role.id, "strike", on ? true : null)));
  row.appendChild(fmt);

  const col = el("input", "tb-col");
  col.type = "color";
  // a stored hex shows; a semantic token or unset shows the current ink as a neutral start
  col.value = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : (app.deck().theme.ink || "#134e4a");
  col.oninput = () => app.setRole(role.id, "color", col.value);
  row.appendChild(col);

  return row;
}

function build(app) {
  const box = el("div", "cdx-themebox");

  // Proporção do deck (Phase 8): 16:9 / 4:3, two lit buttons. No header/close row here
  // (click outside closes it, like the animation panel).
  const asp = el("section", "tb-sec");
  asp.appendChild(el("div", "tb-sec-h", t("slides.ed_aspect")));
  const aspRow = el("div", "tb-arts");
  for (const a of ["16:9", "4:3"]) {
    const b = el("button", "tb-art" + (a === (app.deck().aspect || "16:9") ? " on" : ""), a);
    b.type = "button";
    b.onclick = () => app.setAspect(a);
    aspRow.appendChild(b);
  }
  asp.appendChild(aspRow);
  box.appendChild(asp);

  // Predefinições (built-in preset swatches + the user's saved themes)
  const sp = section("slides.ed_presets");
  const strip = el("div", "tb-presets");
  for (const p of PRESETS) {
    const b = el("button", "tb-preset" + (p.accent === app.deck().theme.accent ? " on" : ""), t(p.labelKey));
    b.type = "button";
    b.style.background = presetSwatch(p);
    b.onclick = () => app.applyPreset(p);
    strip.appendChild(b);
  }
  // saved themes ("Meus temas"): a swatch chip per saved theme, each with a delete ✕
  for (const s of app.deck().savedThemes || []) {
    const wrap = el("span", "tb-saved");
    const b = el("button", "tb-preset", s.name);
    b.type = "button";
    b.style.background = presetSwatch({ accent: (s.theme && s.theme.accent) || "#14b8a6" });
    b.onclick = () => app.applySavedTheme(s.id);
    wrap.appendChild(b);
    const del = el("button", "tb-saved-x", "✕");
    del.type = "button";
    del.title = t("slides.delete");
    del.onclick = (e) => { e.stopPropagation(); app.deleteSavedTheme(s.id); };
    wrap.appendChild(del);
    strip.appendChild(wrap);
  }
  sp.appendChild(strip);
  const saveBtn = el("button", "tb-savetheme", "＋ " + t("slides.ed_save_theme"));
  saveBtn.type = "button";
  saveBtn.onclick = () => {
    const list = app.deck().savedThemes || [];
    const def = t("slides.saved_theme_name") + " " + (list.length + 1);
    const name = (typeof window !== "undefined" && window.prompt) ? window.prompt(t("slides.ed_save_theme"), def) : def;
    if (name) app.saveTheme(name);
  };
  sp.appendChild(saveBtn);
  box.appendChild(sp);

  // Paleta (the real colours; shades + panels derive from them)
  const pal = section("slides.ed_palette");
  const grid = el("div", "tb-pal");
  const colorCell = (labelKey, key) => {
    const cell = el("label", "tb-pal-c");
    cell.appendChild(el("span", null, t(labelKey)));
    const inp = el("input");
    inp.type = "color";
    inp.value = app.deck().theme[key] || "#14b8a6";
    inp.oninput = () => app.setTheme(key, inp.value);
    cell.appendChild(inp);
    return cell;
  };
  grid.appendChild(colorCell("slides.ed_accent", "accent"));
  grid.appendChild(colorCell("slides.ed_text_color", "ink"));
  grid.appendChild(colorCell("slides.ed_art", "motif"));
  pal.appendChild(grid);
  box.appendChild(pal);

  // Texto: deck font + global size
  const txt = section("slides.ed_text");
  const frow = el("div", "tb-row");
  frow.appendChild(el("span", "tb-lbl", t("slides.ed_font")));
  frow.appendChild(fontSelect(app.deck().theme.font, (v) => app.setTheme("font", v), false));
  txt.appendChild(frow);
  const srow = el("div", "tb-row");
  srow.appendChild(el("span", "tb-lbl", t("slides.ed_font_size")));
  const scale = el("input", "tb-size");
  scale.type = "range";
  scale.min = "0.7"; scale.max = "1.5"; scale.step = "0.05";
  scale.value = app.deck().theme.fontScale;
  scale.oninput = () => app.setFontScale(+scale.value);
  srow.appendChild(scale);
  txt.appendChild(srow);
  box.appendChild(txt);

  // Tipografia (the role table)
  const typ = section("slides.ed_typography");
  for (const role of ROLES) typ.appendChild(roleRow(app, role));
  box.appendChild(typ);

  // Arte de fundo (the decorative-motif kit; recoloured by the swatch)
  const art = section("slides.ed_background");
  const arts = el("div", "tb-arts");
  for (const kit of ARTKITS) {
    const b = el("button", "tb-art" + (kit.id === (app.deck().theme.art || "circuito") ? " on" : ""), t(kit.labelKey));
    b.type = "button";
    b.onclick = () => { app.setTheme("art", kit.id); refreshThemeBox(app); };
    arts.appendChild(b);
  }
  art.appendChild(arts);
  box.appendChild(art);

  // footer: apply-to-all
  const foot = el("div", "tb-foot");
  const lab = el("label", "tb-allcheck");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = !!app._applyAll;
  cb.onchange = () => { app._applyAll = cb.checked; };
  lab.appendChild(cb);
  lab.appendChild(el("span", null, " " + t("slides.ed_apply_all")));
  foot.appendChild(lab);
  const clearBtn = el("button", "tb-clear", t("slides.ed_apply_all_now"));
  clearBtn.type = "button";
  clearBtn.onclick = () => app.applyThemeToAll();
  foot.appendChild(clearBtn);
  box.appendChild(foot);

  return box;
}

function place(btn) {
  const r = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  panel.style.visibility = "hidden";
  requestAnimationFrame(() => {
    let left = r.left;
    if (left + panel.offsetWidth > vw - 8) left = Math.max(8, vw - panel.offsetWidth - 8);
    panel.style.left = left + "px";
    panel.style.top = r.bottom + 6 + "px";
    panel.style.visibility = "";
  });
}

export function closeThemeBox() {
  if (!panel) return;
  panel.remove();
  panel = null;
  openBtn = null;
  if (onDoc) { document.removeEventListener("mousedown", onDoc, true); onDoc = null; }
}

/** Open (or toggle) the Tema box anchored under `btn`. */
export function openThemeBox(app, btn) {
  if (panel && openBtn === btn) { closeThemeBox(); return; }
  closeThemeBox();
  panel = build(app);
  openBtn = btn;
  app.root.appendChild(panel);
  place(btn);
  onDoc = (e) => {
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeThemeBox();
  };
  document.addEventListener("mousedown", onDoc, true);
}

/** Rebuild the open box in place (after a preset/colour change reseeds its controls). */
export function refreshThemeBox(app) {
  if (!panel || !openBtn) return;
  const btn = openBtn;
  closeThemeBox();
  openThemeBox(app, btn);
}
