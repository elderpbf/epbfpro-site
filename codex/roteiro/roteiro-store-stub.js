// roteiro/roteiro-store-stub.js
// TEMPORARY dev-only persistence for the Roteiro sub-tab (track-46 fatia 1).
// THIS FILE IS SWAPPED OUT IN FATIA 2 for the real codex-api-backed store (base
// on the curso + promover). roteiro-view.js never imports this directly: cohorts.js
// wires it in as `ctx.store` when mounting the view, so the swap touches only the
// wiring in cohorts.js, never the view.
//
// Store interface (the seam roteiro-view.js consumes):
//   load(aulaId) -> the saved roteiro for that aula, or the SEED demo skeleton.
//   save(aulaId, roteiro) -> persists it (fire-and-forget from the view's side).
//
// Why a SEED and not an empty roteiro: fatia 1 has no structural CRUD (no add
// bloco/ponto yet — that is fatia 2). An empty store would render an empty,
// non-interactive shell, so the dev-only demo could not be seen or tested. The
// stub therefore hands back a real example (the VNC "Aula 2" roteiro) on first
// open so the two-panel UI is demoable; the moment the teacher edits, their saved
// version wins per aula. The real fatia-2 backend never seeds — it reads D1.
import { normalizeRoteiro } from '../js/roteiro-model.js';

const KEY_PREFIX = 'cdx_roteiro_stub_';

// The real VNC Aula 2 skeleton (order/time/short annotations only — never
// content). Faithful to roteiro-aula-2.md; times are the mockup estimates.
const SEED_DEMO = {
  blocos: [
    { nome: 'Resgate', pontos: [
      { n: 0, rotulo: 'Resgate da Aula 1', tipo: 'resgate', dur: 5,
        chamada: 'Vimos LLMs e tokens; faltam embeddings e janela de contexto.',
        notas: ['LLMs: modelos grandes de linguagem', 'Tokens: tudo é token, lê, responde e cobra', 'Ponte para embeddings e janela de contexto'] },
    ] },
    { nome: 'Engenharia de Prompt', pontos: [
      { n: 1, rotulo: 'Introduz engenharia de prompt', tipo: 'expositivo', dur: 5,
        chamada: 'Hoje a gente constrói juntos um prompt de revisão contratual.', notas: ['Anuncia o alvo: prompt de revisão contratual', 'Usa o contrato falso da Trilha'] },
      { n: 2, rotulo: 'Prática 1: prompt cru', tipo: 'pratica', dur: 10,
        chamada: 'Prompt simples, sem explicar nada. Deixa quebrarem a cabeça.', notas: ['Peça um prompt simples de revisão', 'Não explique nada', 'Rodem na LLM com o contrato de exemplo'] },
      { n: 3, rotulo: 'Vago x estruturado', tipo: 'expositivo', dur: 8, notas: ['Diferença entre prompt vago e estruturado', 'A estrutura vem de um framework'] },
      { n: 4, rotulo: 'Frameworks', tipo: 'expositivo', dur: 10, notas: ['O que é um framework', 'Por que organiza o raciocínio seu e do LLM'] },
    ] },
    { nome: 'Contexto', pontos: [
      { n: 5, rotulo: 'Embeddings', tipo: 'expositivo', dur: 15,
        chamada: 'O segredo do prompt é contexto: ativar o conhecimento certo.',
        notas: ['Mapa de significados: token vira vetor, distância é relação', 'Attention: todos os tokens avaliados juntos', 'mole / manga: sentido movido pelos vizinhos', 'Direções guardam analogias'] },
      { n: 6, rotulo: 'C, O, R', tipo: 'expositivo', dur: 12,
        notas: ['C: ativar o conhecimento certo', 'O: o que produzir, verbo no imperativo', 'R: limites de forma e o que não fazer'] },
      { n: 7, rotulo: 'Prática 2: reescrever com COR', tipo: 'pratica', dur: 12, notas: ['Reescrevem o prompt cru usando C, O e R', 'Rodam de novo com o mesmo contrato'] },
    ] },
    { nome: null, pausa: true, pontos: [
      { n: null, rotulo: 'Pausa', tipo: 'pausa', dur: 10, chamada: 'Água, banheiro, respira. Meio da aula.', notas: [] },
    ] },
    { nome: 'Estrutura', pontos: [
      { n: 8, rotulo: 'Observação e ligação para janela de contexto', tipo: 'expositivo', dur: 6,
        chamada: 'Vocês fixaram o que importa. Menos alucinação. Mas a estrutura muda toda vez.',
        notas: ['O modelo não traz qualquer coisa, você fixou o importante', 'Menos espaço de alucinação', 'Mas a estrutura muda toda vez, gancho para janela de contexto'] },
      { n: 9, rotulo: 'Janela de contexto', tipo: 'expositivo', dur: 15,
        notas: ['Tudo que o modelo consome de uma vez', 'Cada chat é uma janela nova, do zero', 'Conhecimento fixo (treino) x contextual (janela)', 'Comparação de modelos, 1M etc.'] },
      { n: 10, rotulo: 'Pulo do gato: formato explícito', tipo: 'expositivo', dur: 12,
        chamada: 'Formato de saída explícito mais base de conhecimento fixam a estrutura.', notas: ['Fixar o formato de saída (E)', 'Somar a base de conhecimento', 'Fecha a estrutura que mudava toda vez'] },
      { n: 11, rotulo: 'Prática 3: modelo de saída', tipo: 'pratica', dur: 12, notas: ['Definem o formato de saída do prompt', 'Rodam com o modelo fixado'] },
    ] },
    { nome: 'Fechamento', pontos: [
      { n: 12, rotulo: 'Fecho da construção', tipo: 'fechamento', dur: 6, notas: ['Recapitula o prompt construído', 'COR mais janela de contexto mais formato'] },
      { n: 13, rotulo: 'Fechamento', tipo: 'fechamento', dur: 5, notas: ['Amarra a aula', 'Gancho para a próxima'] },
    ] },
  ],
};

function _key(aulaId) {
  return KEY_PREFIX + String(aulaId);
}

export function load(aulaId) {
  let raw = null;
  try { raw = localStorage.getItem(_key(aulaId)); } catch (_) { raw = null; }
  // Nothing saved yet for this aula: hand back the demo seed (fresh normalized
  // copy, so the view mutating it in place never touches SEED_DEMO). Once the
  // teacher saves, the stored version wins.
  if (!raw) return normalizeRoteiro(SEED_DEMO);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) { return normalizeRoteiro(SEED_DEMO); }
  return normalizeRoteiro(parsed);
}

export function save(aulaId, roteiro) {
  const r = normalizeRoteiro(roteiro);
  try { localStorage.setItem(_key(aulaId), JSON.stringify(r)); } catch (_) { /* dev stub: best-effort only */ }
  return r;
}

// Exported for a potential "reset to demo" affordance; harmless in prod (the
// whole sub-tab is dev-only this fatia).
export { SEED_DEMO };
