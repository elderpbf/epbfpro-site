// layouts/content/index.js
// Body-driven layout for AI-authored panels. Renders the panel [data-panel-body]
// subtree directly inside a padded flex column. No tool or element slots -- all
// visual content comes from the panel body HTML. Designed so Phase 4 AI generators
// write into the same contract without any runtime changes.

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'content',
  kind: 'layout',
  mount(host, { body } = {}) {
    const section = document.createElement('section');
    section.className = 'pn-content';
    if (body) section.appendChild(body);
    host.appendChild(section);
    active = section;
    return { slots: {} };
  },
  unmount() {
    if (active) { active.remove(); active = null; }
  },
});
