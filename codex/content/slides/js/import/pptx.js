// import/pptx.js, read a .pptx (an OOXML zip) and pull each slide's text +
// rough structure. Pure and dependency-free beyond the vendored fflate unzip, so
// it runs identically in the browser and under `node --test` (no DOMParser).
//
// We do NOT parse the whole OOXML object model, only what the layout classifier
// needs: per slide, the title-placeholder text, the body paragraphs grouped by
// shape, and a picture count. PowerPoint/Google-Slides output is regular enough
// that a targeted scan over the well-formed XML is reliable for this slice.
//
// Exports:
//   parsePptx(bytes)            -> { slides: SourceSlide[] }   (bytes: Uint8Array)
//   parseSlideXml(xml, index)   -> SourceSlide                 (pure, testable)
//   SourceSlide = { index, title, shapes:[{paragraphs:string[]}],
//                   paragraphs:string[], imageCount }
import { unzipSync, strFromU8 } from '../vendor/fflate.js';

// ---- XML scanning helpers (no DOM) -----------------------------------------

const ENTS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ENTS[n])
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// All <a:t>…</a:t> text inside a block, in order, decoded and joined.
function runsText(block) {
  let out = '';
  for (const m of block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) out += m[1];
  return decodeXml(out);
}

// One string per <a:p> paragraph that carries text (empty paragraphs dropped).
function paragraphsOf(block) {
  const paras = [];
  for (const m of block.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    const txt = runsText(m[0]).trim();
    if (txt) paras.push(txt);
  }
  return paras;
}

// A shape is the title if its placeholder is type "title" or "ctrTitle".
function isTitleShape(shapeXml) {
  return /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shapeXml);
}

// ---- per-slide parse --------------------------------------------------------

export function parseSlideXml(xml, index) {
  xml = xml || '';
  let title = '';
  const shapes = [];
  for (const m of xml.matchAll(/<p:sp[ >][\s\S]*?<\/p:sp>/g)) {
    const shapeXml = m[0];
    const paras = paragraphsOf(shapeXml);
    if (isTitleShape(shapeXml)) {
      if (!title) title = paras.join(' ').trim();
    } else if (paras.length) {
      shapes.push({ paragraphs: paras });
    }
  }
  const paragraphs = shapes.flatMap((s) => s.paragraphs);
  const imageCount = (xml.match(/<p:pic[ >]/g) || []).length;
  return { index, title, shapes, paragraphs, imageCount };
}

// ---- zip + ordering ---------------------------------------------------------

// A relationship Target is relative to ppt/ (the rels live in ppt/_rels/).
function normalizeSlidePath(target) {
  let t = String(target || '').replace(/^\.\//, '');
  if (t.startsWith('/')) return t.slice(1);          // absolute within the zip
  if (t.startsWith('ppt/')) return t;
  return 'ppt/' + t;                                  // e.g. slides/slide1.xml
}

function slideNum(path) {
  const m = path.match(/slide(\d+)\.xml$/);
  return m ? +m[1] : 0;
}

// Slide file paths in PRESENTATION order (sldIdLst + rels). Falls back to a
// numeric sort of ppt/slides/slideN.xml when the manifest is missing/empty.
export function slidePathsInOrder(files, read) {
  const relsXml = read('ppt/_rels/presentation.xml.rels');
  const presXml = read('ppt/presentation.xml');
  if (relsXml && presXml) {
    const idToTarget = {};
    for (const tag of relsXml.match(/<Relationship\b[^>]*?\/?>/g) || []) {
      const id = (tag.match(/\bId="([^"]+)"/) || [])[1];
      const target = (tag.match(/\bTarget="([^"]+)"/) || [])[1];
      if (id && target) idToTarget[id] = target;
    }
    const ordered = [];
    for (const m of presXml.matchAll(/<p:sldId\b[^>]*?\br:id="([^"]+)"/g)) {
      const t = idToTarget[m[1]];
      if (t && files[normalizeSlidePath(t)]) ordered.push(normalizeSlidePath(t));
    }
    if (ordered.length) return ordered;
  }
  return Object.keys(files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b));
}

// parsePptx, unzip the .pptx and parse every slide in order. Only the XML/rels
// parts are extracted; media (images) is skipped so a large deck's pictures are
// never decompressed into memory (text-first import, image presence is still seen
// via the <p:pic> elements inside the slide XML).
export function parsePptx(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const files = unzipSync(u8, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  const read = (p) => (files[p] ? strFromU8(files[p]) : null);
  const paths = slidePathsInOrder(files, read);
  const slides = paths.map((p, i) => parseSlideXml(read(p) || '', i));
  return { slides };
}
