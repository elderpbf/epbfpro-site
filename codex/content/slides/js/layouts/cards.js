// layouts/cards.js — Flexible cards (per-card mode, add/remove/reorder, reveal 1-a-1).
// The card structure + its controls are NOT emitted here: cardItem (render/helpers)
// is the single renderer, and mode/move/delete (card kind) + add (container kind)
// live as descriptor controls on the selection bar. Reveal is a bar/menu toggle.
// Layouts emit content only.
import { bar, circuit } from "../theme/art.js";
import { ed, cardItem } from "../render/helpers.js";
import { uid } from "../core/schema.js";

export default {
  id: "cards",
  label: "Cards",
  defaults: () => ({ title: "", reveal: false, cards: [{ id: uid(), mode: "text", text: "Texto do card" }] }),
  reveals: (s) => (s.reveal ? s.cards.length : 0),
  render: (s) => `${bar}${circuit("br")}<div class="L-cards">
    ${ed("h2", "title", s.title || "")}
    <div class="cardrow">${s.cards.map((c, i) => cardItem(c, i, s.cards.length)).join("")}</div></div>`,
};
