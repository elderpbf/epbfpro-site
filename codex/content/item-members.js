// content/item-members.js
// Os itens de um PACOTE, no editor: quais são, em que ordem, e em que degrau aparecem.
//
// O modelo (Élder 2026-08-06, corrigindo o meu): o parentesco de verdade é só pacote→itens.
// Entre os itens não há parentesco nenhum -- eles são uma lista plana, e o recuo é DISPLAY,
// "só a forma como vai aparecer na trilha". Por isso aqui não existe árvore: existe uma lista
// e um inteiro por linha, mexido pelos botões →| e |←.
//
// O que essa correção apagou deste arquivo: re-parentear ao apagar, validar consistência de
// árvore, e a pergunta "irmão ou filho?" (é a mesma coisa vista de dois lugares). Apagar um
// membro é `removeAt`, que promove quem estava sob ele. Nada mais.
//
// É um PINTOR sobre js/item-list.js, não uma lista própria (Élder 2026-08-05: "a gente deve
// ter apenas uma lista de itens e cada local que utiliza só faz os filtros necessários"). As
// classes são as mesmas `.cdx-picker*` do compositor de Liberações. A consolidação dos TRÊS
// pintores num só é a tarefa #23, não este arquivo.
//
// Guarda só o estado. Quem persiste é o item-form, depois do save, via api.setItemMembers --
// um item novo ainda não tem id para ser pai.
import { esc as _esc } from '../js/dom.js';
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { iconHtml as typeIconHtml } from '../js/glyphs.js';
import {
  sectionsByType, matchesQuery, guidesFromIndent, maxIndentFor, removeAt, MAX_INDENT,
} from '../js/item-list.js';
import { isDownloadable } from '../js/item-download.js';

// O teto de recuo mora no motor da lista (js/item-list.js) e é reexportado aqui só para quem
// já importava daqui. Um número só para editor, trilha e CSS.
export { MAX_INDENT };

// As colunas de guia de UMA linha. `guides[k]` = ainda vem alguém no degrau k mais abaixo,
// então aquela coluna leva traço vertical; senão fica vazia. Sem isso o traço continua
// descendo embaixo do último, que é o defeito clássico de árvore em texto.
export function guideHtml(guides, isLast, depth) {
  if (!depth) return '';
  const cols = (guides || []).slice(0, depth - 1)
    .map((on) => '<span class="cdx-mem-guide' + (on ? ' is-line' : '') + '"></span>').join('');
  return cols + '<span class="cdx-mem-elbow' + (isLast ? ' is-last' : '') + '"></span>';
}

export function mount(host, opts = {}) {
  const parentId = opts.parentId || null;
  let chosen = (opts.children || []).map(_norm);
  let pool = [];
  let types = [];
  let query = '';
  const onChange = opts.onChange || function () {};

  function _norm(c) {
    return {
      id: Number(c.id), title: c.title, type: c.type || '',
      type_label: c.type_label || c.type || '',
      indent: Math.max(0, Math.min(MAX_INDENT, Number(c.indent) || 0)),
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

  // ── A lista do que está dentro ───────────────────────────────────────────
  function listHtml() {
    if (!chosen.length) return '<li class="cdx-mem-empty">' + t('editor.members_empty') + '</li>';
    return guidesFromIndent(chosen).map((row, i) => {
      const c = row.item;
      const glyph = typeIconHtml(_typeIcon(c.type), { size: 14 });
      const canIn = c.indent < maxIndentFor(chosen, i, MAX_INDENT);
      const canOut = c.indent > 0;
      return '<li class="cdx-mem-row" data-i="' + i + '" data-indent="' + c.indent + '">' +
          guideHtml(row.guides, row.isLast, row.depth) +
          (glyph ? '<span class="cdx-mem-glyph" aria-hidden="true">' + glyph + '</span>' : '') +
          '<span class="cdx-mem-title">' + _esc(c.title || ('#' + c.id)) + '</span>' +
          '<span class="cdx-mem-type">' + _esc(c.type_label) + '</span>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-act="out"' + (canOut ? '' : ' disabled') + ' title="' + _esc(t('editor.members_outdent')) + '">|&#8592;</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-act="in"' + (canIn ? '' : ' disabled') + ' title="' + _esc(t('editor.members_indent')) + '">&#8594;|</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-act="up"' + (i === 0 ? ' disabled' : '') + '>&#8593;</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-act="down"' + (i === chosen.length - 1 ? ' disabled' : '') + '>&#8595;</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-act="rm">' + t('editor.members_remove') + '</button>' +
        '</li>';
    }).join('');
  }

  // ── O escolhedor: as MESMAS seções de Liberações, com checkbox ───────────
  function pickerHtml() {
    const inside = new Set(chosen.map((c) => c.id));
    const eligible = (pool || [])
      .filter((i) => Number(i.id) !== Number(parentId))
      .filter((i) => matchesQuery(i, query));
    const sections = sectionsByType(eligible, { types, labelOf: _typeLabel, iconOf: _typeIcon });
    if (!sections.length) return '<div class="cdx-picker-empty">' + t('editor.members_none') + '</div>';
    return sections.map((s, idx) => {
      const open = !!query || idx === 0;
      const ic = typeIconHtml(s.icon, { size: 14 });
      const rows = s.items.map((i) => (
        '<label class="cdx-comp-item cdx-mem-pick" data-id="' + _esc(i.id) + '">' +
          '<input type="checkbox" class="cdx-mem-cb" value="' + _esc(i.id) + '"' + (inside.has(Number(i.id)) ? ' checked' : '') + '>' +
          '<span>' + _esc(i.title) +
            // Lab e interativo podem entrar no pacote, só não cabem no .zip. A linha DIZ isso
            // em vez de o pacote recusá-los: proibir deixaria a regra dependente da ordem (põe
            // um lab primeiro e o pacote trava contra documentos). Élder 2026-08-05.
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

  // A lista de dentro é repintada sozinha, SEM tocar no escolhedor. Élder 2026-08-05:
  // "clicking on one checkbox make the list refresh and i have to find stuff again". Eu
  // chamava render() no handler do checkbox, o que refazia o escolhedor inteiro e jogava fora
  // a seção aberta, a rolagem e o lugar onde ele estava.
  function paintList() {
    const ul = host.querySelector('.cdx-mem-tree');
    if (!ul) return;
    ul.innerHTML = listHtml();
    wireList();
  }

  function render() {
    host.innerHTML =
      '<div class="cdx-field">' +
        '<label>' + t('editor.members_label') + '</label>' +
        '<ul class="cdx-mem-tree">' + listHtml() + '</ul>' +
        '<div class="cdx-picker cdx-mem-picker">' +
          '<div class="cdx-picker-toolbar">' +
            '<input type="search" class="cdx-picker-search cdx-mem-search" placeholder="' + _esc(t('editor.members_search')) + '" autocomplete="off" spellcheck="false" value="' + _esc(query) + '">' +
          '</div>' +
          '<div class="cdx-picker-list">' + pickerHtml() + '</div>' +
        '</div>' +
      '</div>';
    wireList();
    wirePicker();
  }

  function wireList() {
    host.querySelectorAll('.cdx-mem-row button').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.closest('.cdx-mem-row').dataset.i);
        const act = b.dataset.act;
        if (act === 'rm') chosen = removeAt(chosen, i);
        else if (act === 'in') chosen[i].indent = Math.min(MAX_INDENT, maxIndentFor(chosen, i, MAX_INDENT));
        else if (act === 'out') chosen[i].indent = Math.max(0, chosen[i].indent - 1);
        else if (act === 'up') chosen.splice(i - 1, 0, chosen.splice(i, 1)[0]);
        else if (act === 'down') chosen.splice(i + 1, 0, chosen.splice(i, 1)[0]);
        // Mover pode deixar uma linha num degrau que não existe mais (o de cima mudou), então
        // o recuo é normalizado depois de qualquer mexida na ordem.
        chosen.forEach((c, k) => { c.indent = Math.min(c.indent, maxIndentFor(chosen, k, MAX_INDENT)); });
        paintList();
        _syncChecks();
        onChange(members());
      });
    });
  }

  function _syncChecks() {
    const inside = new Set(chosen.map((c) => c.id));
    host.querySelectorAll('.cdx-mem-cb').forEach((cb) => { cb.checked = inside.has(Number(cb.value)); });
  }

  function wirePicker() {
    const list = host.querySelector('.cdx-picker-list');
    if (list) {
      list.addEventListener('change', (e) => {
        const cb = e.target.closest('.cdx-mem-cb');
        if (!cb) return;
        const id = Number(cb.value);
        if (cb.checked) {
          const src = pool.find((i) => Number(i.id) === id);
          if (src) chosen.push(_norm(src));
        } else {
          const i = chosen.findIndex((c) => c.id === id);
          if (i !== -1) chosen = removeAt(chosen, i);
        }
        paintList();          // só a lista; o escolhedor fica exatamente onde estava
        onChange(members());
      });
      // Acordeão de uma seção aberta por vez. Durante uma busca fica tudo aberto: colapsar
      // esconderia justamente o que ele procurou.
      list.addEventListener('click', (e) => {
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
    }
    const search = host.querySelector('.cdx-mem-search');
    if (search) search.addEventListener('input', () => {
      query = search.value;
      const box = host.querySelector('.cdx-picker-list');
      if (box) box.innerHTML = pickerHtml();     // idem: a busca não repinta a lista de dentro
    });
  }

  function members() { return chosen.map((c) => ({ id: c.id, indent: c.indent })); }
  function ids() { return chosen.map((c) => c.id); }

  render();
  Promise.all([
    api.listItems({}).catch(() => null),
    api.listTypes ? api.listTypes().catch(() => null) : Promise.resolve(null),
  ]).then(([r, ty]) => {
    pool = (r && r.items) || [];
    types = (ty && ty.types) || [];
    render();
  });

  return { members, ids, destroy: () => { host.innerHTML = ''; } };
}
