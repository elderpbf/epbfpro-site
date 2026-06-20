// tools/classpulse-display-embed/index.js
//
// Reactive embed of /go/display.html?code=<X> (or /go/host.html for the
// presenter mirror) for the most-recently-opened ClassPulse session.
// Subscribes to the shared discovery poller in engine/classpulse-discovery.js
// so the panel auto-updates when a session opens, closes, or rotates --
// no manual refresh required. When no session is active, embeds the
// ClassPulse session list (/backstage/classpulse/index.html) directly so the
// presenter can start a session from inside the panel.

import { registerTool } from '../../engine/registry.js';
import { subscribeHostedSession } from '../../engine/classpulse-discovery.js';

let mountedRoot = null;
let activeUnsubscribe = null;

function renderEmpty(root) {
  root.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'cp-display-embed__iframe';
  iframe.src = '/backstage/classpulse/index.html';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('title', 'ClassPulse - Lista de sessões');
  root.appendChild(iframe);
}

function renderSession(root, session, isHost) {
  root.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'cp-display-embed__iframe';
  iframe.src = (isHost ? '/go/host.html?code=' : '/go/display.html?code=') + encodeURIComponent(session.code);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('title', 'ClassPulse ' + (isHost ? 'Host ' : 'Display ') + session.code);
  root.appendChild(iframe);

  const badge = document.createElement('div');
  badge.className = 'cp-display-embed__badge';
  badge.textContent = 'Sessão ' + session.code + (session.title ? ' - ' + session.title : '') + (isHost ? ' [Host]' : '');
  root.appendChild(badge);
}

function setupReactiveMount(container, config, isHost) {
  const root = document.createElement('div');
  root.className = 'cp-display-embed';
  container.appendChild(root);
  mountedRoot = root;

  // Default state: show the ClassPulse session list. The poller swaps it for
  // the active session iframe when one is found, and back to the list when a
  // session ends.
  renderEmpty(root);
  let renderedKey = 'empty';

  const preferSlug = config && typeof config.slug === 'string' ? config.slug : null;

  activeUnsubscribe = subscribeHostedSession(preferSlug, (session) => {
    if (mountedRoot !== root) return;

    const newKey = session ? session.code : 'empty';
    if (newKey === renderedKey) return;
    renderedKey = newKey;

    if (!session) renderEmpty(root);
    else renderSession(root, session, isHost);
  });
}

registerTool({
  id: 'classpulse-display-embed',
  kind: 'tool',
  mount(container, config) {
    setupReactiveMount(container, config, false);
  },
  presenterMount(container, config) {
    setupReactiveMount(container, config, true);
  },
  unmount() {
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
    if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
    mountedRoot = null;
  },
});
