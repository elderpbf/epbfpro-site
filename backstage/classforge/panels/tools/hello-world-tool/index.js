// tools/hello-world-tool/index.js
//
// Smoke-test tool. Renders a greeting block on mount, removes it on unmount,
// and logs every engine lifecycle event it receives.

import { registerTool } from '../../engine/registry.js';

let active = null;

registerTool({
  id: 'hello-world-tool',
  kind: 'tool',
  mount(container, config) {
    const block = document.createElement('div');
    block.className = 'pn-hello';
    block.textContent = (config && config.greeting) || 'Hello from Panels v2';
    container.appendChild(block);
    active = block;
    console.log('[hello-world-tool] mount');
  },
  unmount() {
    if (active) { active.remove(); active = null; }
    console.log('[hello-world-tool] unmount');
  },
  onEvent(evt) {
    console.log('[hello-world-tool] event', evt.type, evt.detail);
  },
});
