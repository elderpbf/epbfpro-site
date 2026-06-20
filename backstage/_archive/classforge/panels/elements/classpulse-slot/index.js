// elements/classpulse-slot/index.js
//
// ClassPulse slot element. Scaffolded in Phase 2F so Phase 3 presentations
// can declare inline polls without re-implementing embed logic.
//
// Behavior: lazy-loads /backstage/js/classpulse-question.min.js on first
// mount and renders a <classpulse-question mode="embed" slug="..."> node
// into the provided container. Does NOT bind a ClassPulse session and does
// NOT emit session-updated (Reserved, Phase 3).

import { registerElement } from '../../engine/registry.js';

let mountedNode = null;
let scriptPromise = null;

function ensureCustomElement() {
  if (typeof customElements !== 'undefined' && customElements.get('classpulse-question')) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('classpulse-slot: document is not available'));
      return;
    }
    const existing = document.querySelector
      ? document.querySelector('script[src="/backstage/js/classpulse-question.min.js"]')
      : null;
    if (!existing) {
      const script = document.createElement('script');
      script.src = '/backstage/js/classpulse-question.min.js';
      script.async = true;
      script.addEventListener('error', () => {
        scriptPromise = null;
        reject(new Error('classpulse-slot: failed to load classpulse-question.min.js'));
      });
      (document.head || document.body || document.documentElement).appendChild(script);
    }
    if (typeof customElements !== 'undefined' && customElements.whenDefined) {
      customElements.whenDefined('classpulse-question').then(resolve, (err) => {
        scriptPromise = null;
        reject(err);
      });
    } else {
      resolve();
    }
  });
  return scriptPromise;
}

registerElement({
  id: 'classpulse-slot',
  kind: 'element',
  mount(container, config) {
    const slug = (config && typeof config.slug === 'string') ? config.slug.trim() : '';
    const node = document.createElement('classpulse-question');
    node.setAttribute('mode', 'embed');
    if (slug) node.setAttribute('slug', slug);
    container.appendChild(node);
    mountedNode = node;
    ensureCustomElement().catch((err) => {
      if (typeof console !== 'undefined') {
        console.warn('[classpulse-slot]', err);
      }
    });
  },
  unmount() {
    if (mountedNode && mountedNode.parentNode) {
      mountedNode.remove();
    }
    mountedNode = null;
  },
  onEvent(evt) {
    // Reserved for Phase 3 session-updated fan-out. No-op in Phase 2.
    void evt;
  },
});
