// content/item-members.js
// O bloco "itens deste projeto" do editor: escolhe QUAIS itens um embalador contém, em ordem.
//
// Vive num módulo próprio (e não dentro do item-form) porque o embalador não é privilégio do
// tipo `projeto`: skill, trilha guiada ou o que vier depois usam a MESMA lista. Um bloco por
// tipo divergiria (codex/CLAUDE.md).
//
// Guarda só ids. Quem persiste é o item-form, depois do save, via api.setItemMembers -- um
// item novo ainda não tem id para ser pai.
import { esc as _esc } from '../js/dom.js';
import { content as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

// Um embalador não pode conter a si mesmo (a trilha entraria em recursão ao montar o cartão)
// nem outro embalador, que abriria aninhamento sem fim antes de existir tela para ele.
export function selectableItems(all, parentId) {
  return (all || []).filter((i) => Number(i.id) !== Number(parentId) && i.type !== 'projeto');
}

export function mount(host, opts = {}) {
  const parentId = opts.parentId || null;
  let chosen = (opts.children || []).map((c) => ({ id: Number(c.id), title: c.title, type_label: c.type_label || c.type || '' }));
  let pool = [];
  const onChange = opts.onChange || function () {};

  function render() {
    const rows = chosen.length
      ? chosen.map((c, i) => (
          '<li class="cdx-mem-row" data-id="' + c.id + '">' +
            '<span class="cdx-mem-pos">' + (i + 1) + '</span>' +
            '<span class="cdx-mem-title">' + _esc(c.title || ('#' + c.id)) + '</span>' +
            '<span class="cdx-mem-type">' + _esc(c.type_label) + '</span>' +
            '<button type="button" class="cdx-btn cdx-btn-sm" data-act="up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="cdx-btn cdx-btn-sm" data-act="down"' + (i === chosen.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="cdx-btn cdx-btn-sm" data-act="rm">' + t('editor.members_remove') + '</button>' +
          '</li>'
        )).join('')
      : '<li class="cdx-mem-empty">' + t('editor.members_empty') + '</li>';

    const taken = new Set(chosen.map((c) => c.id));
    const opts_ = selectableItems(pool, parentId)
      .filter((i) => !taken.has(Number(i.id)))
      .map((i) => '<option value="' + i.id + '">' + _esc(i.title) + '</option>').join('');

    host.innerHTML =
      '<div class="cdx-field"><label>' + t('editor.members_label') + '</label>' +
        '<ul class="cdx-mem-list">' + rows + '</ul>' +
        '<div class="cdx-mem-add">' +
          '<select id="ie-mem-pick"><option value="">' + _esc(t('editor.members_pick')) + '</option>' + opts_ + '</select>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" id="ie-mem-add">' + t('editor.members_add') + '</button>' +
        '</div>' +
      '</div>';
    wire();
  }

  function wire() {
    host.querySelectorAll('.cdx-mem-row button').forEach((b) => {
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
    const add = host.querySelector('#ie-mem-add');
    if (add) add.addEventListener('click', () => {
      const sel = host.querySelector('#ie-mem-pick');
      const id = Number(sel && sel.value);
      if (!id) return;
      const src = pool.find((i) => Number(i.id) === id);
      if (src) chosen.push({ id, title: src.title, type_label: src.type_label || src.type || '' });
      render();
      onChange(ids());
    });
  }

  function ids() { return chosen.map((c) => c.id); }

  render();
  api.listItems({}).then((r) => { pool = (r && r.items) || []; render(); }).catch(() => { pool = []; });

  return { ids, destroy: () => { host.innerHTML = ''; } };
}
