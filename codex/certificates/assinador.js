// certificates/assinador.js
// The signing page loaded inside the "Assinador PensoIA" desktop app (a thin
// pywebview window). It reuses the REAL cert renderer (so the signed PDF is
// pixel-identical to the app's Baixar PDF), lists the certs awaiting signature,
// and for each: renders the PDF here, hands it to the local app bridge to sign
// with the A1 e-CNPJ (window.pywebview.api), then uploads the signed PDF and
// flips status to 'signed'. The private key only ever lives in the local app.
//
// Opened in a normal browser (no pywebview bridge) it still lists certs but can't
// sign — it shows a "open in the app" notice instead.
// Globals injected by the pywebview host / boot:
//   window.callWorker (Worker transport, set by the import below); window.pywebview.api
//   (desktop bridge); window.WORKER_URL (set on boot); window.bsLog (debug pill)
import '../js/worker-call.js'; // sets window.callWorker (defaults to codex-api)
import { certificates as api } from '../js/codex-api.js';
import { renderCertsPdfBase64 } from './cert-pdf.js';
import { renderCertHtml, buildValidarUrl, formatIssuedOn } from './certificates.js';
import { glyphWordmark, stdColors } from '../js/brand-logos.js';

window.WORKER_URL = 'https://codex-api.pensoia.workers.dev';

const $ = (s) => document.querySelector(s);

// Real PensoIA lockup (filled artwork, same as the certs). Dark page -> navy recipe
// (white wordmark + teal accent).
const _logo = $('#brandLogo'); if (_logo) _logo.innerHTML = glyphWordmark(stdColors('navy'));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── local-app bridge detection ────────────────────────────────────────────────
// pywebview injects window.pywebview.api asynchronously and fires `pywebviewready`.
let APP = !!(window.pywebview && window.pywebview.api);
window.addEventListener('pywebviewready', () => { APP = true; $('#needApp').classList.add('hide'); bootInApp(); });
setTimeout(() => { if (!APP && !(window.pywebview && window.pywebview.api)) $('#needApp').classList.remove('hide'); }, 1200);
const inApp = () => APP || !!(window.pywebview && window.pywebview.api);

let _certsByCode = {};
const _pfx = { chosen: false };
function log(m) { $('#log').textContent = m; }

// ── boot (track-58) ─────────────────────────────────────────────────────────
// No human credential, ever: the app has no browser session of its own (its own
// isolated pywebview profile) and Élder does not want to type anything to open it.
// window.pywebview.api.get_app_key() returns a static per-app secret that lives
// ONLY in the local desktop build (never in this public repo); it rides in the
// SAME bs_pw_hash slot every other codex-api call already reads, so nothing else
// in this file (or the shared facade) needs to change.
let _booted = false;
async function bootInApp() {
  if (_booted || !inApp()) return;
  _booted = true;
  $('#certPanel').classList.remove('hide');
  $('#listPanel').classList.remove('hide');
  let key;
  try { key = await window.pywebview.api.get_app_key(); } catch (_) { key = null; }
  if (!key) {
    $('#listWrap').innerHTML = '<div class="st err">Não consegui obter a chave do app. Reinstale o Assinador.</div>';
    return;
  }
  localStorage.setItem('bs_pw_hash', key);
  await loadCerts();
}
if (inApp()) bootInApp();

// ── certificate (.pfx) pick ───────────────────────────────────────────────────
async function choosePfx() {
  if (!inApp()) { $('#needApp').classList.remove('hide'); return; }
  let r;
  try { r = await window.pywebview.api.choose_pfx(); }
  catch (e) { log('Erro ao abrir o seletor: ' + (e && e.message || e)); return; }
  if (r && r.name) { _pfx.chosen = true; $('#pfxName').textContent = r.name; }
  else if (r && r.error) { log('Não consegui usar esse arquivo: ' + r.error); }
}

// ── load certs awaiting signature (status = issued) ───────────────────────────
async function loadCerts() {
  const wrap = $('#listWrap');
  wrap.innerHTML = '<div class="st" style="color:var(--mut)">Carregando…</div>';
  let res;
  try { res = await api.list({ status: 'issued' }); }
  catch (e) { wrap.innerHTML = '<div class="st err">Falha ao carregar: ' + esc(e && e.message || e) + '</div>'; return; }
  const certs = (res && res.certificates) || [];
  _certsByCode = {};
  certs.forEach((c) => { _certsByCode[c.code] = c; });
  if (!certs.length) { wrap.innerHTML = '<div class="st" style="color:var(--mut)">Nenhum certificado aguardando assinatura.</div>'; syncSign(); return; }
  wrap.innerHTML =
    '<table><thead><tr><th style="width:34px"></th><th>Aluno</th><th>Código</th><th>Curso</th><th>Emitido</th><th>Status</th></tr></thead><tbody>' +
    certs.map((c) =>
      '<tr id="row-' + esc(c.code) + '">' +
        '<td><input type="checkbox" class="selrow" data-code="' + esc(c.code) + '"></td>' +
        '<td>' + esc(c.holder_name || '') + '</td>' +
        '<td><code>' + esc(c.code) + '</code></td>' +
        '<td>' + esc(c.course_title || '') + '</td>' +
        '<td>' + esc(formatIssuedOn(c.issued_on)) + '</td>' +
        '<td class="st" id="st-' + esc(c.code) + '"></td>' +
      '</tr>').join('') +
    '</tbody></table>';
  wrap.querySelectorAll('.selrow').forEach((cb) => cb.addEventListener('change', syncSign));
  $('#selAll').checked = false;
  syncSign();
}

function selectedCodes() {
  return Array.from(document.querySelectorAll('.selrow:checked')).map((cb) => cb.getAttribute('data-code'));
}
function syncSign() { $('#signBtn').disabled = selectedCodes().length === 0; }
function setSt(code, kind, text) { const el = $('#st-' + code); if (el) { el.className = 'st ' + kind; el.textContent = text; } }

// ── sign the selected certs ───────────────────────────────────────────────────
async function signSelected() {
  if (!inApp()) { $('#needApp').classList.remove('hide'); return; }
  const codes = selectedCodes();
  if (!codes.length) return;
  if (!_pfx.chosen) { log('Selecione o arquivo .pfx primeiro.'); return; }
  const pfxPw = $('#pfxPw').value;
  if (!pfxPw) { log('Digite a senha do certificado.'); return; }

  busy(true);
  log('Abrindo o certificado digital…');
  let unlocked;
  try { unlocked = await window.pywebview.api.unlock(pfxPw); }
  catch (e) { unlocked = { error: (e && e.message) || String(e) }; }
  if (!unlocked || !unlocked.ok) { log('Não consegui abrir o .pfx (senha errada?): ' + ((unlocked && unlocked.error) || 'erro')); busy(false); return; }

  let ok = 0, fail = 0;
  const origin = location.origin;
  for (const code of codes) {
    const cert = _certsByCode[code];
    if (!cert) { fail++; continue; }
    setSt(code, 'work', 'assinando…');
    try {
      // Render the cert AS signed so the "Certificado assinado digitalmente ·
      // ICP-Brasil" line is baked INTO the PDF we are about to sign (the renderer
      // keys that note on status === 'signed'). Without this the cryptographic
      // signature lands but the visible line is missing from the downloaded PDF.
      // The signer CN would need the local bridge to return it (an .exe change);
      // until then the generic ICP-Brasil line is shown.
      const signedCert = Object.assign({}, cert, { status: 'signed' });
      const b64 = await renderCertsPdfBase64([{ html: renderCertHtml(signedCert, origin), qrUrl: buildValidarUrl(origin, code) }]);
      if (!b64) throw new Error('falha ao gerar o PDF');
      const signed = await window.pywebview.api.sign(b64);
      if (!signed || signed.error) throw new Error((signed && signed.error) || 'falha na assinatura');
      await api.attachPdf({ code, pdf_b64: signed.signed_b64 });
      await api.markSigned({ code });
      setSt(code, 'ok', '✓ assinado');
      const row = $('#row-' + code); if (row) row.classList.add('done');
      ok++;
    } catch (e) {
      setSt(code, 'err', '✗ ' + (e && e.message || e));
      fail++;
    }
  }
  try { await window.pywebview.api.lock(); } catch (_) { /* best-effort: drop the key */ }
  $('#pfxPw').value = '';
  log('Pronto: ' + ok + ' assinado(s)' + (fail ? ', ' + fail + ' com erro' : '') + '. Atualizando a lista…');
  busy(false);
  await loadCerts();
}

function busy(b) {
  ['#signBtn', '#refreshBtn', '#pfxBtn'].forEach((s) => { const el = $(s); if (el) el.disabled = b; });
  if (!b) syncSign();
}

// ── wire ──────────────────────────────────────────────────────────────────────
$('#pfxBtn').addEventListener('click', choosePfx);
$('#refreshBtn').addEventListener('click', loadCerts);
$('#signBtn').addEventListener('click', signSelected);
$('#selAll').addEventListener('change', (e) => {
  document.querySelectorAll('.selrow').forEach((cb) => { cb.checked = e.target.checked; });
  syncSign();
});
