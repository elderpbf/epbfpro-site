// render/cardparts.js — the card PART registry. A card is COMPOSED of independent,
// individually-toggleable parts (image / title / body / …). `card.parts` is an OPEN
// map where an ABSENT key means OFF, so a part registered here LATER renders on an
// existing card only once it is toggled on — no deck migration, no reshaping of old
// data. This mirrors the layout + kind registries: a new part = one register() call,
// read by BOTH the renderer (cardBody, below) and the selection bar (select/kinds.js
// builds one on/off toggle per registered part). Render + toggle order follow each
// part's `order`. Low-level slot renderers come from helpers.js (one-way import:
// helpers never imports back, so there is no cycle).
import { imgslot, edPlain } from "./helpers.js";

const _parts = new Map();

/** Register a card part. `render(card, i)` returns the part's HTML for that card
 *  (i is the card's live index, used for the content path). `order` sets render +
 *  toggle position (ascending). `labelKey` is the i18n key for its bar toggle. */
export function register(p) {
  _parts.set(p.id, p);
}

/** All registered parts, in render order. */
export function list() {
  return [..._parts.values()].sort((a, b) => a.order - b.order);
}

// The three parts that recompose the retired title|text|image|image-text modes.
// Any card can now carry an image (the #1 ask), and parts combine freely. Future
// parts (number, badge, price, icon…) register exactly the same way, with NO change
// here or in the renderer / descriptor / schema.
register({
  id: "image",
  order: 10,
  labelKey: "slides.ed_image",
  render: (c, i) => `<div class="c-img">${imgslot(`cards.${i}.image`, c.image, true)}</div>`,
});
register({
  id: "title",
  order: 20,
  labelKey: "slides.ed_title",
  render: (c, i) => edPlain("div", `cards.${i}.title`, c.title, "c-title", `cards.${c.id}`),
});
register({
  id: "body",
  order: 30,
  labelKey: "slides.ed_text",
  render: (c, i) => edPlain("div", `cards.${i}.text`, c.text, "c-text", `cards.${c.id}`),
});

// The card body: render each registered part whose flag is ON in card.parts
// (absent = off), in registry order. Layouts emit content only; controls are data.
function cardBody(c, i) {
  const parts = c.parts || {};
  return list()
    .filter((p) => parts[p.id])
    .map((p) => p.render(c, i))
    .join("");
}

/** One card. `c` is a {id,parts,…,style?,step?} object; `n` is the card count
 *  (drives the reveal class). data-fkey is the stable id ref the flowCard strategy
 *  writes to. The single card renderer, shared by the layout, the navigator
 *  thumbnails and the presenter window. */
export function cardItem(c, i, n) {
  const step = c.step != null ? c.step : (i + 1);
  const cls = n > 1 && step > 0 ? "card reveal" : "card";
  return `<div class="${cls}" data-step="${step}" data-fkey="cards.${c.id}">${cardBody(c, i)}</div>`;
}
