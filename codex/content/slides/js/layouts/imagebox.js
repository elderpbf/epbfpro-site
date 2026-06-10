// layouts/imagebox.js — Imagem na caixa + tópicos: like `split`, but the image is
// CONTAINED in a rounded box (not full-bleed) beside the topic list. It reuses the
// shared imgslot + topicList, so the image edits through the imageSlot descriptor and
// the bullets through the topic/container descriptors, exactly like split/topics.
import { bar, contentMotifs } from "../theme/art.js";
import { ed, imgslot, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

export default {
  id: "imagebox",
  label: "Imagem na caixa + tópicos",
  defaults: () => ({
    flip: false,
    title: "Título",
    image: null,
    topics: ["Tópico um", "Tópico dois", "Tópico três"].map((text) => ({ id: uid(), text })),
  }),
  reveals: (s) => Math.max(0, ...s.topics.map((t, i) => (t.step != null ? t.step : i + 1))),
  render: (s) => `${bar}<div class="L-imgbox ${s.flip ? "flip" : ""}">
    <div class="ib-pic">${imgslot("image", s.image)}</div>
    <div class="ib-content">${contentMotifs}${ed("h2", "title", s.title)}
      ${topicList(s.topics)}</div></div>`,
};
