// slides-shared.test.mjs, slides compartilhados (track-35 C): o slide que vive em
// vários decks e, editado num, muda em todos.
//
// O que estes testes protegem é UMA inversão. O modo de falhar deste desenho não é
// "não propaga" (isso o Élder vê na hora), é o CONTRÁRIO: o conteúdo hidratado ser
// gravado de volta DENTRO do deck. Aí todo vínculo vira cópia destacada em silêncio,
// o deck continua abrindo igual, e um smoke test ingênuo passa. Por isso o eixo dos
// testes é o par hydrate/dehydrate, não a UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSharedSlides, sharedContent, isRef, isLinked } from '../content/slides/adapters/sharedSlides.js';
import { createLibrary } from '../content/slides/adapters/library.js';

// O núcleo (app.js) monta com DOM, então a costura app->adapter é lida da FONTE. É o
// idioma dos outros contract tests do repo (modules.test.mjs, slides-i18n-menus).
const APP_SRC = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/app.js', import.meta.url)), 'utf8');
const methodOf = (name) => {
  let i = APP_SRC.indexOf(`    ${name}(`);
  if (i < 0) i = APP_SRC.indexOf(`    async ${name}(`); // shareCurrentSlide é async
  assert.ok(i > 0, `${name} existe no app.js`);
  const end = APP_SRC.indexOf('\n    },', i);
  assert.ok(end > i, `${name} termina no fecho de método esperado`);
  return APP_SRC.slice(i, end);
};

// Uma biblioteca de mentira com a superfície que o sharedSlides usa. `writes` conta as
// idas ao servidor, que é o que o dirty-check promete economizar.
function fakeLibrary(templates = []) {
  const store = new Map(templates.map((t) => [t.id, t]));
  const lib = {
    writes: 0,
    async list() { return [...store.values()].map((t) => ({ id: t.id, name: t.name || '', layout: t.slide.layout, slide: t.slide })); },
    async updateMany(entries) {
      lib.writes++;
      for (const e of entries) {
        const cur = store.get(e.id);
        if (!cur) continue; // igual ao adapter real: id sumido não ressuscita
        store.set(e.id, { ...cur, slide: { ...e.slide, id: e.id, name: cur.name } });
      }
      return entries;
    },
    _peek: (id) => store.get(id),
  };
  return lib;
}

const tpl = (id, text) => ({ id, name: 'Abertura', slide: { id, name: 'Abertura', layout: 'statement', slots: { text }, notes: 'n' } });
const deckWith = (slides) => ({ id: 'd1', slides, canvas: { w: 1280, h: 720 } });

test('hydrate resolve o stub {id, ref} no conteúdo da biblioteca, mantendo o ref', async () => {
  const lib = fakeLibrary([tpl('L1', 'do jurista')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'inline', layout: 'cover', slots: {} }, { id: 's2', ref: 'L1' }]);

  await shared.hydrate(deck);

  assert.equal(deck.slides[0].layout, 'cover', 'o slide inline não é tocado');
  const linked = deck.slides[1];
  assert.equal(linked.id, 's2', 'o id local do deck é preservado');
  assert.equal(linked.ref, 'L1', 'o ref SOBREVIVE à hidratação (senão o save vira cópia)');
  assert.equal(linked.slots.text, 'do jurista', 'o conteúdo veio da biblioteca');
  assert.equal(linked.name, undefined, '`name` é metadado de biblioteca, não campo de slide');
});

test('dehydrate volta o slide vinculado pra {id, ref} e não toca o deck em memória', async () => {
  const lib = fakeLibrary([tpl('L1', 'original')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  const out = await shared.dehydrate(deck);

  assert.deepEqual(out.slides[0], { id: 's1', ref: 'L1' }, 'em disco fica SÓ o vínculo');
  assert.equal(deck.slides[0].slots.text, 'original', 'o deck que o editor renderiza continua hidratado');
});

test('editar um slide vinculado grava na biblioteca (é isto que faz mudar nos outros decks)', async () => {
  const lib = fakeLibrary([tpl('L1', 'antes')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  deck.slides[0].slots.text = 'depois';       // o editor mexe no slide hidratado
  await shared.dehydrate(deck);                // o autosave passa por aqui

  assert.equal(lib._peek('L1').slide.slots.text, 'depois', 'a biblioteca recebeu a edição');
  assert.equal(lib._peek('L1').name, 'Abertura', 'o nome da entrada não se perde na gravação');

  // E o outro deck vê: hidratar um deck NOVO com o mesmo ref traz o texto novo.
  const outro = deckWith([{ id: 'x9', ref: 'L1' }]);
  await createSharedSlides({ library: lib }).hydrate(outro);
  assert.equal(outro.slides[0].slots.text, 'depois', 'o 2º deck reflete a edição do 1º');
});

test('COPIAR não é vincular: um slide sem ref nunca chega na biblioteca', async () => {
  const lib = fakeLibrary([tpl('L1', 'da biblioteca')]);
  const shared = createSharedSlides({ library: lib });
  // O que app.insertTemplate produz: clone do conteúdo, id fresco, SEM ref.
  const deck = deckWith([{ id: 'copia', layout: 'statement', slots: { text: 'da biblioteca' } }]);

  deck.slides[0].slots.text = 'editado só aqui';
  const out = await shared.dehydrate(deck);

  assert.equal(lib.writes, 0, 'nenhuma gravação: a cópia é destacada');
  assert.equal(lib._peek('L1').slide.slots.text, 'da biblioteca', 'a biblioteca não mudou');
  assert.equal(out.slides[0].slots.text, 'editado só aqui', 'a cópia persiste inteira no deck');
});

test('o autosave só grava na biblioteca o que MUDOU', async () => {
  const lib = fakeLibrary([tpl('L1', 'a'), tpl('L2', 'b')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }, { id: 's2', ref: 'L2' }, { id: 's3', layout: 'cover', slots: {} }]);
  await shared.hydrate(deck);

  await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'salvar sem editar nada não escreve na biblioteca');

  deck.slides[2].slots.title = 'mexi no slide INLINE'; // não é vinculado
  await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'editar um slide comum não arrasta a biblioteca junto');

  deck.slides[0].slots.text = 'a2';
  await shared.dehydrate(deck);
  assert.equal(lib.writes, 1, 'uma edição real grava');
  assert.equal(lib._peek('L2').slide.slots.text, 'b', 'o vinculado que não mudou fica intacto');

  await shared.dehydrate(deck);
  assert.equal(lib.writes, 1, 'salvar de novo sem editar não regrava');
});

test('ref quebrado degrada visível, mantém o vínculo e NUNCA publica o aviso na biblioteca', async () => {
  const lib = fakeLibrary([tpl('L1', 'viva')]);
  const shared = createSharedSlides({ library: lib, message: 'Slide compartilhado não encontrado' });
  const deck = deckWith([{ id: 's1', ref: 'SUMIU' }]);

  await shared.hydrate(deck);
  const s = deck.slides[0];
  assert.equal(s._broken, true, 'o slide se declara quebrado (a régua badgeia por isto)');
  assert.equal(s.slots.text, 'Slide compartilhado não encontrado', 'a plateia/editor vê o motivo');
  assert.equal(s.ref, 'SUMIU', 'o ref NÃO é jogado fora: o vínculo ainda pode ser consertado');

  const out = await shared.dehydrate(deck);
  assert.equal(lib.writes, 0, 'o placeholder não vira conteúdo de biblioteca');
  assert.deepEqual(out.slides[0], { id: 's1', ref: 'SUMIU' }, 'em disco continua o mesmo vínculo');
});

test('biblioteca fora do ar: o deck ABRE, o vínculo degrada, e a falha vai pra pílula', async () => {
  const logged = [];
  globalThis.window = { bsLog: (m, lvl) => logged.push([m, lvl]) }; // pílula de debug (regra do CLAUDE.md)
  try {
    const lib = { async list() { throw new Error('worker 500'); }, async updateMany() { throw new Error('nope'); } };
    const shared = createSharedSlides({ library: lib, message: 'não encontrado' });
    const deck = deckWith([{ id: 's1', ref: 'L1' }, { id: 's2', layout: 'cover', slots: {} }]);

    await shared.hydrate(deck); // não pode rejeitar
    assert.equal(deck.slides[0]._broken, true);
    assert.equal(deck.slides[1].layout, 'cover', 'o resto do deck abre normal');
    assert.equal(logged.length, 1, 'o erro NÃO é engolido');
    assert.equal(logged[0][1], 'error');
    assert.match(logged[0][0], /worker 500/, 'com o detalhe real, não uma mensagem genérica');
  } finally {
    delete globalThis.window;
  }
});

test('deck sem nada compartilhado = como hoje: nem uma chamada à biblioteca', async () => {
  let touched = false;
  const lib = { async list() { touched = true; return []; }, async updateMany() { touched = true; } };
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', layout: 'cover', slots: { title: 'oi' } }]);

  await shared.hydrate(deck);
  const out = await shared.dehydrate(deck);

  assert.equal(touched, false, 'nenhum ref => nenhuma ida à biblioteca');
  assert.deepEqual(out, deck, 'o deck sai igual entrou');
});

test('o ciclo load->undo->save preserva o vínculo (o snapshot carrega o ref junto)', async () => {
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 's1', ref: 'L1' }]);
  await shared.hydrate(deck);

  // history.js tira snapshot do deck INTEIRO em JSON e reaplica: é o caminho onde um
  // desenho descuidado perderia o ref e transformaria o vínculo em cópia calada.
  const snap = JSON.parse(JSON.stringify(deck));
  deck.slides[0].slots.text = 'v2';
  const restored = JSON.parse(JSON.stringify(snap));

  assert.equal(restored.slides[0].ref, 'L1', 'o undo devolve um slide que ainda é vinculado');
  const out = await shared.dehydrate(restored);
  assert.deepEqual(out.slides[0], { id: 's1', ref: 'L1' });
});

test('sharedContent tira o que é do deck e guarda o que é do slide', () => {
  const c = sharedContent({ id: 'local', ref: 'L1', name: 'x', layout: 'topics', slots: { a: 1 }, notes: 'n', build: ['a:1'], buildFx: { 'a:1': { fx: 'zoom' } }, overrides: { k: {} } });
  assert.deepEqual(Object.keys(c).sort(), ['build', 'buildFx', 'notes', 'overrides', 'slots'].concat(['layout']).sort());
  assert.equal(c.id, undefined);
  assert.equal(c.ref, undefined);
  assert.equal(c.name, undefined);
  assert.equal(c.buildFx['a:1'].fx, 'zoom', 'animação é conteúdo do slide, logo é compartilhada');
});

test('isRef vs isLinked: stub em disco vs slide hidratado', () => {
  assert.equal(isRef({ id: 's', ref: 'L1' }), true);
  assert.equal(isRef({ id: 's', ref: 'L1', layout: 'cover' }), false, 'hidratado já não é stub');
  assert.equal(isRef({ id: 's', layout: 'cover' }), false);
  assert.equal(isLinked({ id: 's', ref: 'L1', layout: 'cover' }), true);
  assert.equal(isLinked({ id: 's', layout: 'cover' }), false);
});

// ── A costura app -> adapter (é o que o Élder exercita na mão no preview) ────

test('app.linkTemplate produz um slide que o adapter reconhece como vinculado', () => {
  const src = methodOf('linkTemplate');
  assert.match(src, /s\.ref = tpl\.id/, 'o vínculo aponta pro id da entrada da biblioteca');
  assert.match(src, /s\.id = uid\(\)/, 'o id local do deck é fresco (não colide com outro deck)');
  assert.match(src, /delete s\.name/, '`name` é metadado de biblioteca, não vai pro slide');
  assert.match(src, /this\.commit\(\)/,
    'commit() explícito: goTo não toca o store, e vínculo não persistido = vínculo que não aconteceu');
  // O que ele monta tem de passar pelos guards do adapter.
  const built = { id: 'novo', ref: 'L1', layout: 'statement', slots: { text: 'x' } };
  assert.equal(isLinked(built), true);
  assert.equal(isRef(built), false, 'já hidratado, não é stub');
});

test('app.insertTemplate (COPIAR) continua sem ref: é o default e não pode ter mudado', () => {
  const src = methodOf('insertTemplate');
  assert.doesNotMatch(src, /\.ref\s*=/, 'copiar NUNCA cria vínculo');
  assert.match(src, /s\.id = uid\(\)/);
});

test('app.detachCurrent tira o vínculo e o estado de quebrado, mantendo o conteúdo', () => {
  const src = methodOf('detachCurrent');
  assert.match(src, /delete s\.ref/, 'sem ref => o dehydrate persiste o slide inteiro no deck');
  assert.match(src, /delete s\._broken/, 'destacar um ref quebrado tem de limpar o placeholder');
  assert.match(src, /this\.record\(\)/, 'é desfazível pelo undo');
});

test('app.shareCurrentSlide promove: grava na biblioteca e SÓ então vincula', () => {
  const src = methodOf('shareCurrentSlide');
  assert.match(src, /if \(s\.ref\) return \{ error: "already-shared" \}/, 'não re-compartilha o já vinculado');
  const save = src.indexOf('this._library.save');
  const ref = src.indexOf('s.ref = tpl.id');
  assert.ok(save > 0 && ref > save, 'o ref só existe depois de a entrada existir de verdade');
});

// ── library.updateMany: o lote que o dehydrate usa ───────────────────────────
function fakeFacade(container) {
  const calls = { get: 0, save: 0 };
  return {
    calls,
    async list() { return { presentations: [{ slug: '__library__' }] }; },
    async getDeck() { calls.get++; return { data: container }; },
    async saveDeck({ data }) { calls.save++; container = data; return { ok: true }; },
    async register() { return { ok: true }; },
    _peek: () => container,
  };
}

test('updateMany: N slides em UM load + UM save (senão o autosave vira 2N round-trips)', async () => {
  const facade = fakeFacade({ slides: [{ id: 'L1', name: 'um', layout: 'statement', slots: { text: 'a' } }, { id: 'L2', name: 'dois', layout: 'statement', slots: { text: 'b' } }] });
  const lib = createLibrary({ facade });

  await lib.updateMany([{ id: 'L1', slide: { layout: 'statement', slots: { text: 'A' } } }, { id: 'L2', slide: { layout: 'statement', slots: { text: 'B' } } }]);

  assert.equal(facade.calls.get, 1, 'um load só');
  assert.equal(facade.calls.save, 1, 'um save só');
  const out = facade._peek().slides;
  assert.equal(out[0].slots.text, 'A');
  assert.equal(out[1].slots.text, 'B');
  assert.equal(out[0].name, 'um', 'o nome da entrada é preservado');
  assert.equal(out[0].id, 'L1', 'o id da entrada é preservado (é o alvo dos refs)');
});

test('updateMany ignora id que não existe mais (template excluído não ressuscita)', async () => {
  const facade = fakeFacade({ slides: [{ id: 'L1', name: 'um', layout: 'statement', slots: { text: 'a' } }] });
  const lib = createLibrary({ facade });

  await lib.updateMany([{ id: 'SUMIU', slide: { layout: 'statement', slots: { text: 'zumbi' } } }]);

  assert.equal(facade.calls.save, 0, 'nada pra atualizar => nem salva');
  assert.equal(facade._peek().slides.length, 1, 'o excluído continua excluído');
});
