// content/item-form-proto.js
// PROTÓTIPO da tela única de item, clicável dentro do próprio Codex.
//
// Élder 2026-08-06: "eu acho que a gente deveria construir isso dentro, meio que como se fosse
// um protótipo mas não numa página separada, dentro do Codex mesmo, porque aí não precisaria
// portar código depois". Por isso usa as classes REAIS (cdx-editor, cdx-field, cdx-type-opt,
// cdx-tag-chip, cdx-mem-*) e os tipos/etiquetas REAIS do acervo: quando ele aprovar, esta tela
// vira o item-form de verdade, ela não é reescrita. Falso aqui é só o miolo: nada salva, nada
// chama o Worker, e os membros são o pacote 900110 com seus títulos longos.
//
// HISTÓRICO DE PODA (importa, porque cada corte foi uma decisão dele):
//   1a rodada: quatro candidatas, A a D.
//   2a rodada: ele reprovou fontes, largura, densidade, falta de arrastador, e matou o garfo de
//     duas portas ("são 2 telas quando eu falei que só seria uma, e se eu mudar de ideia depois
//     a escolha já passou").
//   3a rodada: "d looks nice... you can drop a, b and c". Sobrou UMA tela, e as abas de
//     comparação foram junto: comparar acabou, agora é acertar esta.
//
// O que a tela é, em uma frase: duas colunas com arrastador, o item à esquerda e o que está
// dentro à direita, o pacote nascendo sozinho quando um segundo item entra, e o interruptor
// Item|Pacote para quem já sabe que quer um pacote vazio.
//
// Mount:
//   mount(host, { types, tags, onClose })  ->  { destroy }
import { esc as _esc } from '../js/dom.js';
import { iconHtml } from '../js/glyphs.js';
import { installResizer } from '../js/resizable.js';
import { maxIndentFor, removeAt, MAX_INDENT } from '../js/item-list.js';

// Os membros do pacote 900110, com os títulos longos de propósito.
const MEMBERS = [
  { t: 'Prompt: Resumo Preparatório para Audiência', ty: 'Prompt', indent: 0 },
  { t: 'Modelo: Relatório Preparatório CÍVEL', ty: 'Prompt', indent: 1 },
  { t: 'Modelo: Relatório Preparatório CRIMINAL', ty: 'Prompt', indent: 2 },
  { t: 'Modelo: Ata de Audiência de Instrução CÍVEL', ty: 'Prompt', indent: 3 },
  { t: 'Checklist: Documentos Obrigatórios CRIMINAL', ty: 'Arquivo', indent: 4 },
  { t: 'Anexo: Roteiro de Perguntas para Testemunhas', ty: 'Arquivo', indent: 5 },
];

const TITLE_ITEM = 'Prompt: Resumo Preparatório para Audiência';
const TITLE_PACK = 'Pacote: Preparação para Audiência';

// ── pedaços da tela ─────────────────────────────────────────────────────────

function typeChips(types, selected) {
  return (types || []).slice(0, 6).map((ty) =>
    '<button type="button" class="cdx-type-opt' + (ty.slug === selected ? ' is-active' : '') +
      '" data-proto-type="' + _esc(ty.slug) + '">' +
      '<span class="cdx-type-opt-icon">' + iconHtml(ty.icon, { size: 13 }) + '</span>' +
      '<span>' + _esc(ty.label) + '</span>' +
    '</button>').join('');
}

function tagChips(tags) {
  const chips = (tags || []).slice(0, 4).map((tg, i) =>
    '<button type="button" class="cdx-tag-chip' + (i < 2 ? ' active' : '') + '">' + _esc(tg.label) + '</button>').join('');
  return '<div class="cdx-tag-chip-row">' + chips +
    '<button type="button" class="cdx-tag-add-chip">+ etiqueta</button></div>';
}

// A caixa de conteúdo com a IA presa nela. É o coração da tela: sumindo o passo 1, a IA passa a
// agir SOBRE campos que já estão aqui e possivelmente já preenchidos.
//
// `sources:false` não é enfeite: um PACOTE não é um arquivo, então oferecer "usar como arquivo
// para baixar" na descrição dele produziria um pacote que também é um anexo, que não existe no
// modelo. A descrição de pacote não ganha essas opções.
function contentBox(label, placeholder, opts = {}) {
  return '<div class="cdx-field cdx-proto-content">' +
      '<label>' + _esc(label) +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-proto-ai">✨ ' +
          (opts.edit ? 'Reler e sugerir' : 'Ler e preencher') + '</button>' +
      '</label>' +
      '<textarea rows="' + (opts.rows || 5) + '" placeholder="' + _esc(placeholder) + '"></textarea>' +
      (opts.sources !== false
        ? '<div class="cdx-proto-sources">' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Arquivo</button>' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Drive</button>' +
            '<input type="text" placeholder="Link de um Google Doc">' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Carregar</button>' +
          '</div>' +
          '<div class="cdx-proto-filemode">' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '" checked> extrair o texto</label>' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '"> usar como arquivo para baixar</label>' +
          '</div>'
        : '') +
    '</div>';
}

const AI_NOTE = '<p class="cdx-proto-note">A IA preenche o que está vazio; onde você já escreveu, ' +
  'ela sugere ao lado e você aceita. E escolhe tipo e etiqueta do que já existe: quando nada ' +
  'serve, diz e deixa em branco, em vez de inventar categoria.</p>';

function fields(types, tags, { title, type, summaryPh }) {
  return '<div class="cdx-field"><label>Título</label>' +
      '<input type="text" value="' + _esc(title) + '"></div>' +
    '<div class="cdx-proto-row2">' +
      '<div class="cdx-field"><label>Tipo</label>' +
        '<div class="cdx-type-opts">' + typeChips(types, type) + '</div></div>' +
      '<div class="cdx-field"><label>Etiquetas</label>' + tagChips(tags) + '</div>' +
    '</div>' +
    '<div class="cdx-field"><label>Resumo</label>' +
      '<input type="text" placeholder="' + _esc(summaryPh) + '"></div>';
}

// ── a lista do que está dentro ──────────────────────────────────────────────
// UMA linha selecionada, e as ações numa barra em cima. Élder: "d looks nice, but lacks the
// ->| controls". A tentação era repetir os seis botões em cada linha, como nas candidatas de
// coluna larga, mas numa coluna estreita eles empurram o título para fora, e seis linhas com
// seis botões são 36 botões competindo com o conteúdo.
//
// A barra também conserta um defeito que a análise do fluxo achou: a caixinha "o item
// SELECIONADO só existe dentro deste pacote" falava de uma seleção que não existia em lugar
// nenhum da tela. Agora existe, e ela tem sujeito.
function memberRows(rows, sel) {
  if (!rows.length) return '<li class="cdx-mem-empty">Nada dentro ainda.</li>';
  return rows.map((m, i) => {
    const guides = [];
    for (let k = 0; k < Math.max(0, m.indent - 1); k++) {
      let on = false;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].indent <= k) break;
        if (rows[j].indent === k + 1) { on = true; break; }
      }
      guides.push('<span class="cdx-mem-guide' + (on ? ' is-line' : '') + '"></span>');
    }
    let isLast = true;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].indent < m.indent) break;
      if (rows[j].indent === m.indent) { isLast = false; break; }
    }
    const elbow = m.indent ? guides.join('') + '<span class="cdx-mem-elbow' + (isLast ? ' is-last' : '') + '"></span>' : '';
    return '<li class="cdx-mem-row' + (i === sel ? ' is-sel' : '') + '" data-proto-sel="' + i + '">' + elbow +
        '<span class="cdx-mem-title">' + _esc(m.t) + '</span>' +
        '<span class="cdx-mem-type">' + _esc(m.ty) + '</span>' +
      '</li>';
  }).join('');
}

function memberBar(rows, sel) {
  const has = sel != null && rows[sel];
  const off = (on) => (on ? '' : ' disabled');
  // As MESMAS regras da lista de verdade, importadas de js/item-list.js: não se pula degrau, e
  // o teto é o MAX_INDENT. Reimplementar aqui faria o protótipo mentir sobre o que é possível.
  const canIn = has && rows[sel].indent < maxIndentFor(rows, sel, MAX_INDENT);
  const canOut = has && rows[sel].indent > 0;
  return '<div class="cdx-proto-bar">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="out"' + off(canOut) + ' title="Sair um degrau">|&#8592;</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="in"' + off(canIn) + ' title="Entrar um degrau">&#8594;|</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="up"' + off(has && sel > 0) + ' title="Subir">&#8593;</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="down"' + off(has && sel < rows.length - 1) + ' title="Descer">&#8595;</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="edit"' + off(has) + ' title="Editar aqui">✎ Editar</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-act="rm"' + off(has) + ' title="Tirar do pacote">✕ Tirar</button>' +
    '</div>';
}

function membersBlock(rows, sel, pack) {
  return '<div class="cdx-proto-members is-flush">' +
      '<div class="cdx-proto-members-head">' +
        '<span>DENTRO' + (rows.length ? ' (' + rows.length + ')' : '') + '</span>' +
        '<span class="cdx-proto-members-acts">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="pool">+ existente</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="new">+ criar aqui</button>' +
        '</span>' +
      '</div>' +
      memberBar(rows, sel) +
      '<ul class="cdx-mem-tree cdx-proto-tree">' + memberRows(rows, sel) + '</ul>' +
      (pack
        ? '<label class="cdx-radio-label cdx-proto-onlyhere">' +
            '<input type="checkbox"' + (sel == null ? ' disabled' : '') + '> ' +
            (sel == null ? 'selecione um item para marcar que ele só existe aqui dentro'
                         : 'este item só existe dentro deste pacote') +
          '</label>'
        : '') +
    '</div>';
}

function footer() {
  return '<div class="cdx-editor-footer"><div class="cdx-modal-actions">' +
      '<button class="cdx-btn">Cancelar</button>' +
      '<button class="cdx-btn">✨ Refazer</button>' +
      '<button class="cdx-btn cdx-btn-primary">Salvar</button>' +
    '</div></div>';
}

// O interruptor Item|Pacote, no CABEÇALHO e válido desde o primeiro quadro. Era um garfo numa
// tela anterior, e o garfo morreu: como interruptor, mudar de ideia é um clique e ele existe
// igual na edição.
function toggle(isPack) {
  return '<div class="cdx-proto-toggle" role="group">' +
      '<button type="button" class="cdx-btn cdx-btn-sm' + (isPack ? '' : ' cdx-btn-primary') + '" data-proto-pack="0">Item</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm' + (isPack ? ' cdx-btn-primary' : '') + '" data-proto-pack="1">Pacote</button>' +
    '</div>';
}

function crumb(rootTitle, child) {
  return '<div class="cdx-proto-crumb">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="root">' + _esc(rootTitle) + '</button>' +
      (child ? '<span>›</span><b>' + _esc(child.t) + '</b>' : '') +
    '</div>';
}

function view(st, types, tags) {
  const pack = st.rows.length > 0 || st.pack;
  const child = st.editing != null ? st.rows[st.editing] : null;
  const left = child
    ? fields(types, tags, { title: child.t, type: child.ty === 'Arquivo' ? 'arquivo' : 'prompt', summaryPh: 'Uma linha sobre o item' }) +
      contentBox('CONTEÚDO', 'O conteúdo deste item...', { ns: 'm', rows: 8, sources: false, edit: true })
    : (pack
        ? '<div class="cdx-proto-banner">É um <b>PACOTE</b>: o item continua o que era e entrou aqui ' +
          'dentro. <button type="button" class="cdx-btn cdx-btn-sm" data-proto-undo="1">ver um item virando pacote</button></div>'
        : '<div class="cdx-proto-banner">Um item comum. Ponha algo dentro (ou use o interruptor) e ' +
          'ele vira pacote.</div>') +
      contentBox(pack ? 'DESCRIÇÃO DO PACOTE' : 'CONTEÚDO',
        pack ? 'Do que se trata este pacote...' : 'Cole aqui o conteúdo do item...',
        { ns: 'r', rows: 5, sources: !pack }) +
      AI_NOTE +
      fields(types, tags, {
        title: pack ? TITLE_PACK : TITLE_ITEM,
        type: pack ? 'pasta' : 'prompt',
        summaryPh: 'Uma linha sobre o item',
      }) +
      (pack ? '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>' : '');
  // A grade NÃO é o elemento que rola. Se fossem o mesmo, a alça do arrastador (absolute com
  // top:0/bottom:0) se ancoraria na caixa VISÍVEL do container de rolagem em vez de na altura
  // das colunas, e ficaria curta e fora de lugar ao rolar.
  return '<div class="cdx-editor-body cdx-proto-body">' +
      '<div class="cdx-proto-two" id="cdx-proto-split">' +
        '<div class="cdx-proto-left">' + left + '</div>' +
        '<div class="cdx-proto-right">' + membersBlock(st.rows, st.sel, pack) + '</div>' +
      '</div>' +
    '</div>' +
    crumb(pack ? TITLE_PACK : TITLE_ITEM, child);
}

export function mount(host, opts = {}) {
  const types = opts.types || [];
  const tags = opts.tags || [];
  const onClose = opts.onClose || function () {};
  let st = null;
  let uninstallRz = null;

  // Cópia PROFUNDA. `MEMBERS.slice()` copiava a lista mas compartilhava os objetos, e as ações
  // de recuo mexem em `indent` no objeto: fechar e reabrir a tela trazia de volta o recuo
  // bagunçado da sessão anterior. Achado pelo teste, não pela tela.
  const fresh = () => MEMBERS.map((m) => Object.assign({}, m));
  function reset() { st = { rows: fresh(), editing: null, sel: null, pack: true }; }
  reset();

  function paint() {
    host.innerHTML = '<div class="cdx-editor cdx-proto">' +
        '<div class="cdx-editor-header">' +
          '<span class="cdx-editor-title">Item</span>' +
          toggle(st.rows.length > 0 || st.pack) +
          '<button class="cdx-btn cdx-btn-sm" data-proto-reset="1">Recomeçar</button>' +
          '<button class="cdx-btn cdx-btn-sm" data-proto-close="1">Fechar</button>' +
        '</div>' +
        view(st, types, tags) +
        footer() +
      '</div>';
    mountResizer();
  }

  // O arrastador é o js/resizable.js COMPARTILHADO (o mesmo de Liberações e do dossiê).
  // Reinstalar a cada pintura não é zelo: paint() reescreve o innerHTML, então a grade e a alça
  // anterior deixam de existir, e sem esta linha a alça sumiria no primeiro clique. Nenhum teste
  // sem DOM pega isso; só arrastando no navegador.
  function mountResizer() {
    if (uninstallRz) { uninstallRz(); uninstallRz = null; }
    const grid = host.querySelector('#cdx-proto-split');
    if (!grid) return;
    uninstallRz = installResizer(grid, {
      storeKey: 'cdx_rz_proto_split', defaultPx: 620, min: 340, max: 900,
    });
  }

  // Mover uma linha pode deixar o recuo dela impossível (caiu para depois de alguém mais raso).
  // A mesma normalização da lista de verdade: ninguém pula degrau.
  function clampAll() {
    st.rows.forEach((r, i) => { r.indent = Math.min(r.indent, maxIndentFor(st.rows, i, MAX_INDENT)); });
  }

  function onClick(e) {
    const btn = e.target.closest('[data-proto-add],[data-proto-edit],[data-proto-act],' +
      '[data-proto-pack],[data-proto-undo],[data-proto-reset],[data-proto-close],[data-proto-sel]');
    if (!btn || !host.contains(btn)) return;
    const d = btn.dataset;
    if (d.protoClose) { onClose(); return; }
    if (d.protoReset) reset();
    else if (d.protoSel != null) {
      const i = Number(d.protoSel);
      st.sel = st.sel === i ? null : i;   // clicar de novo tira a seleção
    } else if (d.protoAct) {
      const i = st.sel;
      if (i == null || !st.rows[i]) return;
      if (d.protoAct === 'in') st.rows[i].indent = maxIndentFor(st.rows, i, MAX_INDENT);
      else if (d.protoAct === 'out') st.rows[i].indent = Math.max(0, st.rows[i].indent - 1);
      else if (d.protoAct === 'up' && i > 0) {
        st.rows.splice(i - 1, 0, st.rows.splice(i, 1)[0]); st.sel = i - 1; clampAll();
      } else if (d.protoAct === 'down' && i < st.rows.length - 1) {
        st.rows.splice(i + 1, 0, st.rows.splice(i, 1)[0]); st.sel = i + 1; clampAll();
      } else if (d.protoAct === 'edit') st.editing = i;
      else if (d.protoAct === 'rm') {
        // removeAt PROMOVE quem estava recuado sob o apagado: é a regra do modelo, importada.
        st.rows = removeAt(st.rows, i);
        st.sel = null;
        if (st.editing === i) st.editing = null;
      }
    } else if (d.protoPack != null) {
      const on = d.protoPack === '1';
      st.pack = on;
      st.rows = on ? (st.rows.length ? st.rows : fresh()) : [];
      st.editing = null; st.sel = null;
    } else if (d.protoUndo) { st.rows = []; st.pack = false; st.editing = null; st.sel = null; }
    else if (d.protoAdd) {
      // O primeiro item adicionado é o PRÓPRIO item que estava sendo editado: a regra do Élder
      // ("um item que ganha companhia não vira pai, nasce um pacote que segura os dois")
      // acontecendo na tela. É o buraco que hoje não tem caminho nenhum.
      if (!st.rows.length) { st.rows.push(MEMBERS[0]); st.pack = true; }
      const next = MEMBERS[st.rows.length % MEMBERS.length];
      st.rows.push(Object.assign({}, next, { indent: 0 }));
      st.sel = st.rows.length - 1;
    } else if (d.protoEdit != null) {
      st.editing = d.protoEdit === 'root' ? null : Number(d.protoEdit);
    }
    paint();
  }

  host.addEventListener('click', onClick);
  paint();
  return {
    destroy: () => {
      if (uninstallRz) { uninstallRz(); uninstallRz = null; }
      host.removeEventListener('click', onClick);
      host.innerHTML = '';
    },
  };
}
