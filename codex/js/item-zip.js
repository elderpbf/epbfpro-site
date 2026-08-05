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

// entries: [{ title, text, dir? }]. `dir` é o caminho da pasta, já terminado em '/' ('' na
// raiz). Devolve os bytes do zip.
//
// O aninhamento vira PASTA (Élder 2026-08-05: um agrupador pode conter outro). A checagem de
// colisão é POR PASTA e não global: dois "modelo.md" em pastas diferentes são dois arquivos
// legítimos, e numerar o segundo só porque um xará existe noutro lugar seria renomear sem
// motivo o que o autor nomeou.
export function buildZip(entries, ext = 'md') {
  const byDir = new Map();
  entries.forEach((e, i) => {
    const d = (e && e.dir) || '';
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(i);
  });
  const names = new Array(entries.length);
  byDir.forEach((idxs, dir) => {
    uniqueNames(idxs.map((i) => entries[i].title), ext).forEach((n, k) => { names[idxs[k]] = dir + n; });
  });
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
