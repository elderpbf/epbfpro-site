// select/bar.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// The ONE selection surface: a contextual bar docked to the top edge of the
// stage, built in the UNSCALED #stagebox layer (a sibling of .flayer, NOT inside
// the transform:scale #stage), visible only while something is selected. It
// knows a small FIXED set of control PRIMITIVES (select, toggle, button) and
// renders each generically. A descriptor is just data listing primitives, so
// the bar NEVER switches on a kind id: a new control type is the only thing that
// touches this file.
//
// Two write contracts (per the validated design): discrete controls here use
// record -> mutate -> refresh; continuous geometry gestures use begin/live/commit
// and live in wiring.js (they must not full-re-render the stage mid-drag).
import { t } from "../../../../js/i18n.js";
import * as kinds from "./kinds.js";

export function createBar(app) {
  const bar = document.createElement("div");
  bar.className = "selbar";
  bar.style.display = "none";
  app.stagebox.appendChild(bar); // persists across stage re-renders

  let current = null;

  function hide() {
    current = null;
    bar.style.display = "none";
    bar.innerHTML = "";
  }

  function render(rec) {
    const desc = kinds.get(rec.kind);
    if (!desc) return hide();
    const ctrls = desc.controls(app, rec, desc.target(app, rec));
    if (!ctrls.length) return hide();
    current = rec;
    bar.innerHTML = "";
    ctrls.forEach((c) => bar.appendChild(widget(c, rec)));
    bar.style.display = "flex";
  }

  function widget(c, rec) {
    if (c.type === "select") {
      const s = document.createElement("select");
      s.className = "selbar-ctl";
      s.innerHTML = c.options
        .map((o) => `<option value="${o.v}"${o.v === c.value ? " selected" : ""}>${t(o.labelKey)}</option>`)
        .join("");
      s.addEventListener("change", () => {
        app.record("sel:" + rec.kind + ":" + c.id);
        c.write(app, rec, s.value);
        app.refresh();
      });
      return s;
    }
    if (c.type === "toggle") {
      const lab = document.createElement("label");
      lab.className = "selbar-toggle";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!c.on;
      cb.addEventListener("change", () => {
        app.record("sel:" + rec.kind + ":" + c.id);
        c.write(app, rec, cb.checked);
        app.refresh();
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(t(c.labelKey)));
      return lab;
    }
    // button (incl. compound openers such as the mask sub-panel). The run()
    // owns its own record/refresh, so the bar does not wrap it.
    const b = document.createElement("button");
    b.className = "selbar-ctl" + (c.danger ? " selbar-danger" : "");
    b.textContent = c.label || (c.labelKey ? t(c.labelKey) : "");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      c.run(app, rec, b);
    });
    return b;
  }

  return {
    el: bar,
    render,
    hide,
    current() {
      return current;
    },
  };
}
