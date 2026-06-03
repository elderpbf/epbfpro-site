// layouts/cards.js — Flexible cards (per-card mode, add/remove/reorder, reveal 1-a-1).
import { bar, circuit } from "../theme/art.js";
import { imgslot, ed, edPlain } from "../render/helpers.js";

// Card-internal text uses edPlain: the CARD is the freeform unit, text edits in place.
function cardBody(c, i) {
  if (c.mode === "title") return edPlain("div", `cards.${i}.title`, c.title, "c-title");
  if (c.mode === "text") return edPlain("div", `cards.${i}.text`, c.text, "c-text");
  if (c.mode === "image") return `<div class="c-img">${imgslot(`cards.${i}.image`, c.image, "foto", true)}</div>`;
  return `<div class="c-img">${imgslot(`cards.${i}.image`, c.image, "foto", true)}</div>` + edPlain("div", `cards.${i}.text`, c.text, "c-text");
}

function cardCtl(c, i) {
  const opt = (v, label) => `<option value="${v}"${c.mode === v ? " selected" : ""}>${label}</option>`;
  return `<div class="cardctl editoronly"><select data-cardmode="${i}">
    ${opt("title", "Título")}${opt("text", "Texto")}${opt("image", "Imagem")}${opt("image-text", "Imagem+texto")}</select>
    <button data-cardmove="${i}:-1">◀</button><button data-cardmove="${i}:1">▶</button><button data-carddel="${i}">✕</button></div>`;
}

// data-fmode="flow": cards resize WITHIN the flex stack (neighbours conform, no
// overlap) instead of lifting out to absolute like other freeform elements.
const cardHtml = (c, i, n) =>
  `<div class="card ${n > 1 ? "reveal" : ""}" data-step="${i + 1}" data-fkey="cards.${i}" data-fmode="flow">${cardCtl(c, i)}${cardBody(c, i)}</div>`;

export default {
  id: "cards",
  label: "Cards",
  defaults: () => ({ title: "", reveal: false, cards: [{ mode: "text", text: "Texto do card" }] }),
  reveals: (s) => (s.reveal ? s.cards.length : 0),
  render: (s) => `${bar}${circuit("br")}<div class="L-cards">
    ${ed("h2", "title", s.title || "")}
    <div class="cardrow">${s.cards.map((c, i) => cardHtml(c, i, s.cards.length)).join("")}</div>
    <div class="cardadd editoronly"><button data-addcard>＋ card</button>
      <label><input type="checkbox" data-cardreveal ${s.reveal ? "checked" : ""}> revelar 1 a 1</label></div></div>`,
};
