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
import { ARTIFACTS, RASTER_ARTIFACTS, UNBUILT_VARIANTS, SITE_SVG_ROOTS, emit } from '../tools/brand-manifest.js';
import { BRAND_FONT_CSS } from '../js/brand-font.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(SITE_ROOT, p), 'utf8').replace(/\r\n/g, '\n').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const inTree = t => t.repo === 'site';
const alvos = () => ARTIFACTS.flatMap(a => a.targets.filter(inTree).map(t => ({ ...t, artefato: a })));

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

test('todo alvo declarado existe em disco', () => {
  const faltando = alvos().filter(t => !fs.existsSync(path.join(SITE_ROOT, t.path))).map(t => t.path);
  assert.deepEqual(faltando, [], 'o manifesto aponta para arquivo que não existe');
});

test('nenhum .svg de marca em árvore fica fora do manifesto (sem cópia órfã)', () => {
  const declarados = new Set(alvos().map(t => t.path));
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
    const ts = a.targets.filter(inTree);
    if (ts.length < 2) continue;
    const ref = hash(read(ts[0].path));
    for (const t of ts.slice(1)) {
      const h = hash(read(t.path));
      if (h !== ref) divergentes.push(`${t.path} [${h}] != ${ts[0].path} [${ref}]  (${a.variant}/${a.bg})`);
    }
  }
  assert.deepEqual(divergentes, [], 'alvos da mesma variante com bytes diferentes');
});

test('SINCRONIA: cada arquivo em disco é byte a byte a saída do gerador', () => {
  const fora = alvos()
    .filter(t => read(t.path) !== emit(t.artefato).trim())
    .map(t => {
      const deltas = explicar(emit(t.artefato), read(t.path));
      return `${t.path}  <- ${deltas ? deltas.join(' + ') : 'DERIVA NÃO EXPLICADA'}`;
    });
  assert.deepEqual(fora, [],
    'arquivo de marca fora de sincronia com o gerador:\n  ' + fora.join('\n  '));
});

test('a divergência é SÓ o que já está nomeado, nada novo entrou', () => {
  // Guarda de deriva enquanto o track está aberto: o teste acima fica vermelho de
  // propósito, este fica VERDE - e vira vermelho no dia em que uma divergência NOVA
  // aparecer. É o que impede o vermelho conhecido de virar ruído que esconde.
  const novos = alvos().filter(t => explicar(emit(t.artefato), read(t.path)) === null).map(t => t.path);
  assert.deepEqual(novos, [],
    'divergência ALÉM das nomeadas em DELTAS (alguém editou um .svg à mão):\n  ' + novos.join('\n  '));
});

test('cobertura: o que o manifesto ainda NÃO alcança está contado, não escondido', () => {
  // Rule 7, fail loud: um teste que só olha o que já cobre mede a própria sombra.
  // UNBUILT_VARIANTS pode legitimamente ser zero (foi pra zero no 4.b), então aqui não
  // se exige que haja buraco, se exige que o buraco seja CONTADO. O que não pode é a
  // lista sumir do manifesto e o relatório continuar parecendo completo.
  const foraDaArvore = ARTIFACTS.flatMap(a => a.targets).filter(t => !inTree(t));
  assert.ok(Array.isArray(UNBUILT_VARIANTS), 'UNBUILT_VARIANTS sumiu do manifesto');
  assert.ok(foraDaArvore.length > 0, 'alvos em backstage/Brand sumiram do manifesto');
  assert.ok(RASTER_ARTIFACTS.length > 0, 'os PNGs sumiram do manifesto');

  const porDelta = {};
  for (const t of alvos()) {
    const d = explicar(emit(t.artefato), read(t.path));
    const k = d === null ? 'DERIVA NÃO EXPLICADA' : (d.length ? d.join(' + ') : 'em sincronia');
    (porDelta[k] ||= []).push(t.path);
  }
  console.log(
    `\n  [track-47 | estado da marca]\n` +
    Object.entries(porDelta).map(([k, v]) => `    ${String(v.length).padStart(2)}x ${k}`).join('\n') +
    `\n\n  [track-47 | o que este teste NÃO alcança]\n` +
    `    ${String(foraDaArvore.length).padStart(2)}x alvo em backstage/Brand (outro repo, só declarado)\n` +
    `    ${String(UNBUILT_VARIANTS.length).padStart(2)}x variante sem builder no gerador` +
      (UNBUILT_VARIANTS.length ? `: ${UNBUILT_VARIANTS.join(', ')}\n` : '  (todas cobertas desde o 4.b)\n') +
    `    ${String(RASTER_ARTIFACTS.length).padStart(2)}x PNG declarado, ainda sem emissor\n`);
});
