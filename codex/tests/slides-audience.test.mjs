// slides-audience.test.mjs — a vista de PLATEIA (present/audience.js) e o contrato da
// mensagem que a alimenta.
//
// Existe por três defeitos reais achados pela espia do track-27 (2026-07-26), todos da mesma
// família: o payload do broadcast era desenhado só para o APRESENTADOR, que desenha miniaturas,
// e por isso podia se dar ao luxo de omitir coisas que uma tela de plateia inteira precisa.
//
//   (a) `canvas` não viajava  -> um deck 4:3 renderizava na outra janela com o canvas 16:9 padrão.
//   (b) `transition` não viajava -> a troca de slide saía sem a transição do deck.
//   (c) `setPresenting` não emitia -> uma janela de plateia JÁ ABERTA (o caso normal: a sala é
//       aberta no começo da aula, o deck só depois) não sabia que a apresentação começou, e ficava
//       parada até a primeira navegação. O hello de mão única do apresentador não cobre esse caso,
//       porque o apresentador é aberto PELO editor e a plateia não.
//
// Os dois primeiros são asserções de comportamento (DOM-free, no estilo do slides-reorder-collision);
// os dois últimos travam a REGRA na fonte, que é o que impede a mensagem de voltar a emagrecer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initAudience } from '../content/slides/js/present/audience.js';

const SRC = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function stubApp(deck) {
  const posted = [];
  let onmessage = null;
  const calls = { fit: 0, renderSlide: 0 };
  const app = {
    root: { classList: { add() {}, toggle() {} } },
    stage: {},
    channel: {
      postMessage: (m) => posted.push(m),
      set onmessage(fn) { onmessage = fn; },
      get onmessage() { return onmessage; },
    },
    deck: () => deck,
    fit() { calls.fit++; },
    renderSlide() { calls.renderSlide++; },
  };
  return { app, posted, calls, send: (m) => onmessage({ data: m }) };
}

// A vista de plateia usa window.addEventListener para o resize; o node não tem window.
function withWindow(fn) {
  const had = 'window' in globalThis;
  const prev = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  try { return fn(); } finally { if (had) globalThis.window = prev; else delete globalThis.window; }
}

test('a plateia aplica canvas e transition vindos da mensagem', () => {
  withWindow(() => {
    const deck = { slides: [], canvas: { w: 1280, h: 720 }, transition: 'none' };
    const { app, send, calls } = stubApp(deck);
    initAudience(app);

    // sem `theme` de propósito: applyDeckTheme toca no document, que não existe aqui.
    send({
      type: 'state',
      index: 0, step: 0,
      deck: JSON.stringify([{ id: 's1', layout: 'cover', slots: {} }]),
      canvas: { w: 960, h: 720 },   // deck 4:3
      transition: 'push',
    });

    assert.deepEqual(deck.canvas, { w: 960, h: 720 },
      'o canvas do deck tem que vir da mensagem, senão um deck 4:3 renderiza como 16:9');
    assert.equal(deck.transition, 'push',
      'a transição do deck tem que vir da mensagem, senão a troca de slide sai sem efeito');
    assert.equal(calls.fit, 1);
    assert.equal(calls.renderSlide, 1);

    clearInterval(app._helloTimer);
  });
});

test('a plateia insiste no hello até receber estado, e para quando recebe', () => {
  withWindow(() => {
    const deck = { slides: [], canvas: { w: 1280, h: 720 } };
    const { app, posted, send } = stubApp(deck);
    initAudience(app);

    assert.deepEqual(posted, [{ type: 'hello' }],
      'o primeiro hello sai na hora');
    assert.ok(app._helloTimer,
      'e fica um timer insistindo: a janela de plateia é aberta ANTES do editor existir, ' +
      'então o hello de mão única do apresentador não serve aqui');

    send({ type: 'state', index: 0, step: 0, deck: JSON.stringify([{ id: 's1', layout: 'cover', slots: {} }]) });

    assert.equal(app._helloTimer, null,
      'chegou estado, para de perguntar');
  });
});

test('o payload do broadcast carrega canvas e transition', () => {
  const src = SRC('../content/slides/js/present/presenter.js');
  const body = src.slice(src.indexOf('function broadcast()'), src.indexOf('channel.onmessage'));
  for (const key of ['canvas:', 'transition:']) {
    assert.ok(body.includes(key),
      `broadcast() precisa emitir ${key} — sem ele a janela que recebe renderiza no canvas errado ` +
      'ou perde a transição do deck');
  }
});

test('setPresenting emite estado', () => {
  const src = SRC('../content/slides/js/app.js');
  const i = src.indexOf('setPresenting(on)');
  assert.ok(i > 0, 'setPresenting sumiu do app.js');
  const body = src.slice(i, src.indexOf('toggleBlank(mode)', i));
  assert.ok(/this\.broadcast\(\)/.test(body),
    'setPresenting tem que emitir: uma janela de plateia já aberta não tem outro jeito de saber ' +
    'que a apresentação começou');
});
