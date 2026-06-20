// layouts/checkpoint/index.js
// Two-column layout for HORA DE TREINAR moments: a content/embed on the left
// and a ClassPulse session slot on the right. Slots: tool (left), classpulse (right).

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'checkpoint',
  kind: 'layout',
  mount(host, { meta } = {}) {
    const section = document.createElement('section');
    section.className = 'pn-checkpoint';

    if (meta && meta.title) {
      const h = document.createElement('h2');
      h.className = 'pn-checkpoint__title';
      h.textContent = meta.title;
      section.appendChild(h);
    }

    const cols = document.createElement('div');
    cols.className = 'pn-checkpoint__cols';

    const toolSlot = document.createElement('div');
    toolSlot.className = 'pn-checkpoint__slot pn-checkpoint__slot--tool';
    toolSlot.dataset.slot = 'tool';
    cols.appendChild(toolSlot);

    const cpSlot = document.createElement('div');
    cpSlot.className = 'pn-checkpoint__slot pn-checkpoint__slot--classpulse';
    cpSlot.dataset.slot = 'classpulse';
    cols.appendChild(cpSlot);

    section.appendChild(cols);
    host.appendChild(section);
    active = section;
    return { slots: { tool: toolSlot, classpulse: cpSlot } };
  },
  unmount() {
    if (active) { active.remove(); active = null; }
  },
});
