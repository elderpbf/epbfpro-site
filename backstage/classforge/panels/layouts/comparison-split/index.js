// layouts/comparison-split/index.js
// Two equal columns with a visual divider and an optional title bar from body.
// Slots: left, right. Body content (if present) renders as the title bar.

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'comparison-split',
  kind: 'layout',
  mount(host, { meta, body } = {}) {
    const section = document.createElement('section');
    section.className = 'pn-comparison-split';

    const titleText = (body && body.textContent && body.textContent.trim()) || (meta && meta.title) || '';
    if (titleText) {
      const titleBar = document.createElement('div');
      titleBar.className = 'pn-comparison-split__title-bar';
      if (body && body.textContent && body.textContent.trim()) {
        titleBar.appendChild(body);
      } else {
        titleBar.textContent = titleText;
      }
      section.appendChild(titleBar);
    }

    const cols = document.createElement('div');
    cols.className = 'pn-comparison-split__cols';

    const leftSlot = document.createElement('div');
    leftSlot.className = 'pn-comparison-split__slot pn-comparison-split__slot--left';
    leftSlot.dataset.slot = 'left';
    cols.appendChild(leftSlot);

    const divider = document.createElement('div');
    divider.className = 'pn-comparison-split__divider';
    cols.appendChild(divider);

    const rightSlot = document.createElement('div');
    rightSlot.className = 'pn-comparison-split__slot pn-comparison-split__slot--right';
    rightSlot.dataset.slot = 'right';
    cols.appendChild(rightSlot);

    section.appendChild(cols);
    host.appendChild(section);
    active = section;
    return { slots: { left: leftSlot, right: rightSlot } };
  },
  unmount() {
    if (active) { active.remove(); active = null; }
  },
});
