// trilha-tab-glyphs.test.mjs — os ícones da barra de abas da Trilha vêm da biblioteca.
//
// Existe por uma regra do Élder (2026-07-16): o ícone vem do js/glyphs.js, sempre. Ele
// perguntou pelo balão de conversa e o achado foi que o `trilha/index.html` desenhava SEIS
// <svg> à mão na barra de abas do mobile, sendo QUATRO cópias byte-a-byte de desenho que a
// biblioteca já tinha (message-square, folder, grid, book), um re-encode do `checklist`
// (path x polyline, mesmos vértices) e um único mark que faltava lá (`lines`, registrado).
//
// Isto trava a CLASSE: uma aba nova não pode nascer com svg à mão, e nenhuma chave do mapa
// pode sumir da biblioteca sem alguém perceber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasGlyph } from '../js/glyphs.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));        // .../codex/
const SITE = path.join(ROOT, '..');                                 // repo root
const PAGE = path.join(ROOT, 'trilha', 'js', 'page.js');

// PURO: o mapa data-tab -> chave de glifo, lido do page.js (fonte única).
function tabGlyphMap() {
  const src = fs.readFileSync(PAGE, 'utf8');
  const m = /const TAB_GLYPH = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'TAB_GLYPH existe no page.js');
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map((x) => [x[1], x[2]]));
}

test('o HTML da Trilha não desenha ícone de aba à mão', () => {
  const html = fs.readFileSync(path.join(SITE, 'trilha', 'index.html'), 'utf8');
  assert.equal((html.match(/<svg/g) || []).length, 0,
    'trilha/index.html voltou a ter <svg> inline; o ícone vem do glyphSvg (ver TAB_GLYPH no page.js)');
});

test('toda chave do TAB_GLYPH existe na biblioteca', () => {
  const map = tabGlyphMap();
  assert.ok(Object.keys(map).length >= 6, 'as 6 abas estão mapeadas (achou ' + Object.keys(map).length + ')');
  const faltando = Object.entries(map).filter(([, key]) => !hasGlyph(key)).map(([tab, key]) => tab + ' -> ' + key);
  assert.deepEqual(faltando, [], 'aba(s) apontando pra chave que não existe no glyphs.js');
});

// Toda aba do HTML precisa estar no mapa, senão ela renderiza SEM ícone no mobile (falha muda:
// o desktop esconde o ícone, então passaria despercebido em qualquer teste de desktop).
test('toda aba do HTML tem entrada no TAB_GLYPH', () => {
  const html = fs.readFileSync(path.join(SITE, 'trilha', 'index.html'), 'utf8');
  // `[^"]*` no class: a aba ativa nasce com `class="cdx-tr-tab-btn active"` e um regex que exige
  // a aspa logo depois perde justamente ela (foi o que este teste pegou na 1ª rodada).
  const tabs = [...html.matchAll(/class="cdx-tr-tab-btn[^"]*"[^>]*data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 6, 'achou as abas no HTML (' + tabs.length + ')');
  const map = tabGlyphMap();
  assert.deepEqual(tabs.filter((tab) => !map[tab]), [], 'aba(s) do HTML sem glifo no mapa');
});

test('o page.js injeta pela biblioteca, com o CSS dono do tamanho', () => {
  const src = fs.readFileSync(PAGE, 'utf8');
  assert.match(src, /import \{ glyphSvg \} from '\.\.\/\.\.\/js\/glyphs\.js'/, 'importa a biblioteca');
  assert.match(src, /glyphSvg\(key, \{ size: null, cls: 'cdx-tr-tab-ico' \}\)/,
    'size:null (mobile.css é dono de width/height/stroke, até o stroke-width 1.9)');
});
