// tools/popup-launcher/index.js
//
// Renders a launcher card for any external web app that resists being
// iframed (X-Frame-Options / frame-ancestors CSP). Click the button and
// the app opens in a popup window sized to overlay the deck. Browsers
// block window.open without a user gesture, so the click is required;
// auto-open on panel entry is not possible.

import { registerTool } from '../../engine/registry.js';

let mountedRoot = null;

function openPopup(url) {
  const w = Math.max(800, Math.floor((window.outerWidth || window.innerWidth) - 80));
  const h = Math.max(600, Math.floor((window.outerHeight || window.innerHeight) - 80));
  const left = (typeof window.screenX === 'number' ? window.screenX : 0) + 40;
  const top = (typeof window.screenY === 'number' ? window.screenY : 0) + 40;
  const features = [
    'popup=yes',
    'width=' + w,
    'height=' + h,
    'left=' + left,
    'top=' + top,
    'toolbar=no',
    'menubar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
  const popup = window.open(url, '_blank', features);
  if (popup && typeof popup.focus === 'function') popup.focus();
  return popup;
}

registerTool({
  id: 'popup-launcher',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const url = typeof cfg.url === 'string' ? cfg.url : '';
    const label = typeof cfg.label === 'string' ? cfg.label : 'Abrir ferramenta';
    const description = typeof cfg.description === 'string' ? cfg.description : '';
    const icon = typeof cfg.icon === 'string' ? cfg.icon : '';
    const buttonText = typeof cfg.buttonText === 'string' ? cfg.buttonText : 'Abrir em janela sobre o painel';

    const root = document.createElement('div');
    root.className = 'popup-launcher';

    const card = document.createElement('div');
    card.className = 'popup-launcher__card';

    if (icon) {
      const img = document.createElement('img');
      img.className = 'popup-launcher__icon';
      img.src = icon;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      card.appendChild(img);
    }

    const title = document.createElement('h2');
    title.className = 'popup-launcher__title';
    title.textContent = label;
    card.appendChild(title);

    if (description) {
      const desc = document.createElement('p');
      desc.className = 'popup-launcher__desc';
      desc.textContent = description;
      card.appendChild(desc);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'popup-launcher__btn';
    btn.textContent = buttonText;
    btn.addEventListener('click', () => {
      if (!url) return;
      const popup = openPopup(url);
      if (!popup) {
        const warn = document.createElement('p');
        warn.className = 'popup-launcher__warn';
        warn.textContent = 'O navegador bloqueou o popup. Permita popups para este site e tente novamente.';
        card.appendChild(warn);
      }
    });
    card.appendChild(btn);

    if (url) {
      const note = document.createElement('p');
      note.className = 'popup-launcher__url';
      note.textContent = url;
      card.appendChild(note);
    }

    root.appendChild(card);
    container.appendChild(root);
    mountedRoot = root;
  },
  unmount() {
    if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
    mountedRoot = null;
  },
});
