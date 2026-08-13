// js/ai-models.js
// Which AI handles the call. Élder 2026-08-07: "o botão da IA deve ter um dropdown para escolher
// a IA que será usada... seria difícil?".
//
// It wasn't: the Worker ALREADY accepts `provider` and `openrouter_model` in `ai_chat`
// (src/ai.js), and the facade passes the params through untouched. So this here is a LIST and
// a stored preference, not new integration. No key ever reaches the browser: the client says
// WHO should handle it, and the keys stay only in the Worker environment.
//
// A factual correction, so as not to pick wrong from memory: the OpenRouter default is
// NO LONGER Mistral. It was swapped on 2026-07-20, by Élder's own recorded decision, from
// `mistralai/mistral-small-24b` to `qwen/qwen3-30b-a3b-instruct-2507` (the rationale and the
// caveat are in src/ai.js:297-307 of codex-api). Mistral is still selectable here.

// Empty `provider` = the Worker's default CHAIN: the two Gemini keys first (one covers for the
// other's absence) and OpenRouter as the paid fallback. It's what always ran, and stays the
// default: whoever doesn't want to think, doesn't have to.
export const AI_CHOICES = [
  {
    id: 'auto',
    label: 'Padrão (Gemini, com reserva)',
    hint: 'As duas chaves do Gemini e, se as duas falharem, o OpenRouter.',
    params: {},
  },
  {
    id: 'gemini',
    label: 'Gemini 2.5 Flash',
    hint: 'Fixo na primeira chave, sem cair para a reserva.',
    params: { provider: 'gemini' },
  },
  {
    id: 'qwen',
    label: 'Qwen3 30B',
    hint: 'Padrão do OpenRouter desde 20/07/2026.',
    params: { provider: 'openrouter', openrouter_model: 'qwen/qwen3-30b-a3b-instruct-2507' },
  },
  {
    id: 'llama',
    label: 'Llama 3.3 70B',
    hint: 'Via OpenRouter.',
    params: { provider: 'openrouter', openrouter_model: 'meta-llama/llama-3.3-70b-instruct' },
  },
  {
    id: 'mistral',
    label: 'Mistral Small 24B',
    hint: 'Era o padrão do OpenRouter até 20/07/2026.',
    params: { provider: 'openrouter', openrouter_model: 'mistralai/mistral-small-24b-instruct-2501' },
  },
];

const STORE_KEY = 'cdx_ai_choice';

export function choiceById(id) {
  return AI_CHOICES.find((c) => c.id === id) || AI_CHOICES[0];
}

// The choice survives closing the screen: switching model on every item would be repeated
// work, and the real use case is "today I want to test with another one".
export function getChoice() {
  let id = '';
  try { id = localStorage.getItem(STORE_KEY) || ''; } catch (_) { id = ''; }
  return choiceById(id);
}

export function setChoice(id) {
  try { localStorage.setItem(STORE_KEY, choiceById(id).id); } catch (_) { /* private mode */ }
}

// The params that go along with the call. Always a new object: the caller does
// Object.assign on the request body, and returning the same object would let a caller dirty the list.
export function paramsFor(id) {
  return Object.assign({}, choiceById(id).params);
}
