// tools/tokenizer-embed/index.js
//
// Phase 3A. tokenizer-embed: drops a full-size iframe pointing at
// https://tiktokenizer.vercel.app/ into the slot. Uses the third-party
// tokenizer instead of building one in-house. No registry of tokens,
// no encoder, no composition; consumers wanting programmatic token data
// will need a different tool (deferred until 3B/3C scope is revisited).

import { registerTool } from '../../engine/registry.js';

const DEFAULT_URL = 'https://tiktokenizer.vercel.app/';

let mounted = null;

registerTool({
  id: 'tokenizer-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const url = (typeof cfg.url === 'string' && cfg.url) ? cfg.url : DEFAULT_URL;

    const root = document.createElement('div');
    root.className = 'tok-embed-root';

    const frame = document.createElement('iframe');
    frame.className = 'tok-embed-frame';
    frame.setAttribute('src', url);
    frame.setAttribute('title', 'tiktokenizer');
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    root.appendChild(frame);

    container.appendChild(root);
    mounted = root;
  },
  unmount() {
    if (!mounted) return;
    if (typeof mounted.remove === 'function') mounted.remove();
    mounted = null;
  },
});
