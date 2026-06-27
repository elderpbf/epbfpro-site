// certificates/cert-pdf.js
// Generate a downloadable certificate PDF by rasterizing the exact rendered cert
// sheets (front + back) straight into a jsPDF — NO browser print dialog.
//
// Why not window.print(): the interactive print dialog rasterizes differently per
// browser/OS (shifted elements, dropped gradients, missing logo, backing boxes).
// modern-screenshot renders the live DOM (which already looks correct) to a canvas
// via a foreignObject SVG, so the PDF is pixel-for-pixel what the user sees. This
// engine won a side-by-side bake-off against the print dialog and html2canvas
// (see the retired pdf-lab.html).
//
// jsPDF + modern-screenshot are vendored as self-contained UMD bundles in ./vendor
// and lazy-loaded (≈400KB) on the first download, not at page load.
import { hydrate, autofitNames, autofitCurriculum } from './cert-render.js';
import { generateQrSvg } from './vendor/qr.js';

const JSPDF_SRC = new URL('./vendor/jspdf.umd.min.js', import.meta.url).href;
const MS_SRC    = new URL('./vendor/modern-screenshot.umd.js', import.meta.url).href;

let _libsP = null;
function _loadLibs() {
  if (_libsP) return _libsP;
  _libsP = Promise.all([
    _loadScript(JSPDF_SRC, () => (window.jspdf && window.jspdf.jsPDF)),
    _loadScript(MS_SRC,    () => window.modernScreenshot),
  ]).then(([jsPDF, ms]) => ({ jsPDF, ms })).catch((e) => { _libsP = null; throw e; });
  return _libsP;
}

function _loadScript(src, getGlobal) {
  return new Promise((resolve, reject) => {
    const have = getGlobal();
    if (have) { resolve(have); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { const g = getGlobal(); g ? resolve(g) : reject(new Error('lib global missing after load: ' + src)); };
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

// Mount the cert HTML off-screen at natural A4 size and hydrate the logo + QR so it
// renders exactly like the on-screen sheet, ready to rasterize.
function _mountOffscreen(html, qrUrl) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  host.innerHTML = html;
  document.body.appendChild(host);
  hydrate(host, { qr: generateQrSvg, qrUrl });
  return host;
}

// Build the jsPDF document for N certs (front + back page per cert), rasterized
// from the live render. Shared by the download path and the base64 export below,
// so a cert looks identical whether it is saved to disk, uploaded to R2, or
// attached to an e-mail. Browser-only (needs the DOM + the vendored libs).
async function _buildCertsDoc(items, opts) {
  opts = opts || {};
  const scale   = opts.scale || 3;        // ~288 DPI on A4 landscape
  const quality = opts.quality || 0.96;   // JPEG, keeps each page ~0.5–1MB
  const { jsPDF, ms } = await _loadLibs();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) { /* fonts optional */ }
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let first = true;
  for (let i = 0; i < items.length; i++) {
    if (opts.onStep) opts.onStep(i, items.length);
    const host = _mountOffscreen(items[i].html, items[i].qrUrl);
    autofitNames(host);
    autofitCurriculum(host);
    try {
      const sheets = host.querySelectorAll('.cdxc-sheet');
      for (const sheet of sheets) {
        const canvas = await ms.domToCanvas(sheet, { scale });
        const img = canvas.toDataURL('image/jpeg', quality);
        if (!first) doc.addPage('a4', 'landscape');
        first = false;
        doc.addImage(img, 'JPEG', 0, 0, W, H);
      }
    } finally {
      host.remove();
    }
  }
  return doc;
}

/**
 * Build and download ONE PDF holding N certificates (front + back page per cert),
 * rasterized from the live render. Browser-only (needs the DOM + the vendored libs).
 * @param {Array<{html:string, qrUrl:string}>} items  rendered+hydratable cert HTML
 * @param {{filename?:string, scale?:number, quality?:number, onStep?:(i:number,n:number)=>void}} [opts]
 * @returns {Promise<void>}
 */
export async function downloadCertsPdf(items, opts) {
  opts = opts || {};
  const list = (items || []).filter(Boolean);
  if (!list.length) return;
  const doc = await _buildCertsDoc(list, opts);
  doc.save(opts.filename || 'certificado.pdf');
}

/**
 * Build ONE PDF for N certificates and return its bytes as raw base64 (no
 * download), for uploading (cert_attach_pdf → R2) or attaching to an e-mail.
 * Same rasterization as downloadCertsPdf, so the file is identical. Browser-only.
 * @param {Array<{html:string, qrUrl:string}>} items  rendered+hydratable cert HTML
 * @param {{scale?:number, quality?:number, onStep?:(i:number,n:number)=>void}} [opts]
 * @returns {Promise<string|null>} base64 of the PDF bytes, or null when no items
 */
export async function renderCertsPdfBase64(items, opts) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const doc = await _buildCertsDoc(list, opts);
  const uri = doc.output('datauristring'); // data:application/pdf;...;base64,XXXX
  const at = uri.indexOf('base64,');
  return at === -1 ? null : uri.slice(at + 'base64,'.length);
}
