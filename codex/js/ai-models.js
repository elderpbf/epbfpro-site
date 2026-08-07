// js/ai-models.js
// Qual IA atende a chamada. Élder 2026-08-07: "o botão da IA deve ter um dropdown para escolher
// a IA que será usada... seria difícil?".
//
// Não foi: o Worker JÁ aceita `provider` e `openrouter_model` em `ai_chat` (src/ai.js), e o
// facade repassa os parâmetros sem tocar. Então isto aqui é uma LISTA e uma preferência
// guardada, não integração nova. Nenhuma chave passa pelo navegador: o cliente diz QUEM deve
// atender, e as chaves continuam só no ambiente do Worker.
//
// Uma correção de fato, para não escolher errado a partir de memória: o padrão do OpenRouter
// NÃO é mais o Mistral. Foi trocado em 2026-07-20, por decisão registrada do próprio Élder, de
// `mistralai/mistral-small-24b` para `qwen/qwen3-30b-a3b-instruct-2507` (a justificativa e a
// ressalva estão em src/ai.js:297-307 do codex-api). O Mistral continua escolhível aqui.

// `provider` vazio = a CADEIA padrão do Worker: as duas chaves Gemini primeiro (uma cobre a
// falta da outra) e o OpenRouter como reserva paga. É o que sempre rodou, e continua sendo o
// padrão: quem não quer pensar não pensa.
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

// A escolha sobrevive ao fechamento da tela: trocar de modelo a cada item seria trabalho
// repetido, e o caso real é "hoje eu quero testar com outro".
export function getChoice() {
  let id = '';
  try { id = localStorage.getItem(STORE_KEY) || ''; } catch (_) { id = ''; }
  return choiceById(id);
}

export function setChoice(id) {
  try { localStorage.setItem(STORE_KEY, choiceById(id).id); } catch (_) { /* modo privado */ }
}

// Os parâmetros que vão junto na chamada. Sempre um objeto novo: quem chama faz
// Object.assign no corpo do pedido, e devolver o mesmo objeto deixaria um caller sujar a lista.
export function paramsFor(id) {
  return Object.assign({}, choiceById(id).params);
}
