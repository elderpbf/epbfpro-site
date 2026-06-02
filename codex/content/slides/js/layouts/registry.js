// layouts/registry.js — the plugin registry. The engine reads only this; it
// NEVER switches on a layout id. Adding a layout = import it + register() here.
import cover from "./cover.js";
import split from "./split.js";
import topics from "./topics.js";
import bleed from "./bleed.js";
import cards from "./cards.js";

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

[cover, split, topics, bleed, cards].forEach(register);
