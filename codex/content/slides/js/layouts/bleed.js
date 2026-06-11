// layouts/bleed.js — Imagem cheia com frase.
import { imgslot, ed } from "../render/helpers.js";

export default {
  id: "bleed",
  label: "Imagem cheia",
  group: "media",
  defaults: () => ({ image: null, caption: "Frase de impacto" }),
  reveals: () => 0,
  render: (s) => `<div class="L-bleed">${imgslot("image", s.image)}
    <div class="scrim">${ed("div", "caption", s.caption, "line")}</div></div>`,
};
