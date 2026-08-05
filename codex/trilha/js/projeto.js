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
import { renderItem } from '../../js/item-render.js';

// Qualquer item que carregue outros, não só o tipo `projeto`. Élder 2026-08-05: "uma tarefa
// precisa às vezes de documentos dentro para o aluno baixar, não é só a tarefa". A checagem
// sempre foi por CONTEÚDO (tem filhos?) e não por tipo, então já servia; o que mudou é que
// agora isso é intencional em vez de acidental.
export function isProjeto(item) {
  return !!item && Array.isArray(item.children) && item.children.length > 0;
}

// Renderiza o corpo do item em `host`, seguido dos filhos. `buildSub` chega por parâmetro (e
// não por import) porque sub.js já importa este módulo: importar de volta fecharia o ciclo.
//
// O corpo passa pelo renderItem NORMAL, e não mais como texto cru. Enquanto isto só valia
// para `projeto` o cru bastava (o corpo é uma frase de apresentação); com uma TAREFA levando
// documentos dentro, o corpo é o enunciado dela e tem que sair renderizado como sairia se ela
// não tivesse filho nenhum.
//
// O aninhamento sai de graça: cada filho é montado pelo mesmo buildSub, e abrir um filho
// refaz o ct_get_item_public, que devolve os filhos DELE -- então este mesmo renderizador
// roda de novo um nível abaixo, sem recursão escrita aqui.
export function renderProjeto(item, host, buildSub, opts = {}) {
  host.innerHTML = '';
  if (item.body_md) {
    const body = document.createElement('div');
    body.className = 'cdx-tr-proj-intro';
    host.appendChild(body);
    // `children: null` de propósito: o renderItem também sabe listar os filhos (é o que a
    // prévia do admin usa), e a trilha passa `preview: true` como qualquer tela. Sem tirar,
    // a lista somente-leitura sairia empilhada em cima da lista de verdade, a que abre,
    // copia e baixa. Aqui quem pinta os filhos é este módulo.
    renderItem(Object.assign({}, item, { children: null }), body, { preview: true });
  }
  const count = document.createElement('p');
  count.className = 'cdx-tr-proj-count';
  const n = item.children.length;
  count.textContent = n + (n === 1 ? ' item dentro' : ' itens dentro');
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
