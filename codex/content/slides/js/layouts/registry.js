// layouts/registry.js — the plugin registry. The engine reads only this; it
// NEVER switches on a layout id. Adding a layout = import it + register() here.
import cover from "./cover.js";
import split from "./split.js";
import topics from "./topics.js";
import bleed from "./bleed.js";
import cards from "./cards.js";
import statement from "./statement.js";
import quote from "./quote.js";
import imagebox from "./imagebox.js";
import compare from "./compare.js";
import checklist from "./checklist.js";
import steps from "./steps.js";
import roadmap from "./roadmap.js";
import define from "./define.js";
import agenda from "./agenda.js";

const _layouts = new Map();

export function register(layout) {
  _layouts.set(layout.id, layout);
}
export function get(id) {
  return _layouts.get(id);
}
export function list() {
  return [..._layouts.values()];
}

[cover, split, topics, bleed, cards, statement, quote, imagebox, compare, checklist, steps, roadmap, define, agenda].forEach(register);
