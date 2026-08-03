// The catalogue of a shipped-artifact type (Labs, Interativos) has exactly ONE home:
// its frontend registry. It used to have two — the Worker kept a hand-copied
// LAB_REGISTRY/INTERATIVO_REGISTRY — and the labs copy fell seven entries behind in
// silence (k5, k6, k18-k22 live on the site, absent from Liberações, every test green).
//
// So this file is the LEDGER for the seam that replaced it: every caller reaches
// js/registry-sync.js, nobody hand-builds the payload, and the seed never leaks the
// client-only overlays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CONSUMERS = [
  ['content/releases.js', 'o compositor de Liberações'],
  ['content/labs.js',     'Conteúdo > Labs'],
];

for (const [rel, label] of CONSUMERS) {
  test(`${label} (${rel}) sincroniza pelo seam, não pela fachada crua`, () => {
    const src = read('../' + rel);
    assert.match(src, /from\s+['"][^'"]*registry-sync\.js['"]/, 'imports js/registry-sync.js');
    // The facade calls still EXIST (registry-sync makes them); what must not come back is a
    // consumer calling them directly, which is where a second payload shape would be born.
    assert.ok(!/\w+\.ensureLabItems\(/.test(src), 'não chama ensureLabItems direto na fachada');
    assert.ok(!/\w+\.ensureInterativoItems\(/.test(src), 'não chama ensureInterativoItems direto');
  });
}

test('só o seam monta o payload do catálogo', () => {
  // Anyone else building { labs: [...] } by hand is a second catalogue in the making.
  const sync = read('../js/registry-sync.js');
  assert.match(sync, /ensureLabItems\(\{\s*labs:/, 'o seam monta o payload de labs');
  assert.match(sync, /ensureInterativoItems\(\{\s*interativos:/, 'e o de interativos');
  for (const [rel] of CONSUMERS) {
    assert.ok(!/\{\s*labs:\s*/.test(read('../' + rel)), 'nenhum consumidor monta { labs: ... }');
  }
});

test('a fachada repassa o payload em vez de mandar {} fixo', () => {
  const src = read('../js/codex-api.js');
  // `() => call('ct_ensure_lab_items', {})` era o que obrigava o Worker a ter a lista.
  assert.ok(!/ensureLabItems:\s*\(\)\s*=>/.test(src), 'ensureLabItems aceita parâmetro');
  assert.ok(!/ensureInterativoItems:\s*\(\)\s*=>/.test(src), 'ensureInterativoItems aceita parâmetro');
});

test('a semente carrega chave/título/resumo e nada dos overlays locais', async () => {
  // Sem comentários: o próprio arquivo NOMEIA os acessores proibidos ao explicar por que
  // não os usa, então checar o texto cru acusaria a explicação.
  const sync = read('../js/registry-sync.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // orderedLabs()/getAllItems() aplicam ordem, arquivamento e o rename local do admin.
  // Semear com eles publicaria o rename de UM navegador como título de todo mundo.
  assert.ok(!/orderedLabs|getAllItems|archivedLabs/.test(sync), 'semeia do registro cru');
  assert.match(sync, /LABS/, 'lê a constante do registro de labs');
  assert.match(sync, /INTERATIVOS/, 'e a do registro de interativos');

  const { LABS } = await import('../js/labs-registry.js');
  const { INTERATIVOS } = await import('../js/interativos-registry.js');
  for (const entry of [...LABS, ...INTERATIVOS]) {
    assert.match(entry.key, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, `chave ${entry.key} passa na validação do Worker`);
    assert.ok(entry.title && entry.title.length <= 200, `título de ${entry.key} dentro do limite`);
  }
});

test('os 7 labs que faltavam estão no registro que vai no payload', async () => {
  const { LABS } = await import('../js/labs-registry.js');
  const keys = LABS.map((l) => l.key);
  for (const k of ['k5', 'k6', 'k18', 'k19', 'k20', 'k21', 'k22']) {
    assert.ok(keys.includes(k), `${k} está no catálogo enviado`);
  }
});
