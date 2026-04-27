// layouts/embed-fullbleed/index.js
//
// Like tool-fullbleed, but with zero padding and the tool slot filling
// the viewport exactly. For embedded media (Slides iframe, video, GIF,
// custom JS animation) where any margin reads as a layout bug. Use
// tool-fullbleed instead when the tool wants breathing room around it
// (e.g., the tokenizer with its floating zoom controls).

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'embed-fullbleed',
  kind: 'layout',
  mount(host) {
    const wrap = document.createElement('section');
    wrap.className = 'pn-embed-fullbleed';
    const slot = document.createElement('div');
    slot.className = 'pn-embed-fullbleed__slot';
    slot.dataset.slot = 'tool';
    wrap.appendChild(slot);
    host.appendChild(wrap);
    active = wrap;
    return { slots: { tool: slot } };
  },
  unmount() {
    if (active) { active.remove(); active = null; }
  },
});
