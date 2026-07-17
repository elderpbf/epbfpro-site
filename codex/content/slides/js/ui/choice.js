// ui/choice.js, a modal that asks ONE question with N named answers.
//
// Exists because `window.confirm` only has two answers and one of them is "cancel", and
// the paste question has three: solto, vinculado, desistir (track-35 C, Élder 2026-07-17:
// "ele deve perguntar se quer colar solto ou vinculado"). Built shared from the start
// rather than inlined into the paste handler: a choice with named options is not a paste
// concept, and the next one should not grow a second overlay.
//
// Resolves to the chosen option's `value`, or null when the user backs out (Esc, the
// backdrop, or the Cancel button). Never rejects: the caller's "user said no" and "it
// broke" must not arrive on the same path.
import { t } from "../../../../js/i18n.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * askChoice(root, { title, message, options }) -> Promise<value|null>
 * `options`: [{ value, label, hint?, primary? }] rendered in order.
 */
export function askChoice(root, { title, message, options } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "choice-overlay";
    overlay.innerHTML =
      `<div class="choice-box" role="dialog" aria-modal="true">` +
        `<div class="choice-title">${esc(title)}</div>` +
        (message ? `<div class="choice-msg">${esc(message)}</div>` : "") +
        `<div class="choice-opts">` +
          (options || []).map((o, i) =>
            `<button type="button" class="choice-opt${o.primary ? " primary" : ""}" data-i="${i}">` +
              `<span class="choice-opt-lbl">${esc(o.label)}</span>` +
              (o.hint ? `<span class="choice-opt-hint">${esc(o.hint)}</span>` : "") +
            `</button>`).join("") +
        `</div>` +
        `<button type="button" class="choice-cancel">${esc(t("slides.ai_cancel"))}</button>` +
      `</div>`;
    root.appendChild(overlay);

    // ONE exit for every way out, so no path can leave the overlay in the DOM or the key
    // listener on the document (both would outlive the editor's unmount).
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value === undefined ? null : value);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // before the editor's own Esc handlers (present/preview/menus)
      finish(null);
    };
    document.addEventListener("keydown", onKey, true);

    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) finish(null); });
    overlay.querySelector(".choice-cancel").addEventListener("click", () => finish(null));
    overlay.querySelectorAll(".choice-opt").forEach((b) => {
      b.addEventListener("click", () => finish((options[+b.dataset.i] || {}).value));
    });
    const first = overlay.querySelector(".choice-opt");
    if (first) first.focus();
  });
}
