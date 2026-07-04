// codex/js/file-text.js
// Client-side text extraction for the item importer: pull readable text out of a picked File
// (PDF via pdf.js, DOCX via mammoth, plain text/markdown directly). Returns '' when there is
// nothing to extract (an image, an unknown binary) so the caller can fall back to metadata.
// The parsers load lazily from the CDN via a <script> tag, once each (same pattern as marked.js).

function _loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) return resolve(window[globalName]);
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error('load_' + globalName)));
    s.onerror = () => reject(new Error('load_' + globalName));
    document.head.appendChild(s);
  });
}

const PDFJS_VER = '4.7.76';
let _pdfjs = null;
function _loadPdfjs() {
  if (!_pdfjs) {
    _pdfjs = _loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/build/pdf.min.js', 'pdfjsLib')
      .then((lib) => { lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/build/pdf.worker.min.js'; return lib; });
  }
  return _pdfjs;
}
let _mammoth = null;
function _loadMammoth() {
  if (!_mammoth) _mammoth = _loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
  return _mammoth;
}

async function _pdfText(file) {
  const lib = await _loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    parts.push(c.items.map((it) => it.str).join(' '));
  }
  return parts.join('\n\n').trim();
}
async function _docxText(file) {
  const mammoth = await _loadMammoth();
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return (res && res.value ? res.value : '').trim();
}

// A cheap type check (no parsing) so the UI can tell an extractable document (PDF/DOCX/text)
// from an image or other binary, which has no text and falls back to metadata.
export function hasExtractableText(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  return type === 'application/pdf' || type.indexOf('wordprocessingml') >= 0 || type.indexOf('text/') === 0
    || /\.(pdf|docx|txt|md|csv|json|html?)$/.test(name);
}

// extractText(file) -> Promise<string>. Empty string when there is nothing to extract; the
// caller then works from the metadata (filename, type). Never throws — a parser failure is ''.
export async function extractText(file) {
  if (!file) return '';
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  try {
    if (type === 'application/pdf' || name.endsWith('.pdf')) return await _pdfText(file);
    if (name.endsWith('.docx') || type.indexOf('wordprocessingml') >= 0) return await _docxText(file);
    if (type.indexOf('text/') === 0 || /\.(txt|md|csv|json|html?)$/.test(name)) return (await file.text()).trim();
  } catch (_) { /* fall through to '' — the caller uses metadata */ }
  return '';
}
