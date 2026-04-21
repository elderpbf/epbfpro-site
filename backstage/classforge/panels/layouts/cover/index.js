// layouts/cover/index.js
//
// Cover layout. Pulls h1 and a subtitle (.pn-subtitle, or first <p>) out of
// the panel body and renders them centered. No slots.

import { registerLayout } from '../../engine/registry.js';

let active = null;

registerLayout({
  id: 'cover',
  kind: 'layout',
  mount(host, { meta, body }) {
    const wrap = document.createElement('section');
    wrap.className = 'pn-cover';

    const titleSrc = body && body.querySelector ? body.querySelector('h1') : null;
    const subSrc   = body && body.querySelector ? body.querySelector('.pn-subtitle, p') : null;

    const h1 = document.createElement('h1');
    h1.className = 'pn-cover__title';
    h1.textContent = (titleSrc && titleSrc.textContent) || meta.title || '';
    wrap.appendChild(h1);

    if (subSrc && subSrc.textContent) {
      const sub = document.createElement('p');
      sub.className = 'pn-cover__subtitle';
      sub.textContent = subSrc.textContent;
      wrap.appendChild(sub);
    }

    host.appendChild(wrap);
    active = wrap;
    return { slots: {} };
  },
  unmount() {
    if (active) { active.remove(); active = null; }
  },
});
