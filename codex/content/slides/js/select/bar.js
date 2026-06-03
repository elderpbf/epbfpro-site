// select/bar.js — THE context bar. One content-width pill that overlays the top
// of the stage area. It is the single contextual surface:
//   - a MENU opens its options INTO it, centered under the menu button (openMenu);
//   - selecting an element fills it with that element's controls, centered (render).
// Controls are DATA in a fixed primitive vocabulary (button, choice, toggle, color,
// range, sep); each closure OWNS its full effect (record + mutate + refresh/commit),
// so the bar never switches on a kind id and never wraps a closure. No dropdowns:
// a choice is a row of buttons. Positioning is the shared ui/anchored helper, the
// same mechanic the Codex topbar sub-tabs will reuse.
import { t } from "../../../../js/i18n.js";
import * as kinds from "./kinds.js";
import { placePill } from "../ui/anchored.js";

export function createBar(app) {
  const layer = document.createElement("div");
  layer.className = "ctxbar";
  app.stagewrap.appendChild(layer); // overlays the top of the stage area

  let current = null; // a selection record, { menu: true } for a menu, or null
  let anchorEl = null;
  let pill = null;

  function recOf() { return current && current.menu ? null : current; }

  function hide() {
    current = null; anchorEl = null; pill = null;
    layer.classList.remove("on");
    layer.innerHTML = "";
  }

  function build(ctrls) {
    pill = document.createElement("div");
    pill.className = "ctxpill";
    const rec = recOf();
    ctrls.forEach((c) => pill.appendChild(widget(c, rec)));
    layer.innerHTML = "";
    layer.appendChild(pill);
    layer.classList.add("on");
    requestAnimationFrame(reposition);
  }

  function reposition() {
    if (pill) placePill(layer, pill, { anchorEl, mode: anchorEl ? "under" : "center" });
  }

  // open from a menu: a control list, centered under the menu button
  function openMenu(ctrls, btn) {
    current = { menu: true };
    anchorEl = btn || null;
    if (!ctrls || !ctrls.length) return hide();
    build(ctrls);
  }

  // render from a selection: the descriptor's controls, centered
  function render(rec) {
    const desc = kinds.get(rec.kind);
    if (!desc) return hide();
    const ctrls = desc.controls(app, rec, desc.target(app, rec));
    current = rec; anchorEl = null;
    if (!ctrls.length) return hide();
    build(ctrls);
  }

  function widget(c, rec) {
    if (c.type === "sep") {
      const s = document.createElement("span");
      s.className = "ctx-sep";
      return s;
    }
    if (c.type === "choice") {
      const g = document.createElement("span");
      g.className = "ctx-choice";
      c.options.forEach((o) => {
        const x = document.createElement("button");
        x.className = "ctl" + (o.v === c.value ? " on" : "");
        x.textContent = o.label || t(o.labelKey);
        x.addEventListener("click", (e) => { e.stopPropagation(); c.write(app, rec, o.v); });
        g.appendChild(x);
      });
      return g;
    }
    if (c.type === "toggle") {
      const lab = document.createElement("label");
      lab.className = "ctx-toggle";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!c.on;
      cb.addEventListener("change", () => c.write(app, rec, cb.checked));
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" " + (c.label || t(c.labelKey))));
      return lab;
    }
    if (c.type === "color" || c.type === "range") {
      const lab = document.createElement("label");
      lab.className = "ctx-lab";
      lab.appendChild(document.createTextNode((c.labelKey ? t(c.labelKey) : c.label || "") + " "));
      const inp = document.createElement("input");
      if (c.type === "color") { inp.type = "color"; inp.value = c.value || "#14b8a6"; }
      else { inp.type = "range"; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = c.value; }
      inp.addEventListener("input", () => c.input(app, rec, inp.value));
      lab.appendChild(inp);
      return lab;
    }
    // button (incl. compound openers). keepFocus binds on mousedown+preventDefault
    // so an editing text element keeps focus; otherwise a normal click. run() owns
    // its own record/refresh.
    const b = document.createElement("button");
    b.className = "ctl" + (c.cls ? " " + c.cls : "") + (c.danger ? " ctl-danger" : "") + (c.on ? " on" : "");
    b.textContent = c.label || (c.labelKey ? t(c.labelKey) : "");
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      c.run(app, rec, b);
      if (c.closeOnRun) hide();
    };
    if (c.keepFocus) b.addEventListener("mousedown", fire);
    else b.addEventListener("click", fire);
    return b;
  }

  return { el: layer, render, openMenu, hide, reposition, current: () => current };
}
