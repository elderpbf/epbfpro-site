// Peça 3 do track-47: o teste que quebra quando um artefato de marca sai de sincronia.
//
// Regenera cada linha do tools/brand-manifest.js em memória e compara BYTE A BYTE com o
// arquivo em disco. Sem ele, "não edite .svg à mão" é combinado, e foi o combinado sem
// verificação que produziu a divergência do pontinho: alguém consertou o traçado no
// gerador e nunca reexportou os arquivos, e ninguém viu por meses porque o defeito é
// latente (renderiza igual em Blink e WebKit).
//
// Este arquivo é deliberadamente VERMELHO enquanto houver divergência aberta. As duas
// de hoje estão nomeadas em DELTAS. Nunca imprime SVG inteiro numa falha: um assert que
// despeja 20 KB é um assert que ninguém lê.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS, RASTER_ARTIFACTS, UNBUILT_VARIANTS, SITE_SVG_ROOTS, TWIN, repoRoot, repoReachable, emit } from '../tools/brand-manifest.js';
import { emitTwin } from '../tools/brand-twin.js';
import { BRAND_FONT_CSS } from '../js/brand-font.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const caminho = t => path.join(repoRoot(t.repo), t.path);
const read = t => fs.readFileSync(caminho(t), 'utf8').replace(/\r\n/g, '\n').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const rot = t => `${t.repo}:${t.path}`;
const inTree = t => t.repo === 'site';

// Alvos que este teste consegue de fato abrir nesta máquina. Um repo cuja raiz não
// resolve é PULADO E CONTADO (ver o teste de cobertura), nunca somem em silêncio.
const alcancavel = t => repoReachable(t.repo) && fs.existsSync(caminho(t));
const todos = () => ARTIFACTS.flatMap(a => a.targets.map(t => ({ ...t, artefato: a })));
const alvos = () => todos().filter(alcancavel);

// As divergências conhecidas, cada uma como uma transformação que leva a saída do
// gerador ao que está no disco. Um arquivo é EXPLICADO se alguma combinação delas o
// reproduz exatamente. Qualquer sobra é deriva nova, e é isso que este teste caça.
const DELTAS = {
  // Decisão pendente do Élder (track-47). O gerador fecha o anel do pontinho com
  // `...215 90z`, os arquivos exportados com `...215 90 320 37z`: 18 números (3 cúbicas
  // fechadas) contra 20, e os 2 sobrando não formam curva. O do gerador é o bem-formado.
  'dotEdge-dos-exports': svg => svg.replace(
    'm271 -351 c133 -67 8 -150 -29 -202 -166 -232 -188 -41 -356 201 -225 326 79 74 215 90z',
    'm271 -351 c133 -67 8 -150 -29 -202 -166 -232 -188 -41 -356 201 -225 326 79 74 215 90 320 37z'),

  // NÃO é decisão, é bug: estes arquivos ficaram na versão anterior ao conserto da fonte
  // (KD 2026-07-20, a fonte viaja DENTRO do SVG). O conserto alcançou Codex/Labs/Trilha/
  // Interativos e NÃO alcançou images/brand/, que é o que a landing do pensoia.com e as
  // páginas legais servem. Some quando os arquivos forem regerados.
  'sem-a-fonte-embutida': svg => svg
    .replace(BRAND_FONT_CSS, '')
    .replace(/<style>\/\*[\s\S]*?\*\//, '<style>')
};

// Toda combinação de deltas, da vazia à completa.
function* combinacoes(chaves) {
  for (let m = 0; m < (1 << chaves.length); m++)
    yield chaves.filter((_, i) => m & (1 << i));
}

// Quais deltas conhecidos explicam este arquivo? null = nenhum, ou seja deriva NOVA.
function explicar(esperado, disco) {
  for (const combo of combinacoes(Object.keys(DELTAS))) {
    const s = combo.reduce((acc, k) => DELTAS[k](acc), esperado).trim();
    if (s === disco) return combo;
  }
  return null;
}

test('todo alvo declarado existe em disco (nos repos alcançáveis)', () => {
  const faltando = todos().filter(t => repoReachable(t.repo) && !fs.existsSync(caminho(t))).map(rot);
  assert.deepEqual(faltando, [], 'o manifesto aponta para arquivo que não existe');
});

test('nenhum .svg de marca em árvore fica fora do manifesto (sem cópia órfã)', () => {
  const declarados = new Set(todos().filter(inTree).map(t => t.path));
  const emDisco = SITE_SVG_ROOTS.flatMap(dir =>
    fs.readdirSync(path.join(SITE_ROOT, dir)).filter(f => f.endsWith('.svg')).map(f => `${dir}/${f}`));
  assert.deepEqual(emDisco.filter(p => !declarados.has(p)), [],
    'arquivo de marca sem linha no manifesto = cópia mantida à mão');
});

test('dois alvos da mesma variante são o mesmo arquivo', () => {
  // logo-dark.svg e glyph-wordmark_bg.navy.svg são papéis do MESMO desenho. Se um dia
  // divergirem, é porque alguém editou um dos dois achando que era só daquele lugar.
  const divergentes = [];
  for (const a of ARTIFACTS) {
    const ts = a.targets.filter(alcancavel);
    if (ts.length < 2) continue;
    const ref = hash(read(ts[0]));
    for (const t of ts.slice(1)) {
      const h = hash(read(t));
      if (h !== ref) divergentes.push(`${rot(t)} [${h}] != ${rot(ts[0])} [${ref}]  (${a.variant}/${a.bg})`);
    }
  }
  assert.deepEqual(divergentes, [], 'alvos da mesma variante com bytes diferentes');
});

test('SINCRONIA: cada arquivo em disco é byte a byte a saída do gerador', () => {
  const fora = alvos()
    .filter(t => read(t) !== emit(t.artefato).trim())
    .map(t => {
      const deltas = explicar(emit(t.artefato), read(t));
      return `${rot(t)}  <- ${deltas ? deltas.join(' + ') : 'DERIVA NÃO EXPLICADA'}`;
    });
  assert.deepEqual(fora, [],
    'arquivo de marca fora de sincronia com o gerador:\n  ' + fora.join('\n  '));
});

test('a divergência é SÓ o que já está nomeado, nada novo entrou', () => {
  // Guarda de deriva enquanto o track está aberto: o teste acima fica vermelho de
  // propósito, este fica VERDE - e vira vermelho no dia em que uma divergência NOVA
  // aparecer. É o que impede o vermelho conhecido de virar ruído que esconde.
  const novos = alvos().filter(t => explicar(emit(t.artefato), read(t)) === null).map(rot);
  assert.deepEqual(novos, [],
    'divergência ALÉM das nomeadas em DELTAS (alguém editou um .svg à mão):\n  ' + novos.join('\n  '));
});

test('cobertura: o que o manifesto ainda NÃO alcança está contado, não escondido', () => {
  // Rule 7, fail loud: um teste que só olha o que já cobre mede a própria sombra.
  // UNBUILT_VARIANTS pode legitimamente ser zero (foi pra zero no 4.b), então aqui não
  // se exige que haja buraco, se exige que o buraco seja CONTADO. O que não pode é a
  // lista sumir do manifesto e o relatório continuar parecendo completo.
  const foraDaArvore = todos().filter(t => !inTree(t));
  const inalcancaveis = todos().filter(t => !alcancavel(t));
  assert.ok(Array.isArray(UNBUILT_VARIANTS), 'UNBUILT_VARIANTS sumiu do manifesto');
  assert.ok(foraDaArvore.length > 0, 'alvos em backstage/Brand sumiram do manifesto');
  assert.ok(RASTER_ARTIFACTS.length > 0, 'os PNGs sumiram do manifesto');

  const porDelta = {};
  for (const t of alvos()) {
    const d = explicar(emit(t.artefato), read(t));
    const k = d === null ? 'DERIVA NÃO EXPLICADA' : (d.length ? d.join(' + ') : 'em sincronia');
    (porDelta[k] ||= []).push(rot(t));
  }
  console.log(
    `\n  [track-47 | estado da marca]\n` +
    Object.entries(porDelta).map(([k, v]) => `    ${String(v.length).padStart(2)}x ${k}`).join('\n') +
    `\n\n  [track-47 | alcance]\n` +
    `    ${String(todos().length).padStart(2)}x alvo declarado, dos quais ${alvos().length} abertos e conferidos\n` +
    `    ${String(foraDaArvore.length).padStart(2)}x fora deste repo (backstage + Brand)\n` +
    `    ${String(inalcancaveis.length).padStart(2)}x NÃO conferido nesta máquina` +
      (inalcancaveis.length ? `:\n${[...new Set(inalcancaveis.map(t => t.repo))].map(r => `         repo "${r}" -> ${repoRoot(r) || 'raiz não configurada'}`).join('\n')}\n` : '  (todos os repos resolveram)\n') +
    `    ${String(UNBUILT_VARIANTS.length).padStart(2)}x variante sem builder no gerador` +
      (UNBUILT_VARIANTS.length ? `: ${UNBUILT_VARIANTS.join(', ')}\n` : '  (todas cobertas desde o 4.b)\n') +
    `    ${String(RASTER_ARTIFACTS.length).padStart(2)}x PNG declarado, ainda sem emissor\n`);
});

test('o gêmeo do backstage é SAÍDA deste gerador, não um segundo gerador', () => {
  // O coração do track-47: `backstage/js/brand-logos.js` era a segunda cópia do artwork,
  // e é onde a divergência do pontinho nasceu. Agora ele é derivado. Se alguém editar lá,
  // isto fica vermelho no mesmo dia.
  if (!repoReachable(TWIN.repo)) {
    console.log(`\n  [track-47] paridade do gêmeo NÃO conferida: repo "${TWIN.repo}" -> ${repoRoot(TWIN.repo) || 'raiz não configurada'}\n`);
    return; // pulado E anunciado; nunca em silêncio
  }
  assert.ok(fs.existsSync(caminho(TWIN)), `${rot(TWIN)} não existe`);
  const disco = fs.readFileSync(caminho(TWIN), 'utf8').replace(/\r\n/g, '\n');
  const esperado = emitTwin();
  assert.equal(hash(disco), hash(esperado),
    `${rot(TWIN)} divergiu do gerador (disco ${disco.length}B, gerado ${esperado.length}B). ` +
    `Não edite o gêmeo: edite codex/js/brand-logos.js e rode tools/brand-build.mjs.`);
});

test('a transformação para script clássico não deixa sintaxe de módulo para trás', () => {
  // Um `export` sobrando faz o backstage inteiro morrer com SyntaxError no load, porque
  // lá o arquivo entra como script clássico. Barato de checar, caro de descobrir em prod.
  const twin = emitTwin();
  assert.ok(!/^\s*export\s/m.test(twin), 'sobrou "export" no gêmeo');
  assert.ok(!/^\s*import\s/m.test(twin), 'sobrou "import" no gêmeo');
  assert.match(twin, /^\/\/ GERADO — NÃO EDITE ESTE ARQUIVO\./, 'o aviso de arquivo gerado abre o arquivo');
  // E as funções que as páginas do backstage chamam como globais continuam declaradas.
  for (const g of ['stdColors', 'mark', 'fontWordmark', 'glyphWordmark', 'glyphWordmarkTag', 'embedSvg'])
    assert.ok(twin.includes(`\nfunction ${g}(`), `o global ${g}() sumiu do gêmeo`);
});
