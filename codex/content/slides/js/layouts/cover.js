// layouts/cover.js — Capa / Seção. One self-contained layout module.
import { bar, coverMotifs, BRAIN } from "../theme/art.js";
import { imgInner, ed } from "../render/helpers.js";

export default {
  id: "cover",
  label: "Capa / Seção",
  defaults: () => ({ eyebrow: "Seção", title: "Título da seção", sub: "Subtítulo", icon: null }),
  reveals: () => 0,
  render: (s) => `${bar}${coverMotifs}<div class="L-cover">
    ${ed("div", "eyebrow", s.eyebrow, "eyebrow")}
    <div class="hero">${
      s.icon && s.icon.src
        ? `<div class="heroicon dropzone filled" data-img="icon" data-fkey="icon">${imgInner("icon", s.icon)}</div>`
        : `<div class="heroicon dropzone" data-img="icon">${BRAIN}</div>`
    }
      ${ed("h1", "title", s.title)}</div>
    ${ed("div", "sub", s.sub, "sub")}</div>`,
};
