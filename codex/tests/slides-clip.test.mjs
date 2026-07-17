// slides-clip.test.mjs, copiar/colar de slides = a forma padrão de compartilhar
// (track-35 C, Élder 2026-07-17).
//
// A regra que estes testes existem pra travar: **colar vinculado converte OS DOIS lados**.
// Se só o lado colado virar ref, "mexer em um atualiza o outro" é mentira em metade dos
// casos, e é a metade que o Élder não olha (o deck de origem, que está fechado). Um vínculo
// de mão única passa em qualquer teste ingênuo: o deck novo propaga lindamente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlideClip, CLIP_KEY } from '../content/slides/adapters/slideClip.js';

// localStorage de mentira (o adapter aceita `storage` injetado justamente pra isto).
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _raw: () => m };
}

// Biblioteca de mentira: conta as publicações, que é como se prova que não republica.
function fakeLibrary() {
  const saved = [];
  return {
    saved,
    async save(content, name, opts) {
      const tpl = { id: 'L' + (saved.length + 1), name, from: (opts && opts.from) || null, slide: content };
      saved.push(tpl);
      return tpl;
    },
  };
}

// Facade de mentira: os decks por slug, e o registro das gravações.
function fakeFacade(decks) {
  const calls = { saves: [] };
  return {
    calls,
    async getDeck({ slug }) {
      if (!(slug in decks)) throw new Error('not found');
      return { data: JSON.parse(JSON.stringify(decks[slug])) };
    },
    async saveDeck({ slug, data }) { decks[slug] = data; calls.saves.push(slug); return { ok: true }; },
    _deck: (s) => decks[s],
  };
}

const slide = (id, text, ref) => ({ id, layout: 'statement', slots: { text }, ...(ref ? { ref } : {}) });

test('copy é captura PURA: não publica nada e não mexe no deck', () => {
  const storage = fakeStorage(), library = fakeLibrary();
  const clip = createSlideClip({ storage, library, facade: fakeFacade({}) });
  const s = slide('s1', 'oi');

  const out = clip.copy([s], { srcSlug: 'jurista', srcTitle: 'Deck Jurista' });

  assert.equal(out.items.length, 1);
  assert.equal(library.saved.length, 0, 'copiar NÃO publica: a decisão é do colar');
  assert.deepEqual(s, slide('s1', 'oi'), 'o slide de origem sai intacto do Ctrl+C');
  assert.equal(out.srcTitle, 'Deck Jurista', 'a origem viaja junto (o colar vinculado precisa dela)');
  assert.equal(JSON.parse(storage._raw().get(CLIP_KEY)).items[0].slideId, 's1');
});

test('colar SOLTO: cópias independentes, id novo, sem ref, sem tocar na biblioteca', () => {
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade: fakeFacade({}) });
  const payload = clip.copy([slide('s1', 'oi')], { srcSlug: 'jurista' });

  const out = clip.pasteLoose(payload);

  assert.equal(out.length, 1);
  assert.equal(out[0].ref, undefined, 'solto = sem vínculo, pode divergir');
  assert.notEqual(out[0].id, 's1', 'id fresco');
  assert.equal(out[0].slots.text, 'oi');
  assert.equal(library.saved.length, 0);
});

test('colar VINCULADO converte OS DOIS lados (é a regra inteira do recurso)', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura'), slide('s2', 'outro')] } };
  const facade = fakeFacade(decks);
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade });
  const payload = clip.copy([decks.jurista.slides[0]], { srcSlug: 'jurista', srcTitle: 'Deck Jurista' });

  const { slides, sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(sourceFailed.length, 0);
  // lado colado
  assert.equal(slides[0].ref, 'L1', 'o slide colado aponta pra entrada nova');
  assert.equal(slides[0].slots.text, 'abertura');
  // lado de ORIGEM: o que ninguém olha e onde a mentira moraria
  assert.deepEqual(decks.jurista.slides[0], { id: 's1', ref: 'L1' },
    'o slide de ORIGEM virou vínculo: sem isto, editar lá não mudaria nada aqui');
  assert.deepEqual(decks.jurista.slides[1], slide('s2', 'outro'), 'os outros slides do deck origem não são tocados');
  assert.equal(library.saved[0].from.title, 'Deck Jurista', 'a entrada guarda o deck de origem (as seções do +slide)');
});

test('colar vinculado um slide JÁ compartilhado reusa o ref: não republica', async () => {
  // Esta é a queixa "deixa compartilhar o mesmo slide infinitas vezes", na raiz.
  const decks = { jurista: { slides: [slide('s1', 'abertura', 'L9')] } };
  const facade = fakeFacade(decks);
  const library = fakeLibrary();
  const clip = createSlideClip({ storage: fakeStorage(), library, facade });
  const payload = clip.copy([decks.jurista.slides[0]], { srcSlug: 'jurista' });

  const { slides } = await clip.pasteLinked(payload);

  assert.equal(slides[0].ref, 'L9', 'aponta pra MESMA entrada');
  assert.equal(library.saved.length, 0, 'nenhuma entrada nova: uma entrada por slide, não por colagem');
  assert.equal(facade.calls.saves.length, 0, 'nem precisa mexer no deck de origem: já era vínculo');
});

test('colar o MESMO clipboard duas vezes não cria duas entradas', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura')] } };
  const clip = createSlideClip({ storage: fakeStorage(), library: (() => { const l = fakeLibrary(); return l; })(), facade: fakeFacade(decks) });
  const library = fakeLibrary();
  const clip2 = createSlideClip({ storage: fakeStorage(), library, facade: fakeFacade(decks) });
  const payload = clip2.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const a = await clip2.pasteLinked(payload);
  const b = await clip2.pasteLinked(payload);

  assert.equal(library.saved.length, 1, 'a 2ª colagem reusa a entrada da 1ª');
  assert.equal(a.slides[0].ref, b.slides[0].ref, 'os dois colados apontam pro mesmo slide');
  assert.notEqual(a.slides[0].id, b.slides[0].id, 'mas são posições distintas no deck');
  void clip;
});

test('origem ABERTA: converte em memória e NÃO grava por fora (o autosave clobbaria)', async () => {
  const decks = { jurista: { slides: [slide('s1', 'abertura')] } };
  const facade = fakeFacade(decks);
  const seen = [];
  const clip = createSlideClip({
    storage: fakeStorage(), library: fakeLibrary(), facade,
    onOpenDeck: (srcSlug, entries) => { seen.push([srcSlug, entries]); return true; },
  });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const { sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(sourceFailed.length, 0);
  assert.equal(seen.length, 1, 'o editor aberto tratou');
  assert.equal(seen[0][0], 'jurista');
  assert.equal(facade.calls.saves.length, 0, 'nenhuma gravação por fora do editor aberto');
});

test('origem sumida: a colagem VALE e a falha é DEVOLVIDA (nunca vínculo de mão única calado)', async () => {
  const facade = fakeFacade({}); // o deck de origem não existe mais
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'sumiu' });

  const { slides, sourceFailed } = await clip.pasteLinked(payload);

  assert.equal(slides[0].ref, 'L1', 'o slide colado entra vinculado do mesmo jeito');
  assert.deepEqual(sourceFailed, ['s1'], 'e o chamador RECEBE a falha pra avisar');
});

test('slide apagado no deck de origem desde o Ctrl+C: mesma regra', async () => {
  const decks = { jurista: { slides: [slide('outro', 'sobrou')] } };
  const facade = fakeFacade(decks);
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade });
  const payload = clip.copy([slide('s1', 'abertura')], { srcSlug: 'jurista' });

  const { sourceFailed } = await clip.pasteLinked(payload);

  assert.deepEqual(sourceFailed, ['s1']);
  assert.equal(facade.calls.saves.length, 0, 'não salva um deck que não mudou');
  assert.deepEqual(decks.jurista.slides, [slide('outro', 'sobrou')], 'e não inventa o slide de volta');
});

test('clipboard vazio/corrompido = colar não faz nada (nunca joga)', () => {
  const storage = fakeStorage();
  const clip = createSlideClip({ storage, library: fakeLibrary(), facade: fakeFacade({}) });
  assert.equal(clip.read(), null, 'vazio');
  storage.setItem(CLIP_KEY, '{isto nao e json');
  assert.equal(clip.read(), null, 'corrompido lê como vazio, não como exceção');
  storage.setItem(CLIP_KEY, JSON.stringify({ items: [] }));
  assert.equal(clip.read(), null, 'sem itens = sem clipboard');
});

test('copiar VÁRIOS slides preserva a ordem da régua', () => {
  const clip = createSlideClip({ storage: fakeStorage(), library: fakeLibrary(), facade: fakeFacade({}) });
  const out = clip.copy([slide('a', '1'), slide('b', '2'), slide('c', '3')], { srcSlug: 'd' });
  assert.deepEqual(out.items.map((i) => i.slideId), ['a', 'b', 'c']);
  assert.deepEqual(clip.pasteLoose(out).map((s) => s.slots.text), ['1', '2', '3']);
});

// ── A tab "Biblioteca" do +slide, seccionada pelo deck de origem ─────────────
import { groupTemplates } from '../content/slides/js/edit/addslide.js';

const tplFrom = (id, slug, title) => ({ id, name: id, layout: 'cover', from: slug ? { slug, title } : null });

test('groupTemplates secciona pelo DECK de origem, em ordem alfabética', () => {
  const out = groupTemplates([
    tplFrom('a', 'jurista', 'Deck Jurista'),
    tplFrom('b', 'advogado', 'Deck Advogado'),
    tplFrom('c', 'jurista', 'Deck Jurista'),
  ]);
  assert.deepEqual(out.map((g) => g.title), ['Deck Advogado', 'Deck Jurista']);
  assert.deepEqual(out[1].items.map((t2) => t2.id), ['a', 'c'], 'a ordem dentro da seção é a de inserção');
});

test('o título da seção é o ATUAL do deck: renomear o deck renomeia a seção', () => {
  // O `from.title` é o nome de quando compartilhou. Congelar nele deixaria a seção com um
  // nome que não existe mais em lugar nenhum da tela.
  const out = groupTemplates([tplFrom('a', 'jurista', 'Nome Velho')], (slug) => (slug === 'jurista' ? 'Nome Novo' : null));
  assert.equal(out[0].title, 'Nome Novo');
});

test('deck de origem APAGADO: cai no nome gravado, não some da biblioteca', () => {
  const out = groupTemplates([tplFrom('a', 'sumiu', 'Deck Que Sumiu')], () => null);
  assert.equal(out[0].title, 'Deck Que Sumiu', 'a entrada continua inserível');
});

test('entradas SEM origem (salvar-como-layout, ou de antes do `from`) viram UMA seção, por último', () => {
  const out = groupTemplates([
    tplFrom('legado', null),
    tplFrom('a', 'zzz', 'Ultimo Alfabetico'),
    tplFrom('outro-legado', null),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Ultimo Alfabetico');
  assert.equal(out[1].key, '__none__', 'o catch-all é o último, sempre');
  assert.deepEqual(out[1].items.map((t2) => t2.id), ['legado', 'outro-legado'], 'nada é escondido');
});
