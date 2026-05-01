// tools/ai-chat/index.js
//
// Embedded chat tool. Calls the Backstage Worker's ai_chat action.
// UI uses Panels --pn-* theme tokens. Generic AI-assistant framing.

import { registerTool } from '../../engine/registry.js';

const API_URL = 'https://backstage-api.pensoia.workers.dev';

let active = null;

registerTool({
  id: 'ai-chat',
  kind: 'tool',
  mount(slot, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'pn-ai-chat';

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
    active = wrap;
    return { unmount() { if (wrap.parentNode) wrap.remove(); active = null; } };
  },
});
