// js/item-zip.js
// Empacota vários textos num .zip, no browser, sem rede.
//
// fflate já estava vendorizado (o importador de .pptx do Slides o usa para DESzipar); aqui
// ele zipa. Zero dependência nova, zero CDN.
//
// Modo `store` (level 0) de propósito: markdown já é pequeno e o ganho de comprimir não paga
// o custo em aparelho fraco. Se um dia entrar PDF/imagem no pacote, eles já vêm comprimidos.
import { zipSync, strToU8 } from './vendor/fflate.js';
import { uniqueNames } from './item-download.js';

// entries: [{ title, text }]. Devolve os bytes do zip.
export function buildZip(entries, ext = 'md') {
  const names = uniqueNames(entries.map((e) => e.title), ext);
  const files = {};
  entries.forEach((e, i) => { files[names[i]] = strToU8(e.text == null ? '' : String(e.text)); });
  return zipSync(files, { level: 0 });
}

// Browser-only: monta o zip e dispara o download.
export function downloadZip(entries, filename, ext = 'md') {
  const url = URL.createObjectURL(new Blob([buildZip(entries, ext)], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
