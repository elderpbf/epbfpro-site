// layouts/split.js — Imagem + tópicos, with a draggable ratio divider. Topics use
// the shared topicList helper (same id-keyed bullets as the topics layout); the
// divider stays an editor-only handle the `ratio` geometry drives.
import { bar, contentMotifs } from "../theme/art.js";
import { imgslot, ed, topicList } from "../render/helpers.js";
import { uid } from "../core/schema.js";

export default {
  id: "split",
  label: "Imagem + tópicos",
  defaults: () => ({
    flip: false,
    ratio: 0.5,
    title: "Título",
    image: null,
    topics: ["Tópico um", "Tópico dois", "Tópico três"].map((text) => ({ id: uid(), text })),
  }),
  reveals: (s) => Math.max(0, ...s.topics.map((t, i) => t.step != null ? t.step : (i + 1))),
  render: (s) => `${bar}<div class="L-split ${s.flip ? "flip" : ""}" style="grid-template-columns:${
    (s.ratio || 0.5) * 100
  }% ${(1 - (s.ratio || 0.5)) * 100}%">
    <div class="pic">${imgslot("image", s.image)}</div>
    <div class="content">${contentMotifs}${ed("h2", "title", s.title)}
      ${topicList(s.topics)}</div></div>
    <div class="divider editoronly" style="left:${(s.ratio || 0.5) * 100}%"></div>`,
};
