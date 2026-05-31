// layouts/topics.js — Só tópicos.
import { bar, contentMotifs } from "../theme/art.js";
import { ed } from "../render/helpers.js";

const topic = (t, i) =>
  `<li class="reveal" data-step="${i + 1}" data-fkey="topics.${i}">` +
  `<span class="editable" data-path="topics.${i}" data-edit="1">${t}</span>` +
  `<button class="li-x editoronly" data-del="topics.${i}">remover</button></li>`;

export default {
  id: "topics",
  label: "Só tópicos",
  defaults: () => ({ title: "Título", topics: ["Tópico um", "Tópico dois", "Tópico três"] }),
  reveals: (s) => s.topics.length,
  render: (s) => `${bar}<div class="L-topics">${contentMotifs}${ed("h2", "title", s.title)}
    <ul class="topiclist">${s.topics.map(topic).join("")}</ul>
    <button class="addtopic editoronly" data-add="topics">+ tópico</button></div>`,
};
