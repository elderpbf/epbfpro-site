// layouts/split.js — Imagem + tópicos, with a draggable ratio divider.
import { bar, contentMotifs } from "../theme/art.js";
import { imgslot, ed } from "../render/helpers.js";

const topic = (t, i) =>
  `<li class="reveal" data-step="${i + 1}" data-fkey="topics.${i}">` +
  `<span class="editable" data-path="topics.${i}" data-edit="1">${t}</span>` +
  `<button class="li-x editoronly" data-del="topics.${i}">remover</button></li>`;

export default {
  id: "split",
  label: "Imagem + tópicos",
  defaults: () => ({
    flip: false,
    ratio: 0.5,
    title: "Título",
    image: null,
    topics: ["Tópico um", "Tópico dois", "Tópico três"],
  }),
  reveals: (s) => s.topics.length,
  render: (s) => `${bar}<div class="L-split ${s.flip ? "flip" : ""}" style="grid-template-columns:${
    (s.ratio || 0.5) * 100
  }% ${(1 - (s.ratio || 0.5)) * 100}%">
    <div class="pic">${imgslot("image", s.image)}</div>
    <div class="content">${contentMotifs}${ed("h2", "title", s.title)}
      <ul class="topiclist">${s.topics.map(topic).join("")}</ul>
      <button class="addtopic editoronly" data-add="topics">+ tópico</button></div></div>
    <div class="divider editoronly" style="left:${(s.ratio || 0.5) * 100}%"></div>`,
};
