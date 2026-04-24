// layouts/tool-fullbleed/index.js
//
// Single full-panel slot for one tool. Body content is ignored; the tool
// owns the surface entirely.

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'tool-fullbleed',
  kind: 'layout',
  mount(host) {
    const wrap = document.createElement('section');
    wrap.className = 'pn-tool-fullbleed';
    const slot = document.createElement('div');
    slot.className = 'pn-tool-fullbleed__slot';
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
