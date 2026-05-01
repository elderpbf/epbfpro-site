// tools/ai-chat/index.js
//
// Embedded chat tool. Calls the Backstage Worker's ai_chat action.
// UI uses Panels --pn-* theme tokens. Generic AI-assistant framing.
//
// Font-size control is provided by engine/panel-pills.js as a bottom-edge
// stepper pill. Hovering the bottom 16px reveals the pill; the - / px / +
// buttons scale all chat content (bubbles + input inherit wrap.style
// fontSize). The previous top-right A-/A+ toolbar was removed because it
// was being covered by the Backstage topbar reveal zone.

import { registerTool } from '../../engine/registry.js';
import { attachPanelPills } from '../../engine/panel-pills.js?v=1.7';

const API_URL = 'https://backstage-api.pensoia.workers.dev';

// FONT_KEY_VERSION: bump the suffix to force a re-default if the size needs
// to change again. Old keys listed in OLD_FONT_KEYS are cleared once on load
// so previously-stored values can't override the new default.
const FONT_KEY_VERSION = 'bs_ai_chat_font_size_v2';
const OLD_FONT_KEYS = ['bs_ai_chat_font_size'];
try {
  for (const oldKey of OLD_FONT_KEYS) {
    if (localStorage.getItem(oldKey) !== null) localStorage.removeItem(oldKey);
  }
} catch (_) {}

const FONT_MIN  = 16;
const FONT_MAX  = 40;
const FONT_STEP = 2;

let mountedWrap = null;
let pillHandle = null;

registerTool({
  id: 'ai-chat',
  kind: 'tool',
  mount(slot, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'pn-ai-chat';

    // Read persisted size or default to 28px.
    let fontSize = parseInt(localStorage.getItem(FONT_KEY_VERSION), 10);
    if (!Number.isFinite(fontSize) || fontSize < FONT_MIN || fontSize > FONT_MAX) fontSize = 28;

    function applyFontSize() {
      wrap.style.fontSize = fontSize + 'px';
      try { localStorage.setItem(FONT_KEY_VERSION, String(fontSize)); } catch (_) {}
    }
    applyFontSize();

    const messagesEl = document.createElement('div');
    messagesEl.className = 'pn-ai-chat__messages';
    wrap.appendChild(messagesEl);

    const form = document.createElement('form');
    form.className = 'pn-ai-chat__form';
    const input = document.createElement('textarea');
    input.className = 'pn-ai-chat__input';
    input.rows = 2;
    input.placeholder = 'Digite uma mensagem...';
    form.appendChild(input);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'pn-ai-chat__send';
    sendBtn.textContent = 'Enviar';
    form.appendChild(sendBtn);
    wrap.appendChild(form);

    slot.appendChild(wrap);

    // Anchor pills to the slot not wrap: tool-fullbleed slot padding (48px)
    // would otherwise push the pill 64px above the viewport bottom. Anchoring
    // to the slot puts bottom: 8px relative to the slot boundary (viewport
    // bottom) and ensures the hidden pill slides below the viewport so it
    // cannot re-trigger show on hover.
    if (getComputedStyle(slot).position === 'static') slot.style.position = 'relative';

    pillHandle = attachPanelPills(slot, {
      pills: [{
        kind: 'stepper',
        value: fontSize,
        min: FONT_MIN,
        max: FONT_MAX,
        step: FONT_STEP,
        format: (v) => v + 'px',
        onChange: (v) => {
          fontSize = v;
          applyFontSize();
        },
        ariaLabelMinus: 'Diminuir fonte',
        ariaLabelPlus:  'Aumentar fonte',
      }],
    });

    const messages = [];

    function addBubble(role, text) {
      const bubble = document.createElement('div');
      bubble.className = 'pn-ai-chat__bubble pn-ai-chat__bubble--' + role;
      bubble.textContent = text;
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    async function send(text) {
      messages.push({ role: 'user', content: text });
      addBubble('user', text);
      const thinkingBubble = addBubble('assistant', '...');
      sendBtn.disabled = true;
      input.disabled = true;
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ai_chat', messages })
        });
        const data = await resp.json();
        if (data && data.ok && data.text) {
          thinkingBubble.textContent = data.text;
          messages.push({ role: 'model', content: data.text });
        } else {
          thinkingBubble.textContent = 'Erro: ' + (data.error || 'sem resposta');
          thinkingBubble.classList.add('pn-ai-chat__bubble--error');
        }
      } catch (err) {
        thinkingBubble.textContent = 'Erro de rede: ' + (err.message || err);
        thinkingBubble.classList.add('pn-ai-chat__bubble--error');
      } finally {
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
      }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      send(text);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    requestAnimationFrame(() => input.focus());
    mountedWrap = wrap;
  },
  unmount() {
    if (pillHandle) { pillHandle.destroy(); pillHandle = null; }
    if (!mountedWrap) return;
    if (typeof mountedWrap.remove === 'function') mountedWrap.remove();
    mountedWrap = null;
  },
});
