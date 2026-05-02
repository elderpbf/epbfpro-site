// tools/classpulse-display-embed/index.js
//
// Embeds /go/display.html?code=<X> for the most-recently-opened ClassPulse
// session. Calls list_sessions on the backstage Worker, filters status=open,
// and prefers a session linked to config.slug if provided. Renders an empty
// state when no open session exists. The component itself (display.html) is
// authoritative for the live QR + question UI; this tool is just the embed
// shell + auto-discovery.

import { registerTool } from '../../engine/registry.js';
import { findHostedSession } from '../../engine/classpulse-discovery.js';

let mountedRoot = null;

function renderEmpty(root, message) {
  root.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'cp-display-embed__msg cp-display-embed__msg--empty';
  msg.innerHTML = message;
  root.appendChild(msg);
}

function renderSession(root, session) {
  root.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'cp-display-embed__iframe';
  iframe.src = '/go/display.html?code=' + encodeURIComponent(session.code);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('title', 'ClassPulse Display ' + session.code);
  root.appendChild(iframe);

  const badge = document.createElement('div');
  badge.className = 'cp-display-embed__badge';
  badge.textContent = 'Sessão ' + session.code + (session.title ? ' - ' + session.title : '');
  root.appendChild(badge);
}

function renderSessionHost(root, session) {
  root.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'cp-display-embed__iframe';
  iframe.src = '/go/host.html?code=' + encodeURIComponent(session.code);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('title', 'ClassPulse Host ' + session.code);
  root.appendChild(iframe);

  const badge = document.createElement('div');
  badge.className = 'cp-display-embed__badge';
  badge.textContent = 'Sessão ' + session.code + (session.title ? ' - ' + session.title : '') + ' [Host]';
  root.appendChild(badge);
}

function discoverAndRender(root, config, renderFn) {
  const loading = document.createElement('div');
  loading.className = 'cp-display-embed__msg';
  loading.textContent = 'Procurando sessão hospedada...';
  root.appendChild(loading);

  const preferSlug = config && typeof config.slug === 'string' ? config.slug : null;

  findHostedSession(preferSlug).then(session => {
    if (mountedRoot !== root) return;
    if (!session) {
      renderEmpty(root, 'Nenhuma sessão hospedada.<br>Abra uma sessão no ClassPulse e recarregue o painel.');
      return;
    }
    renderFn(root, session);
  }).catch(err => {
    if (mountedRoot !== root) return;
    const msg = (err && err.message) ? err.message : String(err);
    renderEmpty(root, 'Erro ao buscar sessão: ' + msg);
  });
}

registerTool({
  id: 'classpulse-display-embed',
  kind: 'tool',
  mount(container, config) {
    const root = document.createElement('div');
    root.className = 'cp-display-embed';
    container.appendChild(root);
    mountedRoot = root;
    discoverAndRender(root, config, renderSession);
  },
  presenterMount(container, config) {
    const root = document.createElement('div');
    root.className = 'cp-display-embed';
    container.appendChild(root);
    mountedRoot = root;
    discoverAndRender(root, config, renderSessionHost);
  },
  unmount() {
    if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
    mountedRoot = null;
  },
});
