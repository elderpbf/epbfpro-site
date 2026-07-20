// slides-t-shadow.test.mjs, num arquivo que importa o tradutor como `t`, o
// identificador `t` é RESERVADO: nada pode redeclarar.
//
// Existe por um bug que eu mesmo pus em produção (commit 11f1061, 2026-07-16, ao
// traduzir o tooltip do selo ⚠): o navigator.js fazia `const t = createElement("div")`
// dentro do forEach e chamava `t("slides.ed_reflow_warn")` NA MESMA closure. O `t`
// local sombreia o import pro escopo inteiro, então todo slide com `reflowWarn` virava
// "t is not a function" e MATAVA o render da régua inteira. Não é hipótese: a mesma
// classe já tinha mordido o `imgInner` do helpers.js (renomeado pra `tf`) horas antes.
//
// A regra é a CLASSE, não o caso: "importou `t`, não redeclara `t`". Um teste que
// tentasse decidir se o `t()` cai DENTRO do escopo sombreado precisaria de um parser;
// proibir a redeclaração é checável por regex e não tem falso-negativo caro (o preço é
// renomear uma variável local, que é o que a gente quer mesmo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SLIDES = fileURLToPath(new URL('../content/slides/js/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Os arquivos do núcleo que trazem o tradutor de fora.
function filesImportingT() {
  return walk(SLIDES).filter((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return /^import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*["'][^"']*i18n\.js["']/m.test(src);
  });
}

// Toda redeclaração de `t` num arquivo: declaração (const/let/var), parâmetro de arrow
// de um argumento, ou parâmetro numa lista. Retorna [{line, text}].
function rebindsOfT(src) {
  const PATTERNS = [
    /\b(?:const|let|var)\s+t\s*[=;,)]/,   // const t = ... / let t;
    /\(\s*t\s*\)\s*=>/,                     // (t) => ...
    /\(\s*t\s*,/,                           // function f(t, ...) / (t, i) => ...
    /,\s*t\s*\)\s*(?:=>|\{)/,               // (a, t) => ... / function f(a, t) {
    /\bfunction\s*\w*\s*\(\s*t\b/,          // function f(t...
  ];
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;          // comentário: o navigator explica o scar
    if (/^\s*import\b/.test(line)) return;           // o próprio import do t
    if (PATTERNS.some((re) => re.test(line))) out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

test('`t` nunca é redeclarado num arquivo que importa o tradutor', () => {
  const offenders = [];
  for (const f of filesImportingT()) {
    for (const hit of rebindsOfT(fs.readFileSync(f, 'utf8'))) {
      offenders.push(`${path.relative(SLIDES, f)}:${hit.line}  ${hit.text}`);
    }
  }
  assert.deepEqual(offenders, [],
    'Estes sombreiam o tradutor `t`. Renomeie a local (o navigator usa `th`, o helpers `tf`):\n' +
    offenders.join('\n'));
});

test('o teste enxerga o caso REAL que quebrou a produção', () => {
  // O snippet exato do commit 11f1061, pra este guard não virar um regex que passa em tudo.
  const bug = [
    'import { t } from "../../../../js/i18n.js";',
    'deck.slides.forEach((s, i) => {',
    '  const t = document.createElement("div");',
    '  t.innerHTML = (s.reflowWarn ? `<div title="${t("slides.ed_reflow_warn")}">⚠</div>` : "");',
    '});',
  ].join('\n');
  assert.equal(rebindsOfT(bug).length, 1, 'o `const t = createElement` tem de ser pego');
});

test('o navigator chama t() e não redeclara t', () => {
  const src = fs.readFileSync(path.join(SLIDES, 'edit/navigator.js'), 'utf8');
  assert.match(src, /t\("slides\.ed_reflow_warn"\)/, 'o tooltip do ⚠ segue traduzido');
  assert.equal(rebindsOfT(src).length, 0, 'nenhuma local chamada `t` no navigator');
});
