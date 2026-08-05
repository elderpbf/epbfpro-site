// content/item-members.js
// O bloco "itens deste agrupador" do editor: QUAIS itens um item contém, em ordem.
//
// Vive num módulo próprio (e não dentro do item-form) porque agrupar não é privilégio do tipo
// `projeto`: skill, trilha guiada, uma TAREFA que leva documentos para o aluno baixar, todos
// usam a MESMA lista. Um bloco por tipo divergiria (codex/CLAUDE.md).
//
// É um PINTOR sobre js/item-list.js, não uma lista própria. A primeira versão deste arquivo
// tinha um `<select>` inventado aqui enquanto Liberações já montava seções por tipo, com
// glifo e a ordem do registro `ct_types`. Élder pegou (2026-08-05): "na lista de itens do
// projeto, deve ser que nem a lista de liberações (não duplique)... a gente deve ter apenas
// uma lista de itens e cada local que utiliza só faz os filtros necessários". As classes de
// pintura são as mesmas `.cdx-picker*` do compositor de liberações, então as duas telas
// também não divergem no pixel.
//
// Guarda só ids. Quem persiste é o item-form, depois do save, via api.setItemMembers -- um
// item novo ainda não tem id para ser pai.
import { esc as _esc } from '../js/dom.js';
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import { sectionsByType, matchesQuery, selectableItems, flattenTree, idsInTree } from '../js/item-list.js';
import { isDownloadable } from '../js/item-download.js';

export { selectableItems };

// As linhas de guia de UMA linha da árvore. `guides[k]` = o ancestral do nível k ainda tem
// irmão depois dele, então aquela coluna leva traço vertical; senão fica vazia. Sem isso o
// traço continua descendo embaixo do último filho, que é o defeito clássico de árvore em
// texto. Puro e exportado porque é a única parte com regra de verdade aqui.
export function guideHtml(guides, isLast, depth) {
  if (!depth) return '';
  const cols = (guides || []).slice(0, depth - 1)
    .map((on) => '<span class="cdx-mem-guide' + (on ? ' is-line' : '') + '"></span>').join('');
  return cols + '<span class="cdx-mem-elbow' + (isLast ? ' is-last' : '') + '"></span>';
}

export function mount(host, opts = {}) {
  const parentId = opts.parentId || null;
  // Só o primeiro nível é editável AQUI. Um filho que é agrupador mostra os netos, mas quem
  // edita a lista dele é o editor DELE -- um editor aninhado dentro do editor seria uma
  // segunda superfície de edição da mesma coisa, e é o que este arquivo existe para evitar.
  let chosen = (opts.children || []).map(_norm);
  let pool = [];
  let types = [];
  let query = '';
  const onChange = opts.onChange || function () {};

  function _norm(c) {
    return {
      id: Number(c.id), title: c.title, type: c.type || '',
      type_label: c.type_label || c.type || '',
      children: Array.isArray(c.children) ? c.children.map(_norm) : null,
    };
  }

  function _typeLabel(slug) {
    const ty = types.find((x) => x.slug === slug);
    return (ty && ty.label) || slug;
  }
  function _typeIcon(slug) {
    const ty = types.find((x) => x.slug === slug);
    return ty && ty.icon;
  }

  // ── A árvore do que já está dentro ───────────────────────────────────────
  function treeHtml() {
    if (!chosen.length) return '<li class="cdx-mem-empty">' + t('editor.members_empty') + '</li>';
    return flattenTree(chosen).map((row) => {
      const c = row.item;
      const top = row.depth === 0;
      const i = top ? chosen.indexOf(c) : -1;
      const glyph = typeIconHtml(_typeIcon(c.type), { size: 14 });
      return '<li class="cdx-mem-row' + (top ? '' : ' is-nested') + '" data-id="' + c.id + '" data-depth="' + row.depth + '">' +
          guideHtml(row.guides, row.isLast, row.depth) +
          (glyph ? '<span class="cdx-mem-glyph" aria-hidden="true">' + glyph + '</span>' : '') +
          '<span class="cdx-mem-title">' + _esc(c.title || ('#' + c.id)) + '</span>' +
          '<span class="cdx-mem-type">' + _esc(c.type_label) + '</span>' +
          (top
            ? '<button type="button" class="cdx-btn cdx-btn-sm" data-act="up"' + (i === 0 ? ' disabled' : '') + '>&#8593;</button>' +
              '<button type="button" class="cdx-btn cdx-btn-sm" data-act="down"' + (i === chosen.length - 1 ? ' disabled' : '') + '>&#8595;</button>' +
              '<button type="button" class="cdx-btn cdx-btn-sm" data-act="rm">' + t('editor.members_remove') + '</button>'
            : '<span class="cdx-mem-nested-note">' + t('editor.members_nested_note') + '</span>') +
        '</li>';
    }).join('');
  }

  // ── O escolhedor: as MESMAS seções de Liberações, com checkbox ───────────
  function pickerHtml() {
    const inside = idsInTree(chosen);
    const top = new Set(chosen.map((c) => c.id));
    // Barra ciclo: o próprio item e qualquer descendente dele já dentro. O Worker rejeita de
    // novo no save; aqui é só para não oferecer o que voltaria erro.
    const eligible = selectableItems(pool, parentId, [])
      .filter((i) => !inside.has(Number(i.id)) || top.has(Number(i.id)))
      .filter((i) => matchesQuery(i, query));
    const sections = sectionsByType(eligible, {
      types,
      labelOf: _typeLabel,
      iconOf: _typeIcon,
    });
    if (!sections.length) return '<div class="cdx-picker-empty">' + t('editor.members_none') + '</div>';
    return sections.map((s, idx) => {
      const open = !!query || idx === 0;
      const ic = typeIconHtml(s.icon, { size: 14 });
      const rows = s.items.map((i) => (
        '<label class="cdx-comp-item">' +
          '<input type="checkbox" class="cdx-mem-cb" value="' + _esc(i.id) + '"' + (top.has(Number(i.id)) ? ' checked' : '') + '>' +
          '<span>' + _esc(i.title) +
            // Lab e interativo podem entrar na pasta, só não cabem no .zip. A linha DIZ isso
            // em vez de a pasta recusá-los: proibir deixaria a regra dependente da ordem (põe
            // um lab primeiro e a pasta trava contra documentos). Élder 2026-08-05.
            (isDownloadable(i) ? '' : ' <span class="cdx-comp-elsewhere">' + _esc(t('editor.members_no_zip')) + '</span>') +
          '</span>' +
        '</label>'
      )).join('');
      return '<div class="cdx-picker-group" data-acc="' + s.key + '">' +
          '<button type="button" class="cdx-picker-group-label" data-acc-toggle="' + s.key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<span class="cdx-picker-group-caret" aria-hidden="true">&#8250;</span>' +
            (ic ? '<span class="cdx-picker-group-glyph" aria-hidden="true">' + ic + '</span>' : '') +
            '<span class="cdx-picker-group-name">' + _esc(s.label) + ' (' + s.count + ')</span>' +
          '</button>' +
          '<div class="cdx-picker-group-rows' + (open ? '' : ' is-collapsed') + '">' + rows + '</div>' +
        '</div>';
    }).join('');
  }

  function render() {
    host.innerHTML =
      '<div class="cdx-field">' +
        '<label>' + t('editor.members_label') + '</label>' +
        '<ul class="cdx-mem-tree">' + treeHtml() + '</ul>' +
        '<div class="cdx-picker cdx-mem-picker">' +
          '<div class="cdx-picker-toolbar">' +
            '<input type="search" class="cdx-picker-search cdx-mem-search" placeholder="' + _esc(t('editor.members_search')) + '" autocomplete="off" spellcheck="false" value="' + _esc(query) + '">' +
          '</div>' +
          '<div class="cdx-picker-list">' + pickerHtml() + '</div>' +
        '</div>' +
      '</div>';
    wire();
  }

  function wire() {
    host.querySelectorAll('.cdx-mem-row[data-depth="0"] button').forEach((b) => {
      b.addEventListener('click', () => {
        const id = Number(b.closest('.cdx-mem-row').dataset.id);
        const i = chosen.findIndex((c) => c.id === id);
        const act = b.dataset.act;
        if (act === 'rm') chosen.splice(i, 1);
        else if (act === 'up') chosen.splice(i - 1, 0, chosen.splice(i, 1)[0]);
        else if (act === 'down') chosen.splice(i + 1, 0, chosen.splice(i, 1)[0]);
        render();
        onChange(ids());
      });
    });

    host.querySelectorAll('.cdx-mem-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = Number(cb.value);
        if (cb.checked) {
          const src = pool.find((i) => Number(i.id) === id);
          if (src) chosen.push(_norm(src));
        } else {
          const i = chosen.findIndex((c) => c.id === id);
          if (i !== -1) chosen.splice(i, 1);
        }
        render();
        onChange(ids());
      });
    });

    // Acordeão de uma seção aberta por vez, igual ao compositor de liberações. Durante uma
    // busca fica tudo aberto: colapsar esconderia justamente o que o usuário procurou.
    const list = host.querySelector('.cdx-picker-list');
    if (list) list.addEventListener('click', (e) => {
      const tgl = e.target.closest('[data-acc-toggle]');
      if (!tgl || query) return;
      const groups = Array.from(list.querySelectorAll('.cdx-picker-group'));
      const key = tgl.getAttribute('data-acc-toggle');
      const wasOpen = tgl.getAttribute('aria-expanded') === 'true';
      groups.forEach((g) => {
        const open = !wasOpen && g.getAttribute('data-acc') === key;
        const b = g.querySelector('.cdx-picker-group-label');
        const rows = g.querySelector('.cdx-picker-group-rows');
        if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (rows) rows.classList.toggle('is-collapsed', !open);
      });
    });

    const search = host.querySelector('.cdx-mem-search');
    if (search) search.addEventListener('input', () => {
      query = search.value;
      render();
      const s = host.querySelector('.cdx-mem-search');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });
  }

  function ids() { return chosen.map((c) => c.id); }

  render();
  Promise.all([
    api.listItems({}).catch(() => null),
    api.listTypes ? api.listTypes().catch(() => null) : Promise.resolve(null),
  ]).then(([r, ty]) => {
    pool = (r && r.items) || [];
    types = (ty && (ty.types || ty.items)) || [];
    render();
  });

  return { ids, destroy: () => { host.innerHTML = ''; } };
}
