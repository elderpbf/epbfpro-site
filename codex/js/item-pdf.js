// js/item-pdf.js
// Markdown -> PDF, in the browser, for a trail item.
//
// The rule is Élder's, from 2026-08-04: "se o usuário vê o markdown processado, ao invés dos
// símbolos em si, deve ser pdf com tudo formatadinho. se o usuário na trilha vê os símbolos do
// markdown, então é md". Verbatim text (a prompt) goes out as .md and is handled by
// item-download.js; everything the student reads RENDERED comes out here.
//
// Why not cert-pdf.js, which already makes PDFs: it rasterizes the DOM through
// modern-screenshot, because a certificate is a fixed A4 sheet where pixel fidelity was the
// point. Prose of variable length rasterized gives text you cannot select, cannot search, and
// pagination somebody has to compute by hand. What IS reused is the vendored binary itself
// (certificates/vendor/jspdf.umd.min.js), never the module around it.
//
// Why jsPDF's text API and not its .html(): .html() delegates to html2canvas, which is not
// vendored and which rasterizes -- the same defect, arrived at by a longer road. Laying out the
// blocks directly keeps the text real, and markdown for reading is a small enough grammar that
// the layout fits on one screen.
import { fileNameFromTitle } from './item-download.js';

const JSPDF_SRC = new URL('../certificates/vendor/jspdf.umd.min.js', import.meta.url).href;

let _jsPDFP = null;
function _loadJsPDF() {
  if (_jsPDFP) return _jsPDFP;
  _jsPDFP = new Promise((resolve, reject) => {
    const have = window.jspdf && window.jspdf.jsPDF;
    if (have) { resolve(have); return; }
    const s = document.createElement('script');
    s.src = JSPDF_SRC;
    s.onload = () => {
      const g = window.jspdf && window.jspdf.jsPDF;
      g ? resolve(g) : reject(new Error('jsPDF global missing after load'));
    };
    s.onerror = () => reject(new Error('failed to load ' + JSPDF_SRC));
    document.head.appendChild(s);
  }).catch((e) => { _jsPDFP = null; throw e; });
  return _jsPDFP;
}

// PURE. Markdown -> a flat list of blocks to lay out. Deliberately small: this serves the prose
// the trail actually holds (headings, paragraphs, lists, quotes, fenced code), not every corner
// of the spec. A construct with no block of its own survives as its own text rather than
// disappearing, because losing a line of the author's content is far worse than losing its
// styling.
export function mdToBlocks(md) {
  const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let code = null;

  const flushPara = () => {
    if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    // A fence swallows everything until it closes: inside it, markdown syntax is content.
    if (/^\s*```/.test(line)) {
      if (code) { out.push({ kind: 'code', text: code.join('\n') }); code = null; }
      else { flushPara(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }

    if (!line.trim()) { flushPara(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      out.push({ kind: 'h' + Math.min(3, h[1].length), text: _inline(h[2]) });
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) { flushPara(); out.push({ kind: 'hr' }); continue; }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const bullet = /^\d/.test(li[1]) ? li[1].replace(/[.)]$/, '.') + ' ' : '• ';
      out.push({ kind: 'li', text: bullet + _inline(li[2]), indent: Math.floor((/^\s*/.exec(line)[0].length) / 2) });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) { flushPara(); out.push({ kind: 'quote', text: _inline(q[1]) }); continue; }

    para.push(_inline(line.trim()));
  }
  flushPara();
  if (code) out.push({ kind: 'code', text: code.join('\n') });
  return out;
}

// Inline marks are stripped, not rendered. jsPDF changes font per drawn string, so honouring
// bold mid-paragraph means splitting every line into runs and measuring each -- a lot of
// machinery for emphasis in a document meant to be read. The WORDS all survive; only the
// asterisks go. Links keep their text and their URL, because a URL that vanishes is content
// that vanished.
function _inline(s) {
  return String(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}

// The page geometry, in points, A4 portrait. Exported so the layout test can do the arithmetic
// without a jsPDF instance.
export const PAGE = { w: 595.28, h: 841.89, margin: 56, bottom: 56 };

const STYLE = {
  h1:    { size: 19, style: 'bold',   before: 16, after: 8,  font: 'helvetica' },
  h2:    { size: 15, style: 'bold',   before: 14, after: 6,  font: 'helvetica' },
  h3:    { size: 12.5, style: 'bold', before: 12, after: 5,  font: 'helvetica' },
  p:     { size: 11, style: 'normal', before: 0,  after: 9,  font: 'helvetica' },
  li:    { size: 11, style: 'normal', before: 0,  after: 4,  font: 'helvetica' },
  quote: { size: 11, style: 'italic', before: 4,  after: 8,  font: 'helvetica' },
  code:  { size: 9.5, style: 'normal', before: 6, after: 10, font: 'courier' },
};

// Build the document. `doc` is injected so a test can drive the layout with a stub and assert
// the page breaks without loading a 300KB binary.
export function layout(doc, blocks, title) {
  const width = PAGE.w - PAGE.margin * 2;
  let y = PAGE.margin;

  const newPage = () => { doc.addPage(); y = PAGE.margin; };

  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    const head = doc.splitTextToSize(String(title).replace(/^#+\s*/, ''), width);
    head.forEach((ln) => { doc.text(ln, PAGE.margin, y); y += 24; });
    y += 8;
  }

  blocks.forEach((b) => {
    if (b.kind === 'hr') {
      y += 6;
      if (y > PAGE.h - PAGE.bottom) newPage();
      doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
      y += 12;
      return;
    }
    const st = STYLE[b.kind] || STYLE.p;
    const indent = (b.indent || 0) * 14;
    doc.setFont(st.font, st.style);
    doc.setFontSize(st.size);
    const lineH = st.size * 1.38;
    const lines = doc.splitTextToSize(String(b.text == null ? '' : b.text), width - indent);
    y += st.before;
    lines.forEach((ln) => {
      // The break is decided PER LINE, not per block: a block longer than a page would run off
      // the bottom if the check happened only on the way in.
      if (y + lineH > PAGE.h - PAGE.bottom) newPage();
      doc.text(ln, PAGE.margin + indent, y);
      y += lineH;
    });
    y += st.after;
  });
  return doc;
}

// Browser: build the PDF for one item's markdown and hand it to the user.
export async function downloadItemPdf(item) {
  const jsPDF = await _loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  layout(doc, mdToBlocks(item && item.body_md), item && item.title);
  doc.save(fileNameFromTitle(item && item.title, 'pdf'));
}

// The bytes, for the zip. Same document, no download.
export async function itemPdfBytes(item) {
  const jsPDF = await _loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  layout(doc, mdToBlocks(item && item.body_md), item && item.title);
  return new Uint8Array(doc.output('arraybuffer'));
}
