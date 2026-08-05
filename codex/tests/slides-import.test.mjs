// slides-import.test.mjs — unit tests for the pptx import pipeline (Phase 5b).
// Pure, no network, no DOM. We build real .pptx zips in-memory with fflate's
// zipSync and read them back, so the parser is exercised end to end.
// Run: node --test tests/slides-import.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from '../js/vendor/fflate.js';
import { parsePptx, parseSlideXml } from '../content/slides/js/import/pptx.js';
import {
  classifyHeuristic,
  classifySlide,
  classifyAll,
  buildClassifyPrompt,
  parseClassifyResponse,
} from '../content/slides/js/import/classify.js';
import { buildSlide, buildDeck } from '../content/slides/js/import/build.js';

// ---- slide-XML fixtures ----------------------------------------------------

function titleSp(type, text) {
  return (
    '<p:sp><p:nvSpPr><p:nvPr><p:ph type="' + type + '"/></p:nvPr></p:nvSpPr>' +
    '<p:txBody><a:p><a:r><a:t>' + text + '</a:t></a:r></a:p></p:txBody></p:sp>'
  );
}
function bodySp(paragraphs) {
  const ps = paragraphs
    .map((t) => '<a:p><a:r><a:t>' + t + '</a:t></a:r></a:p>')
    .join('');
  return (
    '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>' +
    '<p:txBody>' + ps + '</p:txBody></p:sp>'
  );
}
const PIC =
  '<p:pic><p:nvPicPr><p:nvPr/></p:nvPicPr>' +
  '<p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>';

function slide(inner) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<p:sld xmlns:p="ns-p" xmlns:a="ns-a" xmlns:r="ns-r"><p:cSld><p:spTree>' +
    inner + '</p:spTree></p:cSld></p:sld>'
  );
}

// ---- parseSlideXml ---------------------------------------------------------

test('parseSlideXml: pulls the title from the title placeholder', () => {
  const s = parseSlideXml(slide(titleSp('ctrTitle', 'Capa do curso')), 0);
  assert.equal(s.title, 'Capa do curso');
});

test('parseSlideXml: decodes XML entities in text', () => {
  const s = parseSlideXml(slide(titleSp('title', 'Direito &amp; IA &lt;hoje&gt;')), 0);
  assert.equal(s.title, 'Direito & IA <hoje>');
});

test('parseSlideXml: groups body paragraphs by shape and flattens them', () => {
  const s = parseSlideXml(
    slide(titleSp('title', 'T') + bodySp(['um', 'dois', 'tres'])),
    0
  );
  assert.equal(s.shapes.length, 1, 'one body shape');
  assert.deepEqual(s.shapes[0].paragraphs, ['um', 'dois', 'tres']);
  assert.deepEqual(s.paragraphs, ['um', 'dois', 'tres']);
});

test('parseSlideXml: the title text never leaks into body shapes', () => {
  const s = parseSlideXml(slide(titleSp('title', 'Só título')), 0);
  assert.equal(s.shapes.length, 0);
  assert.deepEqual(s.paragraphs, []);
});

test('parseSlideXml: drops empty paragraphs', () => {
  const xml = slide(
    titleSp('title', 'T') +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody>' +
      '<a:p><a:r><a:t>real</a:t></a:r></a:p><a:p></a:p><a:p><a:r><a:t>   </a:t></a:r></a:p>' +
      '</p:txBody></p:sp>'
  );
  const s = parseSlideXml(xml, 0);
  assert.deepEqual(s.paragraphs, ['real']);
});

test('parseSlideXml: counts pictures, none when absent', () => {
  assert.equal(parseSlideXml(slide(titleSp('title', 'T') + PIC + PIC), 0).imageCount, 2);
  assert.equal(parseSlideXml(slide(titleSp('title', 'T')), 0).imageCount, 0);
});

test('parseSlideXml: multiple body shapes become multiple shapes (cards signal)', () => {
  const s = parseSlideXml(
    slide(titleSp('title', 'T') + bodySp(['bloco A']) + bodySp(['bloco B']) + bodySp(['bloco C'])),
    0
  );
  assert.equal(s.shapes.length, 3);
});

test('parseSlideXml: joins multiple runs within a paragraph', () => {
  const xml = slide(
    '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>' +
      '<a:p><a:r><a:t>Parte 1 </a:t></a:r><a:r><a:t>Parte 2</a:t></a:r></a:p>' +
      '</p:txBody></p:sp>'
  );
  assert.equal(parseSlideXml(xml, 0).title, 'Parte 1 Parte 2');
});

// ---- parsePptx (zip + ordering) --------------------------------------------

function pkg(files) {
  const entries = {};
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  return zipSync(entries);
}

const REL =
  (id, target) =>
    '<Relationship Id="' + id + '" Type="ns/slide" Target="' + target + '"/>';

test('parsePptx: unzips and parses every slide', () => {
  const bytes = pkg({
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>' +
      '<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/>' +
      '</p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="x">' +
      REL('rId2', 'slides/slide1.xml') + REL('rId3', 'slides/slide2.xml') +
      '</Relationships>',
    'ppt/slides/slide1.xml': slide(titleSp('ctrTitle', 'Capa')),
    'ppt/slides/slide2.xml': slide(titleSp('title', 'Tópicos') + bodySp(['a', 'b'])),
  });
  const { slides } = parsePptx(bytes);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].title, 'Capa');
  assert.equal(slides[1].title, 'Tópicos');
  assert.deepEqual(slides[1].paragraphs, ['a', 'b']);
});

test('parsePptx: honors presentation order (sldIdLst), not filename order', () => {
  const bytes = pkg({
    // sldIdLst lists rId3 (slide2) BEFORE rId2 (slide1).
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>' +
      '<p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/>' +
      '</p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="x">' +
      REL('rId2', 'slides/slide1.xml') + REL('rId3', 'slides/slide2.xml') +
      '</Relationships>',
    'ppt/slides/slide1.xml': slide(titleSp('title', 'PRIMEIRA no arquivo')),
    'ppt/slides/slide2.xml': slide(titleSp('title', 'SEGUNDA no arquivo')),
  });
  const { slides } = parsePptx(bytes);
  assert.equal(slides[0].title, 'SEGUNDA no arquivo', 'order follows sldIdLst');
  assert.equal(slides[1].title, 'PRIMEIRA no arquivo');
});

test('parsePptx: skips media entries (text-first) yet still sees the picture', () => {
  const bytes = pkg({
    'ppt/slides/slide1.xml': slide(titleSp('title', 'Com imagem') + bodySp(['legenda']) + PIC),
    'ppt/media/image1.png': 'PNGDATA-not-xml-should-be-skipped',
  });
  const { slides } = parsePptx(bytes);
  assert.equal(slides.length, 1);
  assert.equal(slides[0].imageCount, 1, 'image presence read from <p:pic> in the XML, not the media bytes');
});

test('parsePptx: falls back to numeric filename order without a manifest', () => {
  const bytes = pkg({
    'ppt/slides/slide10.xml': slide(titleSp('title', 'dez')),
    'ppt/slides/slide2.xml': slide(titleSp('title', 'dois')),
    'ppt/slides/slide1.xml': slide(titleSp('title', 'um')),
  });
  const { slides } = parsePptx(bytes);
  assert.deepEqual(slides.map((s) => s.title), ['um', 'dois', 'dez']);
});

// ---- classifyHeuristic -----------------------------------------------------

const SRC = (o) => ({ title: '', paragraphs: [], shapes: [], imageCount: 0, ...o });

test('classifyHeuristic: title only -> cover', () => {
  assert.equal(classifyHeuristic(SRC({ title: 'Seção 1' })).layoutId, 'cover');
});
test('classifyHeuristic: bullets in one block -> topics', () => {
  const v = classifyHeuristic(SRC({ title: 'T', paragraphs: ['a', 'b', 'c'], shapes: [{ paragraphs: ['a', 'b', 'c'] }] }));
  assert.equal(v.layoutId, 'topics');
});
test('classifyHeuristic: image + text -> split', () => {
  const v = classifyHeuristic(SRC({ title: 'T', paragraphs: ['a'], shapes: [{ paragraphs: ['a'] }], imageCount: 1 }));
  assert.equal(v.layoutId, 'split');
});
test('classifyHeuristic: image, no text -> bleed', () => {
  assert.equal(classifyHeuristic(SRC({ imageCount: 1 })).layoutId, 'bleed');
});
test('classifyHeuristic: several parallel blocks -> cards', () => {
  const v = classifyHeuristic(SRC({
    title: 'T',
    paragraphs: ['A', 'B', 'C'],
    shapes: [{ paragraphs: ['A'] }, { paragraphs: ['B'] }, { paragraphs: ['C'] }],
  }));
  assert.equal(v.layoutId, 'cards');
});
test('classifyHeuristic: a single line is low-confidence (ambiguous)', () => {
  const v = classifyHeuristic(SRC({ title: 'T', paragraphs: ['só uma linha'], shapes: [{ paragraphs: ['só uma linha'] }] }));
  assert.ok(v.confidence < 0.6, 'should be uncertain enough to invite the AI fallback');
});

// ---- classifySlide (hybrid) ------------------------------------------------

test('classifySlide: high-confidence heuristic does NOT call the AI', async () => {
  let called = false;
  const ai = async () => { called = true; return { text: '{"layout":"cards"}' }; };
  const v = await classifySlide(SRC({ title: 'Capa' }), { ai }); // title-only -> cover @0.85
  assert.equal(v.layoutId, 'cover');
  assert.equal(v.source, 'heuristic');
  assert.equal(called, false, 'AI must not be consulted when confident');
});

test('classifySlide: low-confidence consults the AI and uses a valid answer', async () => {
  const ai = async () => ({ text: '```json\n{"layout":"cover"}\n```' });
  const ambiguous = SRC({ title: 'T', paragraphs: ['uma linha'], shapes: [{ paragraphs: ['uma linha'] }] });
  const v = await classifySlide(ambiguous, { ai });
  assert.equal(v.source, 'ai');
  assert.equal(v.layoutId, 'cover');
});

test('classifySlide: AI junk reply falls back to the heuristic', async () => {
  const ai = async () => ({ text: 'desculpe, não sei' });
  const ambiguous = SRC({ title: 'T', paragraphs: ['uma linha'], shapes: [{ paragraphs: ['uma linha'] }] });
  const v = await classifySlide(ambiguous, { ai });
  assert.equal(v.source, 'heuristic', 'invalid AI reply must not win');
});

test('classifySlide: AI throwing falls back to the heuristic', async () => {
  const ai = async () => { throw new Error('rate limited'); };
  const ambiguous = SRC({ title: 'T', paragraphs: ['uma linha'], shapes: [{ paragraphs: ['uma linha'] }] });
  const v = await classifySlide(ambiguous, { ai });
  assert.equal(v.source, 'heuristic');
});

test('classifySlide: no AI provided stays heuristic even when unsure', async () => {
  const ambiguous = SRC({ title: 'T', paragraphs: ['uma linha'], shapes: [{ paragraphs: ['uma linha'] }] });
  const v = await classifySlide(ambiguous, {});
  assert.equal(v.source, 'heuristic');
});

test('classifyAll: pairs every verdict with its source slide, in order', async () => {
  const slides = [SRC({ title: 'Capa' }), SRC({ imageCount: 1 })];
  const out = await classifyAll(slides);
  assert.deepEqual(out.map((x) => x.layoutId), ['cover', 'bleed']);
  assert.equal(out[0].src, slides[0]);
});

// ---- classify prompt + parse ----------------------------------------------

test('buildClassifyPrompt: lists the valid ids and asks for strict JSON', () => {
  const { system, messages } = buildClassifyPrompt(SRC({ title: 'T' }), ['cover', 'topics']);
  assert.ok(system.includes('cover') && system.includes('topics'));
  assert.ok(system.includes('{"layout"'));
  assert.ok(messages[0].content.includes('Título'));
});

test('parseClassifyResponse: rejects an id outside the allowed set', () => {
  assert.ok('error' in parseClassifyResponse('{"layout":"banana"}', ['cover', 'topics']));
  assert.equal(parseClassifyResponse('{"layout":"topics"}', ['cover', 'topics']).layoutId, 'topics');
});

// ---- buildSlide / buildDeck ------------------------------------------------

test('buildSlide: topics -> title + normalized {id,text} items', () => {
  const slide = buildSlide({ layoutId: 'topics', src: SRC({ title: 'Agenda', paragraphs: ['um', 'dois'] }) });
  assert.equal(slide.layout, 'topics');
  assert.equal(slide.slots.title, 'Agenda');
  assert.equal(slide.slots.topics.length, 2);
  assert.equal(slide.slots.topics[0].text, 'um');
  assert.equal(typeof slide.slots.topics[0].id, 'string', 'items get ids');
  assert.equal(slide.id != null, true);
  assert.deepEqual(slide.overrides, {});
});

test('buildSlide: cards -> one card per paragraph, composable body part', () => {
  const slide = buildSlide({ layoutId: 'cards', src: SRC({ title: 'Conceitos', paragraphs: ['LLM', 'Token'] }) });
  assert.equal(slide.slots.cards.length, 2);
  assert.deepEqual(slide.slots.cards[0].parts, { body: true });
  assert.equal(slide.slots.cards[0].text, 'LLM');
  assert.equal(typeof slide.slots.cards[1].id, 'string');
});

test('buildSlide: cover -> title + sub from first line, icon stays null', () => {
  const slide = buildSlide({ layoutId: 'cover', src: SRC({ title: 'Bem-vindos', paragraphs: ['Curso de IA'] }) });
  assert.equal(slide.slots.title, 'Bem-vindos');
  assert.equal(slide.slots.sub, 'Curso de IA');
  assert.equal(slide.slots.icon, null, 'image slot left empty for text-first v1');
});

test('buildSlide: split keeps image null but fills topics', () => {
  const slide = buildSlide({ layoutId: 'split', src: SRC({ title: 'T', paragraphs: ['a', 'b'] }) });
  assert.equal(slide.slots.image, null);
  assert.equal(slide.slots.topics.length, 2);
});

test('buildSlide: bleed -> caption from title', () => {
  const slide = buildSlide({ layoutId: 'bleed', src: SRC({ title: 'Frase de impacto' }) });
  assert.equal(slide.slots.caption, 'Frase de impacto');
  assert.equal(slide.slots.image, null);
});

test('buildSlide: unknown layout id falls back to a renderable layout', () => {
  const slide = buildSlide({ layoutId: 'does-not-exist', src: SRC({ title: 'T', paragraphs: ['x'] }) });
  assert.equal(slide.layout, 'topics');
});

test('buildDeck: maps every slide, sets the title, keeps theme/logo seed', () => {
  const deck = buildDeck(
    [
      { layoutId: 'cover', src: SRC({ title: 'Capa' }) },
      { layoutId: 'topics', src: SRC({ title: 'Agenda', paragraphs: ['a'] }) },
    ],
    { title: 'Curso importado' }
  );
  assert.equal(deck.title, 'Curso importado');
  assert.equal(deck.slides.length, 2);
  assert.equal(deck.slides[0].layout, 'cover');
  assert.ok(deck.theme && deck.logo, 'standard deck seed preserved');
  assert.ok(Array.isArray(deck.assets));
});

test('buildDeck: an empty import still yields a non-empty deck', () => {
  const deck = buildDeck([], { title: 'Vazio' });
  assert.ok(deck.slides.length >= 1, 'editor must always have a slide to open');
});

// ---- end-to-end: parse -> classify -> build --------------------------------

test('import pipeline: pptx bytes -> classified -> deck JSON', async () => {
  const bytes = pkg({
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>' +
      '<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/>' +
      '<p:sldId id="258" r:id="rId4"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="x">' +
      REL('rId2', 'slides/slide1.xml') + REL('rId3', 'slides/slide2.xml') +
      REL('rId4', 'slides/slide3.xml') + '</Relationships>',
    'ppt/slides/slide1.xml': slide(titleSp('ctrTitle', 'Direito & IA')),
    'ppt/slides/slide2.xml': slide(titleSp('title', 'Agenda') + bodySp(['Contexto', 'Riscos', 'Oportunidades'])),
    'ppt/slides/slide3.xml': slide(titleSp('title', 'Imagem') + bodySp(['legenda']) + PIC),
  });
  const { slides } = parsePptx(bytes);
  const classified = await classifyAll(slides); // no AI: heuristics only
  const deck = buildDeck(classified, { title: 'Aula' });

  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides[0].layout, 'cover');
  assert.equal(deck.slides[0].slots.title, 'Direito & IA'); // entity decoded end to end
  assert.equal(deck.slides[1].layout, 'topics');
  assert.equal(deck.slides[1].slots.topics.length, 3);
  assert.equal(deck.slides[2].layout, 'split'); // image + text
  assert.equal(deck.slides[2].slots.image, null);
  // every list item across the deck has a unique id
  const ids = deck.slides[1].slots.topics.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---- i18n keys -------------------------------------------------------------

test('import i18n keys exist in BOTH dictionaries', async () => {
  const PT = (await import('../i18n/pt.js')).default;
  const EN = (await import('../i18n/en.js')).default;
  const required = [
    'slides.import',
    'slides.import_default_title',
    'slides.importing',
    'slides.import_empty',
    'slides.import_error',
  ];
  for (const k of required) {
    assert.ok(k in PT, 'pt.js missing ' + k);
    assert.ok(k in EN, 'en.js missing ' + k);
  }
});
