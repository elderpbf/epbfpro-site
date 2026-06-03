// edit/maskpanel.js — the recolour-mask popover (#maskpop), extracted from app.js
// (5d). The bar's "máscara" control + the slot data-mask button call app.openMask.
import { getByPath } from "../core/schema.js";
import { t } from "../../../../js/i18n.js";

/** The #maskpop markup, interpolated into the editor shell by app.js. */
export function maskPanelHTML() {
  return `
<div id="maskpop">
  <div class="mp-types"><button data-mtype="none">${t("slides.ed_mask_none")}</button><button data-mtype="color">${t("slides.ed_mask_color")}</button><button data-mtype="gradient">${t("slides.ed_mask_gradient")}</button></div>
  <div class="mp-field"><span>${t("slides.ed_color")}</span><input type="color" id="mc1" value="#14b8a6"></div>
  <div class="mp-field mp-g"><span>${t("slides.ed_color2")}</span><input type="color" id="mc2" value="#0d9488"></div>
  <div class="mp-field mp-g"><span>${t("slides.ed_angle")}</span><input type="range" id="mang" min="0" max="360" value="45"></div>
</div>`;
}

export function initMaskPanel(app, root) {
  if (app.isPresenter) return;
  const $ = (sel) => root.querySelector(sel);
  let maskTarget = null;

  const maskObj = () => {
    if (!maskTarget) return null;
    return maskTarget.kind === "asset"
      ? app.deck().assets.find((a) => a.id === maskTarget.id)
      : getByPath(app.cur().slots, maskTarget.path);
  };

  app.openMask = (target, anchorEl) => {
    maskTarget = target;
    const pop = $("#maskpop");
    const obj = maskObj();
    const mask = obj && obj.mask;
    if (mask) {
      $("#mc1").value = mask.c1 || "#14b8a6";
      if (mask.type === "gradient") {
        $("#mc2").value = mask.c2 || "#0d9488";
        $("#mang").value = mask.angle || 45;
      }
    }
    pop.classList.toggle("grad", !!mask && mask.type === "gradient");
    const r = anchorEl.getBoundingClientRect();
    pop.style.display = "flex";
    const pw = pop.offsetWidth || 220;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + "px";
    pop.style.top = r.bottom + 8 + "px";
  };

  const maskpop = $("#maskpop");
  maskpop.querySelectorAll("[data-mtype]").forEach((b) => (b.onclick = () => {
    const obj = maskObj();
    if (!obj) return;
    app.record("mask");
    const type = b.dataset.mtype;
    if (type === "none") obj.mask = null;
    else if (type === "color") obj.mask = { type: "color", c1: $("#mc1").value };
    else obj.mask = { type: "gradient", c1: $("#mc1").value, c2: $("#mc2").value, angle: +$("#mang").value };
    maskpop.classList.toggle("grad", type === "gradient");
    app.refresh();
  }));
  const liveMask = () => {
    const obj = maskObj();
    if (!obj || !obj.mask) return;
    app.record("mask:live");
    obj.mask.c1 = $("#mc1").value;
    if (obj.mask.type === "gradient") { obj.mask.c2 = $("#mc2").value; obj.mask.angle = +$("#mang").value; }
    app.refresh();
  };
  ["#mc1", "#mc2", "#mang"].forEach((id) => $(id).addEventListener("input", liveMask));

  // outside-click closes it (openers stopPropagation to stay open); removed in unmount.
  const onMaskDocClick = (e) => {
    const mp = $("#maskpop");
    if (mp && !e.target.closest("#maskpop") && !e.target.closest("[data-mask]") && !e.target.closest("[data-asmask]")) {
      mp.style.display = "none";
    }
  };
  document.addEventListener("click", onMaskDocClick);
  app._onMaskDocClick = onMaskDocClick;
}
