// layouts/cover.js — Capa / Seção. One self-contained layout module. The hero is
// the SAME unified image box as every other layout (imgslot), no per-layout art.
import { bar, coverMotifs } from "../theme/art.js";
import { imgslot, ed } from "../render/helpers.js";

export default {
  id: "cover",
  label: "Capa / Seção",
  group: "title",
  defaults: () => ({ eyebrow: "Seção", title: "Título da seção", sub: "Subtítulo", icon: null }),
  reveals: () => 0,
  render: (s) => `${bar}${coverMotifs}<div class="L-cover">
    ${ed("div", "eyebrow", s.eyebrow, "eyebrow")}
    <div class="hero"><div class="heroicon">${imgslot("icon", s.icon)}</div>
      ${ed("h1", "title", s.title)}</div>
    ${ed("div", "sub", s.sub, "sub")}</div>`,
};
