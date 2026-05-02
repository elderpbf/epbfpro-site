// tools/classpulse-display-embed/index.js
//
// Reactive embed of /go/display.html?code=<X> (or /go/host.html for the
// presenter mirror) for the most-recently-opened ClassPulse session.
// Subscribes to the shared discovery poller in engine/classpulse-discovery.js
// so the panel auto-updates when a session opens, closes, or rotates --
// no manual refresh required. Renders an empty state with an "Open ClassPulse"
// button when no session is active.

import { registerTool } from '../../engine/registry.js';
import { subscribeHostedSession } from '../../engine/classpulse-discovery.js';

let mountedRoot = null;
let activeUnsubscribe = null;

function renderLoading(root) {
  root.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'cp-display-embed__msg';
  msg.textContent = 'Procurando sessão hospedada...';
  root.appendChild(msg);
}

function renderEmpty(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'cp-display-embed__msg cp-display-embed__msg--empty';

  const text = document.createElement('div');
  text.innerHTML = 'Nenhuma sessão hospedada.<br>Abra uma sessão no ClassPulse &mdash; esta tela atualiza sozinha.';
  wrap.appendChild(text);

  const link = document.createElement('a');
  link.className = 'cp-display-embed__open-btn';
  link.href = '/backstage/classpulse/index.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Abrir ClassPulse';
  wrap.appendChild(link);

  root.appendChild(wrap);
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

  renderLoading(root);
  let renderedKey = 'loading';
  let firstFire = true;

  const preferSlug = config && typeof config.slug === 'string' ? config.slug : null;

  activeUnsubscribe = subscribeHostedSession(preferSlug, (session) => {
    if (mountedRoot !== root) return;

    // First fire is synchronous with the module-level cache. If the cache is
    // null, keep loading visible until the real poll resolves -- avoids a
    // brief flash to empty when a session is actually open.
    if (firstFire) {
      firstFire = false;
      if (session === null) return;
    }

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
