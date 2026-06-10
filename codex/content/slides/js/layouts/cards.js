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
  group: "cards",
  defaults: () => ({ title: "", reveal: false, cards: [{ id: uid(), parts: { body: true }, text: "Texto do card" }] }),
  reveals: (s) => (s.reveal ? Math.max(0, ...s.cards.map((c, i) => c.step != null ? c.step : (i + 1))) : 0),
  render: (s) => {
    const cards = s.cards || [];
    const colCls = s.stacked ? " col" : "";
    const rowW = s.rowW || {}; // per-row main-axis size; a resize sizes the WHOLE stack
    // Group cards into one .cardrow per `row` (absent = row 0 = a single stack),
    // preserving each card's FLAT index (the content path + the identity fkey both
    // use it). Multiple rows = Élder's "two stacks of cards"; CSS stacks them. The
    // row's stored size rides on a --cardw var, so every card in it stays uniform.
    const byRow = new Map();
    cards.forEach((c, i) => {
      const r = c.row || 0;
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(cardItem(c, i, cards.length));
    });
    if (!byRow.size) byRow.set(0, []); // always a selectable row-0 container, even empty
    const rows = [...byRow.keys()].sort((a, b) => a - b)
      .map((r) => {
        const sz = rowW[r] ? ` style="--cardw:${rowW[r]}px"` : "";
        return `<div class="cardrow${colCls}" data-row="${r}"${sz}>${byRow.get(r).join("")}</div>`;
      })
      .join("");
    return `${bar}${circuit("br")}<div class="L-cards">
    ${ed("h2", "title", s.title || "")}
    ${rows}</div>`;
  },
};
