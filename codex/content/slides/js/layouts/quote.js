// layouts/quote.js — Citação: a large quote + attribution (author / role). All three
// are free text slots (shared textSlot descriptor), so they edit and freeform-move
// with no layout-specific wiring. No image: that is what `bleed` (image + line) is for.
import { bar } from "../theme/art.js";
import { ed } from "../render/helpers.js";

export default {
  id: "quote",
  label: "Citação",
  group: "title",
  defaults: () => ({
    quote: "Nós moldamos nossas ferramentas e, depois, elas nos moldam.",
    author: "John M. Culkin",
    role: "educador",
  }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-quote">
    <blockquote>${ed("div", "quote", s.quote, "q-text")}</blockquote>
    <div class="q-by">${ed("div", "author", s.author, "q-author")}${ed("div", "role", s.role, "q-role")}</div>
  </div>`,
};
