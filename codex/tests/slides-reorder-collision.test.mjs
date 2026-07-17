// slides-reorder-collision.test.mjs — guarda contra o subsistema de grips ROUBAR o
// nome de um verbo do controller.
//
// Existe por um bug REAL de produção (Élder 2026-07-16: "não consigo reordenar slides;
// nem as setas nem arrastar funcionam"). O controller do app.js expõe reorder(from, to),
// o deck op que move um SLIDE: a seta ↑↓ do navigator chama app.move(i, d), que chama
// this.reorder(i, j), e o drop do thumbnail chama app.reorder(dragI, i) direto. O commit
// 81715ae (drag de cards/topics) publicou o subsistema novo como `app.reorder = {afterRender}`,
// SOBRESCREVENDO o método. Os dois caminhos passaram a chamar um objeto como função e
// morreram juntos, calados, porque nenhum teste cobria o reorder de slide.
//
// DOM-free no estilo do slides-select: initReorder só precisa de app.stage.addEventListener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initReorder } from '../content/slides/js/select/reorder.js';

function stubStage() {
  return { addEventListener() {}, querySelectorAll: () => [] };
}

test('initReorder não sobrescreve o reorder(from,to) do controller', () => {
  const moved = [];
  const app = {
    stage: stubStage(),
    reorder: (from, to) => moved.push([from, to]), // o deck op, como o app.js o define
  };

  initReorder(app);

  assert.equal(typeof app.reorder, 'function',
    'app.reorder tem que continuar sendo o deck op; virou objeto = setas e drag do navigator morrem');
  app.reorder(0, 2);
  assert.deepEqual(moved, [[0, 2]], 'e tem que continuar sendo O MESMO deck op, não um homônimo');
});

test('o subsistema de grips se publica num nome próprio', () => {
  const app = { stage: stubStage() };
  initReorder(app);
  assert.equal(typeof app.gripReorder, 'object', 'grips publicados em app.gripReorder');
  assert.equal(typeof app.gripReorder.afterRender, 'function', 'com o afterRender que o app.js chama');
});

// O outro lado da colisão: o app.js tem que CHAMAR o nome novo. Sem isto, renomear só
// o reorder.js deixaria os grips de card/topic sem injeção nenhuma (o bug espelhado).
test('o app.js chama gripReorder.afterRender, não reorder.afterRender', async () => {
  const fs = await import('node:fs');
  const url = new URL('../content/slides/js/app.js', import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  assert.match(src, /this\.gripReorder\.afterRender\(\)/, 'app.js injeta os grips pelo nome novo');
  assert.doesNotMatch(src, /this\.reorder\.afterRender\(\)/, 'e não pelo nome que colidia');
});
