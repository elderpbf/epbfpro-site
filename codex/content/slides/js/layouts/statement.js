// layouts/statement.js — Frase de impacto: one large typographic line, no image
// and no attribution. Distinct from `quote` (which carries an author) and `bleed`
// (which needs a full-bleed image). The line is a free text slot, so it edits and
// freeform-moves through the shared textSlot descriptor with no layout-specific code.
import { bar } from "../theme/art.js";
import { ed } from "../render/helpers.js";

export default {
  id: "statement",
  label: "Frase de impacto",
  group: "title",
  defaults: () => ({ text: "A IA não substitui a atuação humana." }),
  reveals: () => 0,
  render: (s) => `${bar}<div class="L-statement">${ed("div", "text", s.text, "big")}</div>`,
};
