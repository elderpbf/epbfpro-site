// layouts/cards.js — Flexible cards (composable per-card parts, add/remove/reorder,
// reveal 1-a-1). The card structure + its controls are NOT emitted here: cardItem
// (render/cardparts) is the single renderer, and part toggles/move/delete (card kind)
// + add (container kind) live as descriptor controls on the selection bar. Reveal is
// a bar/menu toggle. Layouts emit content only.
import { bar, circuit } from "../theme/art.js";
import { ed } from "../render/helpers.js";
import { cardItem } from "../render/cardparts.js";
import { uid } from "../core/schema.js";

export default {
  id: "cards",
  label: "Cards",
  defaults: () => ({ title: "", reveal: false, cards: [{ id: uid(), parts: { body: true }, text: "Texto do card" }] }),
  reveals: (s) => (s.reveal ? Math.max(0, ...s.cards.map((c, i) => c.step != null ? c.step : (i + 1))) : 0),
  render: (s) => `${bar}${circuit("br")}<div class="L-cards">
    ${ed("h2", "title", s.title || "")}
    <div class="cardrow${s.stacked ? " col" : ""}">${s.cards.map((c, i) => cardItem(c, i, s.cards.length)).join("")}</div></div>`,
};
