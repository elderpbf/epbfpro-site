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
// Métodos de UMA LINHA (`addSlide(id) { ...; },`) param na própria linha. Sem isso o corte
// ia até o `\n    },` do PRÓXIMO método multi-linha e devolvia o corpo de três métodos
// juntos: um guard perguntando "addSlide chama commit?" respondia sim porque o removeSlide
// lá embaixo chamava. Guard que lê o vizinho não é guard.
const methodOf = (name) => {
  let i = APP_SRC.indexOf(`    ${name}(`);
  if (i < 0) i = APP_SRC.indexOf(`    async ${name}(`); // shareCurrentSlide é async
  assert.ok(i > 0, `${name} existe no app.js`);
  const oneLine = APP_SRC.slice(i, APP_SRC.indexOf('\n', i));
  if (/\},\s*$/.test(oneLine)) return oneLine;
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

test('app.detachSet tira o vínculo e o estado de quebrado, mantendo o conteúdo', () => {
  const src = methodOf('detachSet');
  assert.match(src, /delete s\.ref/, 'sem ref => o dehydrate persiste o slide inteiro no deck');
  assert.match(src, /delete s\._broken/, 'desvincular um ref limpa o placeholder junto');
  assert.match(src, /this\.record\(\)/, 'é desfazível pelo undo');
  assert.match(methodOf('detachCurrent'), /this\.detachSet\(\[this\.cur\(\)\]\)/, 'o singular é o conjunto de um só');
});

test('o botão de compartilhar EXISTE e diz os dois estados', () => {
  // Eu REMOVI o botão lendo "ele seria pouco usado" como "tire ele". O Élder corrigiu na
  // hora (2026-07-17): "só disse que ele seria pouco usado, não que deveria deixar de
  // existir". É a única porta que funciona sem um 2º deck pra colar dentro. Este teste
  // existe pra eu não podar de novo o que ele mandou manter.
  const src = methodOf('syncShareBtn');
  assert.match(src, /shr_share/, 'slide comum -> compartilhar');
  assert.match(src, /shr_shared_tip/, 'slide já compartilhado -> segue "compartilhar", o tint mostra o estado');
  assert.doesNotMatch(src, /shr_detach/, 'o botão NÃO vira "destacar" (Élder: sem esse notice ao compartilhar de novo)');
});

// O fluxo (qual deck? vinculado ou solto? desvincular?) mora em edit/shareflow.js, não mais
// inline no wireChrome (Élder 2026-07-17: "nada a gente escreve inline"). Os testes de fluxo
// leem a FONTE do módulo, como o resto do repo faz com o núcleo montado.
const SHAREFLOW_SRC = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/edit/shareflow.js', import.meta.url)), 'utf8');
const shareFlowFn = (name) => {
  const start = SHAREFLOW_SRC.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' existe em shareflow.js');
  const end = SHAREFLOW_SRC.indexOf('\n}\n', start);
  return SHAREFLOW_SRC.slice(start, end > start ? end : undefined);
};

test('desvincular não é forçado ao compartilhar: é opção, só quando TODOS estão vinculados', () => {
  // Élder 2026-07-17: clicar em compartilhar num slide já compartilhado abria "Desvincular?".
  // Compartilhar de novo é seguro (só aponta mais decks pra mesma entrada), então o clique vai
  // pro fluxo normal; desvincular é uma OPÇÃO, e só aparece quando a seleção inteira é vinculada
  // (mistura = só compartilhar). O confirm só dispara quando o usuário escolhe desvincular.
  const src = shareFlowFn('openShareFlow');
  assert.match(src, /if \(allLinked\) options\.push\(\{ value: "__unlink__"/, 'desvincular só quando allLinked');
  assert.match(src, /const allLinked = nonBroken\.every\(\(s\) => app\.isShared\(s\)\)/, 'allLinked = todos vinculados');
  assert.match(src, /if \(target === "__unlink__"\)[\s\S]{0,400}window\.confirm[\s\S]{0,120}app\.detachSet/, 'escolher desvincular confirma e desvincula o conjunto');
  const where = src.indexOf('__here__');
  const unlink = src.indexOf('__unlink__');
  assert.ok(where > 0 && unlink > where, 'desvincular fica DEPOIS dos destinos, no fim da lista');
});

test('este deck só aparece se ALGO ainda não é vinculado (senão não há o que publicar)', () => {
  const src = shareFlowFn('openShareFlow');
  assert.match(src, /const someUnlinked = nonBroken\.some\(\(s\) => !app\.isShared\(s\)\)/);
  assert.match(src, /if \(someUnlinked\) options\.push\(\{ value: "__here__"/, 'sem slide solto na seleção, some o "este deck"');
});

test('o glifo de vínculo na régua é um ATALHO clicável pro mesmo fluxo', () => {
  // Élder 2026-07-17: "os slides vinculados já têm aquele glifo... clicar nele deveria abrir o
  // modal de desvinculação, usando o que a gente tem". O selo virou <button data-lnk> e leva
  // ao MESMO app.openShareFlow, com stopPropagation pra não virar navegação do thumb.
  const nav = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/edit/navigator.js', import.meta.url)), 'utf8');
  assert.match(nav, /<button[^>]*class="lnkbadge[^"]*"[^>]*data-lnk="\$\{i\}"/, 'o selo é um button com data-lnk');
  assert.match(nav, /\[data-lnk\][\s\S]{0,220}stopPropagation\(\)[\s\S]{0,120}app\.openShareFlow\(\[s\]\)/, 'clicar abre o fluxo pra aquele slide, sem navegar');
});

test('o botão de compartilhar opera na SELEÇÃO da régua, não só no slide atual', () => {
  // Multi-pick + clicar compartilhar = agir sobre todos os selecionados (Élder 2026-07-17:
  // "pode selecionar vários e clicar no botão de compartilhar", tudo no mesmo modal).
  assert.match(APP_SRC, /shareBtn\.onclick = \(\) => app\.openShareFlow\(app\.pickedSlides\(\)\)/, 'o botão passa a seleção pro fluxo');
  assert.match(methodOf('pickedSlides'), /this\.picked\(\)\.map/, 'pickedSlides = a seleção como objetos');
  // E shareSetTo trata um conjunto: manda o array inteiro pro sendLinked/sendLoose.
  assert.match(methodOf('shareSetTo'), /sendLoose\(target\.slug, set\.map/, 'solto pra fora manda o conjunto');
  assert.match(methodOf('shareSetTo'), /sendLinked\(target\.slug, refs\)/, 'vinculado pra fora manda todos os refs');
});

test('compartilhar NÃO pede nome: pergunta o DECK, depois vinculado ou solto', () => {
  // Élder 2026-07-17: "modal perguntando se é para esse deck ou outro, com opção de criar um
  // novo ali; depois abre o modal de vincular ou solto". Nome sai de cena.
  assert.doesNotMatch(SHAREFLOW_SRC, /window\.prompt/, 'nenhum prompt de nome no fluxo');
  assert.match(SHAREFLOW_SRC, /shr_where_title/, '1ª pergunta: qual deck');
  assert.match(SHAREFLOW_SRC, /shr_where_new/, 'com a opção de criar um deck novo ali');
  const src = shareFlowFn('openShareFlow');
  const where = src.indexOf('askChoice(app.root');
  const how = src.indexOf('askHowMode(app.root');
  assert.ok(where > 0 && how > where, 'a 2ª pergunta (como) vem DEPOIS da 1ª (onde)');
  // O "como?" é askHowMode, a MESMA função que o colar usa: um ato, um vocabulário.
  assert.match(shareFlowFn('askHowMode'), /clip_paste_linked/, 'reusa as opções do colar, não inventa outras');
  assert.match(methodOf('onPaste'), /askHowMode\(/, 'e o colar chama a mesma função (sem duplicar o askChoice inline)');
});

test('compartilhar carimba o mesmo deck de origem que o colar', () => {
  // Senão a MESMA entrada secciona ou não na tab Biblioteca dependendo da porta por onde passou.
  assert.match(methodOf('shareSetTo'), /from: \{ slug: this\._slug, title: this\._deckTitle \}/);
});

test('compartilhar SOLTO não publica nada na biblioteca', () => {
  // Solto = cópia independente. Publicar seria criar uma entrada que ninguém acompanha.
  const src = methodOf('shareSetTo');
  const loose = src.indexOf('if (mode === "loose")');
  const save = src.indexOf('this._library.save');
  assert.ok(loose > 0 && save > loose, 'o caminho solto sai antes de qualquer publicação');
  assert.match(src, /duplicateSlide\(s\)/, 'solto no mesmo deck é duplicar cada um (cópia independente)');
});

test('compartilhar VINCULADO reusa o ref e NÃO cria gêmeo (publica no lugar)', () => {
  const src = methodOf('shareSetTo');
  assert.match(src, /let ref = s\.ref;[\s\S]{0,40}if \(!ref\)/, 'só publica se ainda não tem entrada');
  assert.match(src, /s\.ref = ref;/, 'publica NO LUGAR: o próprio slide vira o compartilhado');
  assert.match(src, /if \(here\) return \{ ok: true, mode, here/, 'este deck + vinculado NÃO insere 2ª cópia (sem gêmeo)');
  assert.doesNotMatch(src, /splice\([^)]*slideContent/, 'nunca faz splice de uma cópia do conteúdo (o gêmeo morto)');
});

test('inserir cai logo APÓS o slide selecionado, nunca no fim', () => {
  // Élder 2026-07-17: "deve inserir logo após o slide que está selecionado na barra".
  for (const m of ['linkTemplate', 'insertTemplate', 'addSlide']) {
    assert.match(methodOf(m), /splice\(this\.index \+ 1, 0/, `${m} insere depois do atual`);
  }
});

test('colar cai depois do ÚLTIMO slide da seleção, não depois do atual', () => {
  // Élder 2026-07-17: "se eu seleciono 1 e 2 e colo eles mesmos, vai ficar 1 e 2 (originais)
  // depois 1 e 2 colados". Com `index + 1` sairia 1, 1', 2', 2: a cópia no meio do original.
  const src = methodOf('pasteClip');
  assert.match(src, /Math\.max\(\.\.\.this\.picked\(\)\) \+ 1/, 'o ponto é o fim da seleção');
  const at = src.indexOf('const at =');
  const clear = src.indexOf('this.clearPick()');
  assert.ok(at > 0 && clear > at, 'picked() é lido ANTES de limpar, senão a seleção já sumiu');
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

test('TODA op que remexe slides[] limpa a multi-seleção da régua', () => {
  // `_pick` guarda ÍNDICES. Selecione 2-3-4, apague o 2, e o array anda mas o set continua
  // {2,3,4}: os thumbs acesos passam a ser OUTROS slides e o Ctrl+C copia os errados, com o
  // destaque certo. Achado numa revisão, não por teste, e o comentário do `_pick` chegou a
  // AFIRMAR que isso já acontecia quando não acontecia em 5 das 7 ops.
  const MUTATORS = ['addSlide', 'duplicate', 'removeSlide', 'reorder', 'insertTemplate', 'linkTemplate', 'pasteClip'];
  const missing = MUTATORS.filter((m) => !/this\.clearPick\(\)/.test(methodOf(m)));
  assert.deepEqual(missing, [], 'estas remexem slides[] sem limpar a seleção por índice');
});

test('TODA op que remexe slides[] arma o autosave (commit, direto ou via refresh)', () => {
  // store.touch() é o ÚNICO gatilho do autosave (store.on('change') -> 800ms em
  // content/slides.js) e commit() é o único caminho até ele. goTo() renderiza e não toca o
  // store, então `splice + goTo` mexe no deck e NÃO marca sujo: o slide só é salvo se você
  // digitar nele depois, porque aí o keystroke salva o deck inteiro. Por isso o bug se
  // escondia. "Compartilhar -> este deck -> solto" (que cai no duplicate) é justo o caso sem
  // keystroke nenhum depois: dizia "compartilhado" e sumia no reload.
  const MUTATORS = ['addSlide', 'duplicate', 'removeSlide', 'reorder', 'insertTemplate', 'linkTemplate', 'pasteClip'];
  const missing = MUTATORS.filter((m) => !/this\.(commit|refresh)\(/.test(methodOf(m)));
  assert.deepEqual(missing, [], 'estas mudam slides[] sem nunca marcar o deck como sujo');
});

test('commit() é o único caminho até store.touch(), e goTo() não é um deles', () => {
  // O guard acima só vale enquanto estas duas coisas forem verdade. Linhas de comentário
  // fora: elas FALAM de store.touch() e não chamam nada.
  const code = APP_SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const n = (code.match(/store\.touch\(\)/g) || []).length;
  assert.equal(n, 1, 'só o commit() toca o store');
  assert.match(methodOf('commit'), /store\.touch\(\)/);
  assert.ok(!/this\.commit\(|store\.touch/.test(methodOf('goTo')), 'goTo só navega/renderiza');
});

test('a sincronia de gêmeos parte do slide EDITADO, não do que está na tela', () => {
  // A janela do apresentador escreve notes em QUALQUER slide por índice, não no cur(). Com
  // syncSameRef partindo sempre do cur(), um gêmeo do slide na tela recebia o conteúdo do
  // cur() por cima da nota recém-digitada: o mesmo "gêmeo come a edição" que este mecanismo
  // existe pra impedir, no único ponto onde quem edita não é quem está na tela.
  assert.match(methodOf('syncSameRef'), /const s = from \|\| this\.cur\(\)/);
  assert.match(methodOf('commit'), /syncSameRef\(from\)/);
  const pres = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/present/presenter.js', import.meta.url)), 'utf8');
  assert.match(pres, /s\.notes = m\.notes; app\.commit\(s\)/, 'o presenter passa o slide que editou');
});

test('destacar NÃO é o conserto de um vínculo quebrado', () => {
  // brokenSlide() é um AVISO ("slide compartilhado não encontrado"), não conteúdo: o conteúdo
  // vivia na entrada da biblioteca que foi excluída, e o deck só guarda {id, ref}. Destacar um
  // slide quebrado congelava esse aviso como conteúdo do slide e jogava o ref fora, ou seja,
  // entregava lixo chamando de conserto. E o shr_broken_tip mandava fazer exatamente isso.
  assert.match(methodOf('detachSet'), /!s\.ref \|\| !s\._broken\) return false|s && s\.ref && !s\._broken/, 'o quebrado é filtrado fora do desvincular');
  assert.match(methodOf('resetBroken'), /if \(!s \|\| !s\._broken\) return false;/, 'e é o único que aceita');
  assert.match(methodOf('resetBroken'), /s\.slots = \{ text: "" \}/, 'limpa o aviso em vez de promovê-lo a conteúdo');
});

test('a preview da régua ANEXA o thumb antes de renderizar (senão o slide freed some)', () => {
  // Élder 2026-07-17: "se a imagem dentro de um frame de imagem for resized, ela deixa de
  // mostrar na preview na barra". Causa: applyOverrides -> freedStyle anda pelo offsetParent
  // pra converter a coordenada de canvas do elemento freed em coordenada relativa à raiz do
  // render. Num nó DESTACADO, offsetParent é null: a volta é pulada, todo offset lê 0, e o
  // elemento é posicionado contra o container errado quando finalmente entra no DOM. Some.
  // Só aparece DEPOIS de o elemento ter override, que é exatamente "depois de resized".
  const src = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/edit/navigator.js', import.meta.url)), 'utf8');
  const append = src.indexOf('nav.appendChild(th)');
  const render = src.indexOf('renderInto(th.querySelector(".scale")');
  assert.ok(append > 0 && render > 0, 'as duas linhas existem');
  assert.ok(append < render, 'anexar TEM de vir antes de renderizar');
});

test('os cards de preview do +slide seguem a mesma regra (o mesmo bug latente)', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../content/slides/js/edit/addslide.js', import.meta.url)), 'utf8');
  const i = src.indexOf('function card(parent, labelText, slide, onPick)');
  assert.ok(i > 0, 'card() recebe o parent: sem ele não dá pra anexar antes');
  const body = src.slice(i, src.indexOf('\n  }', i));
  assert.ok(body.indexOf('parent.appendChild(btn)') < body.indexOf('renderInto('), 'anexa antes de renderizar');
});

test('dois slides com o MESMO ref num deck: o save nunca deixa o gêmeo velho comer a edição', async () => {
  // Élder 2026-07-17: colou vinculado no mesmo deck, editou, "a mudança só apareceu no
  // original depois de dar refresh". Pior que desatualizado: os dois viram entrada pro MESMO
  // id da biblioteca, o updateMany aplicava as duas em ordem e a ÚLTIMA vencia. Ou seja o
  // gêmeo que você NÃO acabou de editar sobrescrevia a sua edição. Perda de dado silenciosa.
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'a', ref: 'L1' }, { id: 'b', ref: 'L1' }]);
  await shared.hydrate(deck);

  deck.slides[0].slots.text = 'editado no A'; // o B continua com 'v1' em memória

  await shared.dehydrate(deck);

  assert.equal(lib._peek('L1').slide.slots.text, 'editado no A',
    'a edição sobrevive: o B (velho) não pode ser gravado por cima');
});

test('app.commit sincroniza os gêmeos do mesmo ref (é o que evita o "só depois do refresh")', () => {
  // A invariante que um slide vinculado promete é UM slide, N lugares. Dentro de um deck os
  // gêmeos são objetos diferentes, então alguém tem de mantê-los iguais; o commit é o funil
  // por onde TODA mutação passa a caminho do store, então é o único lugar que fecha isso.
  assert.match(methodOf('commit'), /this\.syncSameRef\(from\)/, 'o commit sincroniza');
  const src = methodOf('syncSameRef');
  assert.match(src, /o\.ref !== s\.ref/, 'só mexe em quem tem o mesmo ref');
  assert.match(src, /id: o\.id/, 'cada gêmeo mantém o próprio id local do deck');
  assert.match(src, /s\._broken/, 'o placeholder quebrado não espalha "não encontrado" pros irmãos');
  assert.match(methodOf('commit'), /renderNav/, 'e a régua reflete na hora, sem refresh');
});

test('excluir da biblioteca é RECUSADO enquanto algum deck vincula', async () => {
  // Élder apagou entradas e ficou com decks cheios de "Slide compartilhado não encontrado",
  // sem aviso nenhum. A regra do Codex pra coisa em uso é recusar o hard-delete (é o que o
  // curso faz com turma apontando pra ele), não confirmar e quebrar.
  const decks = [{ slug: 'jurista', title: 'Deck Jurista', engine: 'codex-deck' }];
  const json = { jurista: { slides: [{ id: 's1', ref: 'L1' }, { id: 's2', ref: 'L1' }] } };
  let removed = false;
  const facade = {
    async list() { return { presentations: [...decks, { slug: '__library__', engine: 'codex-library' }] }; },
    async getDeck({ slug }) {
      if (slug === '__library__') return { data: { slides: [{ id: 'L1', name: 'Abertura' }] } };
      return { data: json[slug] };
    },
    async saveDeck() { removed = true; return { ok: true }; },
    async register() { return { ok: true }; },
  };
  const lib = createLibrary({ facade });

  const used = await lib.usedBy('L1');

  assert.equal(used.length, 1);
  assert.equal(used[0].title, 'Deck Jurista');
  assert.equal(used[0].count, 2, 'conta as DUAS posições, não o deck uma vez');
  assert.equal(removed, false, 'usedBy é read-only');

  // E o container da biblioteca não se conta a si mesmo (ele não é um deck nosso).
  const none = await lib.usedBy('SEM-USO');
  assert.deepEqual(none, [], 'entrada sem uso nenhum: nada segura a exclusão');
});

test('usedBy prefere o deck ABERTO em memória ao json salvo dele', async () => {
  // O deck na tela pode ter um vínculo que o autosave ainda não gravou. Ler o json salvo diria
  // "não está em uso" e a exclusão passaria, quebrando o slide que está na frente do Élder.
  const facade = {
    async list() { return { presentations: [{ slug: 'aberto', title: 'Aberto', engine: 'codex-deck' }] }; },
    async getDeck() { return { data: { slides: [] } } ; }, // o SALVO não tem o vínculo ainda
    async saveDeck() { return { ok: true }; },
    async register() { return { ok: true }; },
  };
  const lib = createLibrary({ facade });
  const openDeck = { slug: 'aberto', deck: { slides: [{ id: 'x', ref: 'L1' }] } };

  const used = await lib.usedBy('L1', openDeck);

  assert.equal(used.length, 1, 'o vínculo ainda-não-salvo conta');
  assert.equal(used[0].count, 1);
});

test('app.deleteTemplate devolve inUse em vez de apagar', () => {
  const src = methodOf('deleteTemplate');
  const check = src.indexOf('usedBy');
  const remove = src.indexOf('this._library.remove');
  assert.ok(check > 0 && remove > check, 'checa o uso ANTES de remover');
  assert.match(src, /if \(used\.length\) return \{ inUse: used \}/, 'e devolve pra UI dizer onde');
});

test('duplicar um slide COMPARTILHADO dá uma cópia solta, não um gêmeo vinculado', async () => {
  // O duplicateSlide clonava o slide inteiro, ref junto. Então o botão "duplicar" (que promete
  // uma cópia) devolvia um segundo VÍNCULO, e editar a "cópia" editava os outros decks. Pior:
  // "compartilhar -> este deck -> SOLTO" passa por aqui, ou seja o solto saía vinculado, que é
  // o oposto exato da única distinção que o Élder fica testando.
  const { duplicateSlide } = await import('../content/slides/js/core/deck.js');
  const d = duplicateSlide({ id: 's1', ref: 'L1', layout: 'statement', slots: { text: 'oi' } });
  assert.equal(d.ref, undefined, 'duplicar = cópia independente, sem vínculo');
  assert.notEqual(d.id, 's1');
  assert.equal(d.slots.text, 'oi', 'o conteúdo vai junto');

  const b = duplicateSlide({ id: 's2', ref: 'X', _broken: true, layout: 'statement', slots: { text: 'não encontrado' } });
  assert.equal(b._broken, undefined, 'duplicar um placeholder quebrado não espalha o aviso como conteúdo');
});

test('o dehydrate escreve UMA vez por ref e escolhe o gêmeo EDITADO', async () => {
  const lib = fakeLibrary([tpl('L1', 'v1')]);
  const shared = createSharedSlides({ library: lib });
  const deck = deckWith([{ id: 'a', ref: 'L1' }, { id: 'b', ref: 'L1' }]);
  await shared.hydrate(deck);

  // O 2º gêmeo é o editado (o 1º fica velho). Pegar "o primeiro" perderia a edição.
  deck.slides[1].slots.text = 'editado no B';
  await shared.dehydrate(deck);

  assert.equal(lib.writes, 1, 'uma gravação, não duas correndo pro mesmo id');
  assert.equal(lib._peek('L1').slide.slots.text, 'editado no B');
});

// ── compartilhar -> criar deck novo (Élder 2026-07-17: "ela abre quebrada") ───────────────
const SLIDES_JS = fs.readFileSync(fileURLToPath(new URL('../content/slides.js', import.meta.url)), 'utf8');
const fnOf = (name) => {
  const i = SLIDES_JS.indexOf('function ' + name + '(');
  const a = SLIDES_JS.indexOf('async function ' + name + '(');
  const start = i < 0 ? a : (a < 0 ? i : Math.min(i, a));
  assert.ok(start >= 0, name + ' existe em slides.js');
  const end = SLIDES_JS.indexOf('\n}\n', start);
  assert.ok(end > start, name + ' fecha');
  return SLIDES_JS.slice(start, end);
};

test('uniqueTitle: nome livre passa, nome tomado ganha (1), (2)…', async () => {
  const { uniqueTitle } = await import('../content/slides.js');
  assert.equal(uniqueTitle('Aula', []), 'Aula', 'livre passa igual');
  assert.equal(uniqueTitle('Aula', ['Aula']), 'Aula (1)', 'tomado ganha (1)');
  assert.equal(uniqueTitle('Aula', ['Aula', 'Aula (1)']), 'Aula (2)', 'sobe até achar vaga');
  assert.equal(uniqueTitle('Aula', ['aula']), 'Aula (1)', 'colisão é sem caixa e sem espaço nas pontas');
  assert.equal(uniqueTitle('  Aula  ', ['Aula']), 'Aula (1)', 'e o espaço nas pontas some');
});

test('criar deck novo é um deck DE VERDADE, não uma linha vazia (o "abre quebrada")', () => {
  // O caminho de compartilhar-para-novo registrava só a linha (D1) e deixava o _append gravar
  // um {slides:[…]} sem canvas/tema/logo/slides-padrão: abria em branco, fora da tela, lista
  // vazia. Agora _createDeck monta um newDeck() completo e PERSISTE (saveDeck) antes de mandar
  // o slide, tanto na aba (open) quanto no compartilhar (open:false).
  const src = fnOf('_createDeck');
  assert.match(src, /newDeck\(\)/, 'sempre parte de um newDeck() (canvas + tema + 3 slides padrão)');
  assert.match(src, /_uniqueTitle\(/, 'e o nome é único');
  assert.match(src, /api\.saveDeck\(\{ slug, data: deck \}\)/, 'o caminho open:false PERSISTE o esqueleto');
  assert.ok(!/return \{ slug, title: finalTitle \};[\s\S]{0,40}catch/.test(src) || /saveDeck/.test(src),
    'não volta antes de gravar');
});

test('o botão compartilhar->novo NÃO pede nome e cria sem abrir', () => {
  // Élder: "ele me perguntou o nome ao invés de dar um nome". O fluxo não deve chamar
  // window.prompt pro deck novo; auto-nomeia e cria com open:false pra ficar no slide atual.
  const i = SHAREFLOW_SRC.indexOf('target === "__new__"');
  const block = SHAREFLOW_SRC.slice(i, i + 400);
  assert.ok(!/window\.prompt/.test(block), 'sem prompt de nome no ramo do deck novo');
  assert.match(block, /_createDeck\(null, \{ open: false \}\)/, 'auto-nome + não abre');
  assert.ok(!/shr_new_deck_prompt/.test(SHAREFLOW_SRC), 'e a string de prompt morreu');
});

test('duplicar deck e renomear também garantem nome único', () => {
  assert.match(fnOf('_duplicateDeck'), /_uniqueTitle\(/, 'duplicar não gera dois nomes iguais');
  assert.match(fnOf('_renameDeck'), /_uniqueTitle\([^,]+, slug\)/, 'renomear exclui o próprio deck da colisão');
});
