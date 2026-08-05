// codex/trilha/js/projeto.js
// O cartão de um item EMBALADOR (tipo `projeto`): abrir mostra os filhos listados, e cada
// filho abre, copia e baixa como qualquer item da trilha.
//
// Élder 2026-08-04: "quando eu insiro o projeto na trilha não aparecem os 3 itens
// separadamente, aparece o projeto, e quando eu abro ele aparecem listados os 3 itens. cada um
// eu posso abrir independentemente mas eles são dentro do projeto".
//
// A economia que faz isto ser pequeno: `buildSub()` já constrói a linha de um item com ações e
// expansão, e `toggleSub()` já fecha os irmãos olhando o `parentNode`. Montando os filhos com o
// MESMO buildSub dentro de um container próprio, fechar um filho ao abrir outro sai correto
// sozinho, sem uma linha de estado aqui.
import { esc } from './utils.js';

export function isProjeto(item) {
  return !!item && Array.isArray(item.children) && item.children.length > 0;
}

// Renderiza o corpo do projeto em `host`. `buildSub` chega por parâmetro (e não por import)
// porque sub.js já importa este módulo: importar de volta fecharia o ciclo.
export function renderProjeto(item, host, buildSub, opts = {}) {
  host.innerHTML = '';
  if (item.body_md) {
    const intro = document.createElement('p');
    intro.className = 'cdx-tr-proj-intro';
    intro.textContent = item.body_md;
    host.appendChild(intro);
  }
  const count = document.createElement('p');
  count.className = 'cdx-tr-proj-count';
  const n = item.children.length;
  count.textContent = n + (n === 1 ? ' item neste projeto' : ' itens neste projeto');
  host.appendChild(count);

  const list = document.createElement('div');
  list.className = 'cdx-tr-proj-list';
  item.children.forEach((child) => list.appendChild(buildSub(child, opts)));
  host.appendChild(list);
}

// Rótulo do pacote, usado no nome do .zip e no menu.
export function projectLabel(item) {
  return esc(item && item.title ? String(item.title).replace(/^#+\s*/, '') : 'projeto');
}
