// js/item-list.js
// The ENGINE behind every "escolha itens do acervo" list. Pure: no DOM, no CSS, no markup,
// no state. Same split as js/list-tree.js, and for the same reason.
//
// Why it exists (Élder 2026-08-05, sobre o bloco de itens do projeto que eu tinha acabado de
// escrever): "na lista de itens do projeto, deve ser que nem a lista de liberações (não
// duplique)... a gente deve ter apenas uma lista de itens e cada local que utiliza só faz os
// filtros necessários". Ele estava certo, e é a MESMA correção que ele já tinha feito em
// 2026-07-17 e que fez nascer o list-tree.js. Eu tinha escrito um `<select>` próprio no
// item-members.js enquanto Liberações já montava seções por tipo, com glifo e ordem do
// registro `ct_types`. Duas listas divergem: uma ganha um tipo novo, a outra não.
//
// A objeção óbvia era "mas Liberações tem coisa que o editor de projeto não tem: checkbox,
// contagem de liberados, o aviso 'já na aula 3'". Élder respondeu: "o único problema é a
// tabela de releases que tem as necessidades próprias dela... então não é problema. o
// problema era construir do zero desde o começo". É exatamente a divisão motor/pintor: o
// motor entrega QUAIS itens, em QUE seções, em QUE ordem, com QUE glifo; cada tela pinta as
// colunas que só ela tem.
//
// Consumidores: content/releases.js (compositor de aula e de Outros) e content/item-members.js
// (os itens de um agrupador).
import { normalize } from './text-search.js';

// A ordem do registro `ct_types` manda; tipo fora do registro cai no fim, mas não some --
// um item com tipo desconhecido tem que continuar aparecendo, senão ele fica inatingível
// pela tela que deveria consertá-lo.
export function typeOrder(types) {
  const order = (types || []).map((tp) => tp.slug);
  return (a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  };
}

// Agrupa por tipo, na ordem do registro. Era o `_groupByType` particular do releases.js.
export function groupByType(items, types) {
  const cmp = typeOrder(types);
  const byType = new Map();
  (items || []).forEach((i) => {
    if (!byType.has(i.type)) byType.set(i.type, []);
    byType.get(i.type).push(i);
  });
  return Array.from(byType.keys()).sort(cmp).map((k) => ({ type: k, items: byType.get(k) }));
}

// As seções de uma lista de itens, uma por tipo.
//
//   opts.types        registro ct_types [{slug, label, icon}]
//   opts.labelOf      (slug) => rótulo   (i18n vence a label do banco; ver releases.js)
//   opts.iconOf       (slug) => ícone
//   opts.sortWithin   (slug, items) => items   (labs saem na ordem do registro deles)
//
// Retorna [{ key, type, label, icon, count, items }]. Sem HTML de propósito: o glifo vai como
// NOME de ícone, e quem pinta decide o tamanho e se ele vai antes do rótulo (vai, era o
// pedido do Élder: "vamos aproveitar para adicionar glifos antes do nome dos tipos").
export function sectionsByType(items, opts) {
  opts = opts || {};
  const labelOf = opts.labelOf || ((s) => s);
  const iconOf = opts.iconOf || (() => null);
  const sortWithin = opts.sortWithin || ((_s, list) => list);
  return groupByType(items, opts.types).map((g) => ({
    key: 'type-' + g.type,
    type: g.type,
    label: labelOf(g.type),
    icon: iconOf(g.type),
    count: g.items.length,
    items: sortWithin(g.type, g.items),
  }));
}

// Busca com a MESMA dobra de acento do resto do Codex (é o que faz "peticao" achar "Petição").
export function matchesQuery(item, query) {
  const q = normalize(String(query == null ? '' : query)).trim();
  if (!q) return true;
  return normalize(String((item && item.title) || '')).indexOf(q) !== -1;
}

// ── A árvore ────────────────────────────────────────────────────────────────
// Élder 2026-08-05: "alguns arquivos se juntam como irmãos em mesma hierarquia. outros pode
// se juntar aninhados que dá para mostrar com indentação e linhas laterais mostrando a
// ligação". As linhas laterais são o motivo desta função existir em vez de um `map` recursivo
// dentro do pintor: para saber SE desenhar o segmento vertical numa coluna, a linha precisa
// saber se cada ancestral dela era ou não o último irmão do seu nível. Um traço que continua
// abaixo do último filho é o defeito clássico de árvore em texto.
//
// Achata { children } em linhas:
//   { item, depth, isLast, guides:[bool] }   guides[k] = o ancestral do nível k ainda tem irmão
//                                            depois dele, então a coluna k leva traço vertical
export function flattenTree(nodes, depth, guides) {
  depth = depth || 0;
  guides = guides || [];
  const out = [];
  const list = nodes || [];
  list.forEach((n, idx) => {
    const isLast = idx === list.length - 1;
    out.push({ item: n, depth, isLast, guides: guides.slice() });
    const kids = n && n.children;
    if (kids && kids.length) out.push(...flattenTree(kids, depth + 1, guides.concat(!isLast)));
  });
  return out;
}

// Os ids já presentes na árvore, em qualquer profundidade. Quem escolhe itens usa para não
// oferecer de novo o que já está dentro.
export function idsInTree(nodes) {
  const out = new Set();
  flattenTree(nodes).forEach((r) => out.add(Number(r.item.id)));
  return out;
}

// Um item pode conter outro? Só não pode conter a SI MESMO nem um ANCESTRAL seu -- isso é
// ciclo, e a trilha entraria em recursão ao montar o cartão. Nada além disso é proibido:
// a guarda antiga barrava agrupador dentro de agrupador, que era defensiva e o Élder
// derrubou ("o erro é criar superfícies não flexíveis de cara, depois dá muito mais
// trabalho"). O Worker rejeita ciclo de novo no save; esta é a versão da tela, para não
// oferecer o que vai voltar erro.
export function selectableItems(all, parentId, ancestorIds) {
  const barred = new Set([Number(parentId)]);
  (ancestorIds || []).forEach((id) => barred.add(Number(id)));
  return (all || []).filter((i) => !barred.has(Number(i.id)));
}
