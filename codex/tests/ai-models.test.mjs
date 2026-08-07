// codex/tests/ai-models.test.mjs
// A lista de IAs escolhiveis (js/ai-models.js) e o que ela manda para o Worker.
//
// O que estes testes protegem: os nomes de parametro. `provider` e `openrouter_model` sao o
// contrato de src/ai.js do codex-api; errar um deles nao quebra nada visivelmente, so faz a
// escolha ser IGNORADA em silencio e tudo continuar atendido pelo padrao.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_CHOICES, choiceById, paramsFor } from '../js/ai-models.js';

test('o padrao e a CADEIA do Worker: nenhum provider fixado', () => {
  assert.equal(AI_CHOICES[0].id, 'auto');
  assert.deepEqual(paramsFor('auto'), {}, 'sem provider = Gemini, Gemini2, depois OpenRouter');
  assert.deepEqual(paramsFor('nao-existe'), {}, 'id desconhecido cai no padrao, nao quebra');
});

test('os nomes de parametro sao os que o Worker le', () => {
  assert.deepEqual(paramsFor('gemini'), { provider: 'gemini' });
  const q = paramsFor('qwen');
  assert.equal(q.provider, 'openrouter', 'modelo do OpenRouter exige o provider openrouter');
  assert.equal(q.openrouter_model, 'qwen/qwen3-30b-a3b-instruct-2507');
});

test('todo item do OpenRouter traz modelo, e nenhum outro traz', () => {
  for (const c of AI_CHOICES) {
    if (c.params.provider === 'openrouter') {
      assert.ok(c.params.openrouter_model, c.id + ' precisa dizer qual modelo');
      assert.match(c.params.openrouter_model, /\//, c.id + ': modelo do OpenRouter e vendor/modelo');
    } else {
      assert.ok(!c.params.openrouter_model, c.id + ' nao deveria mandar modelo do OpenRouter');
    }
  }
});

// Nenhuma chave pode passar pelo navegador: o cliente diz QUEM atende, nunca COM QUE chave.
test('a lista nao carrega chave nenhuma', () => {
  const blob = JSON.stringify(AI_CHOICES);
  assert.ok(!/api[_-]?key|sk-|AIza/i.test(blob));
});

test('paramsFor devolve copia, para um caller nao sujar a lista', () => {
  const a = paramsFor('qwen');
  a.provider = 'mexido';
  assert.equal(choiceById('qwen').params.provider, 'openrouter');
});

// O padrao do OpenRouter deixou de ser o Mistral em 20/07/2026 (decisao registrada do Elder em
// src/ai.js do codex-api). Ele lembrava ao contrario ao pedir esta tela; a lista precisa
// refletir o que o Worker faz, nao a memoria de qualquer um de nos dois.
test('o Mistral esta na lista, mas nao e o padrao', () => {
  assert.ok(AI_CHOICES.some((c) => c.id === 'mistral'), 'continua escolhivel');
  assert.notEqual(choiceById('').id, 'mistral');
});
