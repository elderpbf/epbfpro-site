// Guard: um símbolo de um MÓDULO COMPARTILHADO usado sem ser importado.
//
// Existe por um quase-erro real (Élder 2026-07-16). Num merge, uma sessão removeu o
// `import { glyphSvg }` do wall.js enquanto OUTRA adicionou um USO de glyphSvg (nos ICONS). Linhas
// diferentes, então o git não acusou conflito e mesclou calado, mas o módulo passou a CHAMAR
// glyphSvg sem importar. O teste passava na working tree (que eu já tinha consertado na mão) e o
// COMMIT ia quebrado. É o "conflito semântico": o texto não se sobrepõe, o sentido sim, e o git só
// enxerga texto. Este guard falha alto quando isso acontece, em qualquer merge, mesmo o "limpo".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODEX = fileURLToPath(new URL('..', import.meta.url)); // .../codex/
const GLYPHS = path.join(CODEX, 'js', 'glyphs.js');

// PURO. Tira comentários (bloco e linha) pra a busca por chamada não casar dentro deles.
// O `[^:]` antes de `//` evita comer o `//` de uma URL (http://...).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// PURO. Os nomes LOCAIS que os imports do arquivo trazem. `{ a, b as c }` -> {a, c};
// default e `* as ns` também. É o "have" contra o qual a chamada é checada.
function importedNames(src) {
  const names = new Set();
  const re = /import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s*([\w$]+))?\s*from/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) names.add(m[1]);
    if (m[3]) names.add(m[3]);
    if (m[2]) for (const part of m[2].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = p.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  return names;
}

// PURO. Nomes declarados no próprio arquivo, pra não acusar um helper que ele mesmo define.
function declaredNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/\b(?:function|const|let|var|class)\s+([\w$]+)/g)) names.add(m[1]);
  return names;
}

// PURO. O coração: dos `guarded`, quais são CHAMADOS (`nome(`) sem estar importados nem declarados.
// O lookbehind `(?<![.\w$])` exige que a chamada seja "solta" — descarta `g.glyphSvg(` (método de um
// objeto, que NÃO é o helper importado) e `xglyphSvg(`. Sem isso, um objeto com um método de mesmo
// nome vira falso positivo (foi o que app-card.js expôs: ele usa glyphs por um objeto `g`).
function unimportedHelpers(src, guarded) {
  const code = stripComments(src);
  const have = new Set([...importedNames(src), ...declaredNames(code)]);
  return guarded.filter((name) => new RegExp('(?<![.\\w$])' + name + '\\s*\\(').test(code) && !have.has(name));
}

// Os guardados: as FUNÇÕES exportadas por js/glyphs.js (glyphSvg e as irmãs). Derivado do arquivo
// pra não desatualizar: quem exportar uma função nova lá ganha o guard de graça. glyphSvg foi o que
// quebrou; as irmãs correm o mesmo risco (nome de chamada distinto, vindo de módulo compartilhado).
function guardedHelpers() {
  return [...fs.readFileSync(GLYPHS, 'utf8').matchAll(/export\s+function\s+([\w$]+)/g)].map((m) => m[1]);
}

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules') out.push(...sourceFiles(p)); }
    else if (e.name.endsWith('.js') && p !== GLYPHS) out.push(p);
  }
  return out;
}

// ── a lógica PEGA o bug (casos sintéticos: o guard só vale se falha quando deve) ──

test('acusa um helper chamado sem import', () => {
  assert.deepEqual(unimportedHelpers("const I = { a: glyphSvg('book') };", ['glyphSvg']), ['glyphSvg']);
});

test('passa quando o import está lá', () => {
  const src = "import { glyphSvg } from '../../js/glyphs.js';\nconst I = { a: glyphSvg('book') };";
  assert.deepEqual(unimportedHelpers(src, ['glyphSvg']), []);
});

test('não casa uma chamada que está dentro de comentário', () => {
  assert.deepEqual(unimportedHelpers("// glyphSvg('x') é só texto aqui\nconst y = 1;", ['glyphSvg']), []);
});

test('respeita alias: `glyphSvg as g` + `g(` não é chamada de glyphSvg', () => {
  const src = "import { glyphSvg as g } from '../../js/glyphs.js';\nconst z = g('book');";
  assert.deepEqual(unimportedHelpers(src, ['glyphSvg']), []);
});

test('cobre TODAS as funções exportadas, não só glyphSvg', () => {
  assert.deepEqual(unimportedHelpers("const h = iconHtml(x);", ['iconHtml']), ['iconHtml']);
});

// Chamada de MÉTODO num objeto (`g.glyphSvg(...)`) não é o helper importado: usar glyphs por um
// objeto é padrão legítimo (app-card.js faz isso). O guard não pode acusar isso.
test('não acusa chamada de método `obj.glyphSvg(`', () => {
  assert.deepEqual(unimportedHelpers("const s = g.glyphSvg(key);", ['glyphSvg']), []);
  assert.deepEqual(unimportedHelpers("if (g.hasGlyph(k)) {}", ['hasGlyph']), []);
});

// ── a árvore real está limpa (é o que rodaria em cada merge) ──

test('nenhum módulo do codex chama um helper de glyphs.js sem importar', () => {
  const guarded = guardedHelpers();
  assert.ok(guarded.includes('glyphSvg'), 'o guard cobre glyphSvg (o offensor original)');
  const offenders = [];
  for (const file of sourceFiles(CODEX)) {
    const miss = unimportedHelpers(fs.readFileSync(file, 'utf8'), guarded);
    if (miss.length) offenders.push(path.relative(CODEX, file) + ' -> ' + miss.join(', '));
  }
  assert.deepEqual(offenders, [], 'helper(s) usados sem import:\n' + offenders.join('\n'));
});
