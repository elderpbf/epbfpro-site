// content/item-form-proto.js
// PROTÓTIPO da tela única de item (as 4 candidatas), clicável dentro do próprio Codex.
//
// Élder 2026-08-06: "eu acho que a gente deveria construir isso dentro, meio que como se fosse
// um protótipo mas não numa página separada, dentro do Codex mesmo, porque aí não precisaria
// portar código depois... valeria ver ao vivo ao invés de estar tentando ver aqui em texto".
//
// Por isso ele usa as classes REAIS (cdx-editor, cdx-field, cdx-type-opt, cdx-tag-chip,
// cdx-mem-row e as guias) e os tipos/etiquetas REAIS do acervo: a candidata que vencer vira o
// item-form de verdade, ela não é reescrita. O que é falso aqui é só o miolo: nada salva, nada
// chama o Worker, e os membros são uma lista fixa com os títulos longos do pacote 900110 (que
// é o caso onde o aperto aparece).
//
// Os textos estão em PT-BR literal, FORA do t(), de propósito: as palavras da tela SÃO o que
// está em julgamento, e criar ~60 chaves em três dicionários para apagar na semana que vem
// deixaria lixo no i18n. Quando a candidata graduar, aí sim cada string vira chave.
//
// Mount:
//   mount(host, { variant, types, tags, onVariant })  ->  { destroy }
import { esc as _esc } from '../js/dom.js';
import { iconHtml } from '../js/glyphs.js';

export const VARIANTS = [
  { key: 'a', name: 'A. Conteúdo primeiro', line: 'Nunca pergunta "item ou pacote?". O pacote nasce quando você adiciona o segundo item.' },
  { key: 'b', name: 'B. Duas portas', line: 'Escolhe item ou pacote na entrada, e o interruptor continua visível na edição.' },
  { key: 'c', name: 'C. Duas colunas', line: 'O item à esquerda, o que está dentro à direita. Editar um membro troca só a esquerda.' },
  { key: 'd', name: 'D. A recomendada', line: 'O fluxo da A, a coluna da C, e o interruptor da B para quem já sabe que quer um pacote.' },
];

// Os membros do pacote 900110, com os títulos longos de propósito: é neles que o recuo aperta.
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

// ── pedaços compartilhados pelas quatro candidatas ──────────────────────────
// São função e não texto colado justamente porque as quatro candidatas mostram os MESMOS
// campos em arranjos diferentes: se o campo divergir entre elas, a comparação vira ruído.

function typeChips(types, selected) {
  return (types || []).slice(0, 6).map((ty) =>
    '<button type="button" class="cdx-type-opt' + (ty.slug === selected ? ' is-active' : '') +
      '" data-proto-type="' + _esc(ty.slug) + '">' +
      '<span class="cdx-type-opt-icon">' + iconHtml(ty.icon, { size: 14 }) + '</span>' +
      '<span>' + _esc(ty.label) + '</span>' +
    '</button>').join('');
}

function tagChips(tags) {
  const chips = (tags || []).slice(0, 4).map((tg, i) =>
    '<button type="button" class="cdx-tag-chip' + (i < 2 ? ' active' : '') + '">' + _esc(tg.label) + '</button>').join('');
  return '<div class="cdx-tag-chip-row">' + chips +
    '<button type="button" class="cdx-tag-add-chip">+ etiqueta</button></div>';
}

// A caixa de conteúdo com a IA presa nela. É o coração das quatro: some o passo 1, então a IA
// tem que agir SOBRE campos que já estão na tela e possivelmente já preenchidos.
function contentBox(label, placeholder, opts = {}) {
  return '<div class="cdx-field cdx-proto-content">' +
      '<label>' + _esc(label) +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-proto-ai">✨ ' + (opts.edit ? 'Reler e sugerir' : 'Ler e preencher') + '</button>' +
      '</label>' +
      '<textarea rows="' + (opts.rows || 5) + '" placeholder="' + _esc(placeholder) + '"></textarea>' +
      (opts.sources !== false
        ? '<div class="cdx-proto-sources">' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Arquivo</button>' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Drive</button>' +
            '<input type="text" placeholder="Cole o link de um Google Doc">' +
            '<button type="button" class="cdx-btn cdx-btn-sm">Carregar</button>' +
          '</div>' +
          '<div class="cdx-proto-filemode">' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '" checked> extrair o texto</label>' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '"> usar como arquivo para baixar</label>' +
          '</div>'
        : '') +
    '</div>';
}

// A explicação que a IA deve à tela quando ela mesma preencheu os campos abaixo.
const AI_NOTE = '<p class="cdx-proto-note">A IA preencheu o que estava vazio. Onde você já tinha ' +
  'escrito, ela sugere ao lado e você aceita. E ela escolhe tipo e etiqueta do que existe: ' +
  'quando nada serve, ela diz e deixa em branco, em vez de inventar categoria.</p>';

function fields(types, tags, { title, type, summaryPh }) {
  return '<div class="cdx-field"><label>Título</label>' +
      '<input type="text" value="' + _esc(title) + '"></div>' +
    '<div class="cdx-field"><label>Tipo</label>' +
      '<div class="cdx-type-opts">' + typeChips(types, type) + '</div></div>' +
    '<div class="cdx-field"><label>Resumo</label>' +
      '<input type="text" placeholder="' + _esc(summaryPh) + '"></div>' +
    '<div class="cdx-field"><label>Etiquetas</label>' + tagChips(tags) + '</div>';
}

// A lista do que está dentro, com as guias reais. `mode` muda só as ações oferecidas:
//   'full'  todas as ações (recuar, mover, editar, remover)   -> A, B
//   'rail'  a coluna estreita da C e da D                     -> C, D
function memberRows(rows, mode) {
  if (!rows.length) {
    return '<li class="cdx-mem-empty">Nada dentro ainda.</li>';
  }
  return rows.map((m, i) => {
    const guides = [];
    for (let k = 0; k < Math.max(0, m.indent - 1); k++) {
      // a coluna k leva traço se ainda vem alguém naquele degrau mais abaixo
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
    const acts = mode === 'rail'
      ? '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="' + i + '" title="Editar aqui">✎</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Tirar do pacote">✕</button>'
      : '<button type="button" class="cdx-btn cdx-btn-sm" title="Sair um degrau">|&#8592;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Entrar um degrau">&#8594;|</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm">&#8593;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm">&#8595;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="' + i + '" title="Editar aqui">✎</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm">Tirar</button>';
    return '<li class="cdx-mem-row">' + elbow +
        '<span class="cdx-mem-title">' + _esc(m.t) + '</span>' +
        '<span class="cdx-mem-type">' + _esc(m.ty) + '</span>' + acts +
      '</li>';
  }).join('');
}

function membersBlock(rows, mode, opts = {}) {
  return '<div class="cdx-proto-members">' +
      '<div class="cdx-proto-members-head">' +
        '<span>DENTRO' + (rows.length ? ' (' + rows.length + ')' : '') + '</span>' +
        (opts.onlyHere !== false
          ? '<label class="cdx-radio-label"><input type="checkbox"> este item só existe dentro deste pacote</label>'
          : '') +
      '</div>' +
      '<ul class="cdx-mem-tree">' + memberRows(rows, mode) + '</ul>' +
      '<div class="cdx-proto-members-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="pool">+ item existente</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="new">+ criar item aqui</button>' +
      '</div>' +
    '</div>';
}

function footer() {
  return '<div class="cdx-editor-footer"><div class="cdx-modal-actions">' +
      '<button class="cdx-btn">Cancelar</button>' +
      '<button class="cdx-btn">✨ Refazer</button>' +
      '<button class="cdx-btn cdx-btn-primary">Salvar</button>' +
    '</div></div>';
}

// O interruptor Item|Pacote da B (e da D). Fica no CABEÇALHO, e não numa tela anterior: é o que
// faz criar e editar continuarem sendo a mesma tela, que é o defeito que tudo isto conserta.
function toggle(isPack) {
  return '<div class="cdx-proto-toggle" role="group">' +
      '<button type="button" class="cdx-btn cdx-btn-sm' + (isPack ? '' : ' cdx-btn-primary') + '" data-proto-pack="0">Item</button>' +
      '<button type="button" class="cdx-btn cdx-btn-sm' + (isPack ? ' cdx-btn-primary' : '') + '" data-proto-pack="1">Pacote</button>' +
    '</div>';
}

// ── as quatro candidatas ────────────────────────────────────────────────────

function viewA(st, types, tags) {
  const became = st.rows.length > 0;
  return '<div class="cdx-editor-body">' +
    (became
      ? '<div class="cdx-proto-banner">Isto virou um <b>PACOTE</b>. O Prompt continua sendo um ' +
        'Prompt e entrou como o primeiro item aqui dentro; o que você escreve agora descreve o ' +
        'pacote. <button type="button" class="cdx-btn cdx-btn-sm" data-proto-undo="1">desfazer</button></div>'
      : '') +
    contentBox(became ? 'DESCRIÇÃO DO PACOTE' : 'CONTEÚDO',
      became ? 'Do que se trata este pacote...' : 'Cole aqui o conteúdo do item...', { ns: 'a' }) +
    AI_NOTE +
    fields(types, tags, {
      title: became ? TITLE_PACK : TITLE_ITEM,
      type: became ? 'pasta' : 'prompt',
      summaryPh: 'Uma linha sobre o item',
    }) +
    membersBlock(st.rows, 'full', { onlyHere: became }) +
  '</div>';
}

function viewB(st, types, tags) {
  if (st.fork == null) {
    return '<div class="cdx-editor-body cdx-proto-fork">' +
        '<p class="cdx-proto-forkq">O que você está criando?</p>' +
        '<div class="cdx-proto-forkrow">' +
          '<button type="button" class="cdx-proto-forkcard" data-proto-fork="0">' +
            '<b>ITEM</b><span>um prompt, um modelo, um arquivo, uma tarefa</span></button>' +
          '<button type="button" class="cdx-proto-forkcard" data-proto-fork="1">' +
            '<b>PACOTE</b><span>vários itens num cartão só, e uma pasta no download</span></button>' +
        '</div>' +
        '<p class="cdx-proto-note">A objeção a esta: ela pergunta antes de existir conteúdo, e ' +
        'é o conteúdo que a IA lê. Você responde "item" e três minutos depois descobre que era ' +
        'pacote. Na edição a pergunta não pode aparecer, então ela vira o interruptor do topo.</p>' +
      '</div>';
  }
  const pack = !!st.fork;
  return '<div class="cdx-editor-body">' +
    (pack
      ? fields(types, tags, { title: TITLE_PACK, type: 'pasta', summaryPh: 'Uma linha sobre o pacote' }) +
        membersBlock(st.rows.length ? st.rows : MEMBERS.slice(0, 3), 'full') +
        contentBox('DESCRIÇÃO DO PACOTE', 'Do que se trata este pacote...', { ns: 'b', rows: 4, sources: false }) +
        '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>'
      : contentBox('CONTEÚDO', 'Cole aqui o conteúdo do item...', { ns: 'b' }) + AI_NOTE +
        fields(types, tags, { title: TITLE_ITEM, type: 'prompt', summaryPh: 'Uma linha sobre o item' }) +
        membersBlock([], 'full', { onlyHere: false })) +
  '</div>';
}

function viewC(st, types, tags) {
  const inChild = st.editing != null;
  const child = inChild ? st.rows[st.editing] : null;
  return '<div class="cdx-editor-body cdx-proto-two">' +
      '<div class="cdx-proto-left">' +
        (inChild
          ? fields(types, tags, { title: child.t, type: child.ty === 'Arquivo' ? 'arquivo' : 'prompt', summaryPh: 'Uma linha sobre o item' }) +
            contentBox('CONTEÚDO', 'O conteúdo deste item...', { ns: 'c', rows: 6, sources: false })
          : fields(types, tags, { title: TITLE_PACK, type: 'pasta', summaryPh: 'Uma linha sobre o pacote' }) +
            contentBox('DESCRIÇÃO DO PACOTE', 'Do que se trata este pacote...', { ns: 'c', rows: 6, sources: false }) +
            '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>') +
      '</div>' +
      '<div class="cdx-proto-right">' + membersBlock(st.rows, 'rail') +
        '<p class="cdx-proto-note">Clique no ✎ de um membro: troca só esta coluna da esquerda, ' +
        'e a migalha embaixo mostra onde você está. É o "um editor que faz tudo" ao pé da letra ' +
        'criar item dentro não vira modal em cima de modal. No telefone as colunas empilham, ' +
        'e aí ela vira a A.</p>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-proto-crumb">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="root">' + _esc(TITLE_PACK) + '</button>' +
      (inChild ? '<span>›</span><b>' + _esc(child.t) + '</b>' : '') +
    '</div>';
}

function viewD(st, types, tags) {
  const became = st.rows.length > 0 || st.pack;
  const inChild = st.editing != null;
  const child = inChild ? st.rows[st.editing] : null;
  return '<div class="cdx-editor-body cdx-proto-two">' +
      '<div class="cdx-proto-left">' +
        (became && !inChild
          ? '<div class="cdx-proto-banner">Virou um <b>PACOTE</b>: o item continua o que era e ' +
            'entrou aqui dentro. <button type="button" class="cdx-btn cdx-btn-sm" data-proto-undo="1">desfazer</button></div>'
          : '') +
        (inChild
          ? fields(types, tags, { title: child.t, type: child.ty === 'Arquivo' ? 'arquivo' : 'prompt', summaryPh: 'Uma linha sobre o item' }) +
            contentBox('CONTEÚDO', 'O conteúdo deste item...', { ns: 'd', rows: 6, sources: false })
          : contentBox(became ? 'DESCRIÇÃO DO PACOTE' : 'CONTEÚDO',
              became ? 'Do que se trata este pacote...' : 'Cole aqui o conteúdo do item...', { ns: 'd' }) +
            AI_NOTE +
            fields(types, tags, {
              title: became ? TITLE_PACK : TITLE_ITEM,
              type: became ? 'pasta' : 'prompt',
              summaryPh: 'Uma linha sobre o item',
            }) +
            (became ? '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>' : '')) +
      '</div>' +
      '<div class="cdx-proto-right">' + membersBlock(st.rows, 'rail', { onlyHere: became }) +
        '<p class="cdx-proto-note">Ninguém é obrigado a responder "item ou pacote?" antes de ter ' +
        'conteúdo: adicione um item e ela vira pacote sozinha. Quem já sabe que quer um pacote ' +
        'vazio usa o interruptor do topo, que também existe na edição.</p>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-proto-crumb">' +
      '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="root">' + _esc(became ? TITLE_PACK : TITLE_ITEM) + '</button>' +
      (inChild ? '<span>›</span><b>' + _esc(child.t) + '</b>' : '') +
    '</div>';
}

const VIEWS = { a: viewA, b: viewB, c: viewC, d: viewD };

export function mount(host, opts = {}) {
  const types = opts.types || [];
  const tags = opts.tags || [];
  const onVariant = opts.onVariant || function () {};
  const onClose = opts.onClose || function () {};
  let variant = opts.variant || 'a';
  // Estado do protótipo. C e D já nascem com o pacote pronto (é o que elas têm a mostrar);
  // A e B nascem vazias, porque o que elas têm a mostrar é justamente o item VIRANDO pacote.
  let st = null;

  function reset() {
    st = {
      rows: (variant === 'c' || variant === 'd') ? MEMBERS.slice() : [],
      editing: null,
      fork: variant === 'b' ? null : 1,
      pack: variant === 'c',
    };
  }
  reset();

  function paint() {
    const v = VARIANTS.find((x) => x.key === variant) || VARIANTS[0];
    const showToggle = variant === 'b' ? st.fork != null : variant === 'd';
    host.innerHTML = '<div class="cdx-editor cdx-proto">' +
        '<div class="cdx-editor-header">' +
          '<span class="cdx-editor-title">' + _esc(v.name) + '</span>' +
          (showToggle ? toggle(variant === 'b' ? !!st.fork : (st.rows.length > 0 || st.pack)) : '') +
          '<button class="cdx-btn cdx-btn-sm" data-proto-reset="1">Recomeçar</button>' +
          '<button class="cdx-btn cdx-btn-sm" data-proto-close="1">Fechar</button>' +
        '</div>' +
        '<p class="cdx-proto-lead">' + _esc(v.line) + '</p>' +
        '<div class="cdx-proto-tabs">' + VARIANTS.map((x) =>
          '<button type="button" class="cdx-btn cdx-btn-sm' + (x.key === variant ? ' cdx-btn-primary' : '') +
            '" data-proto-var="' + x.key + '">' + _esc(x.name) + '</button>').join('') + '</div>' +
        VIEWS[variant](st, types, tags) +
        footer() +
      '</div>';
  }

  function onClick(e) {
    const btn = e.target.closest('[data-proto-var],[data-proto-add],[data-proto-edit],' +
      '[data-proto-fork],[data-proto-pack],[data-proto-undo],[data-proto-reset],[data-proto-close]');
    if (!btn || !host.contains(btn)) return;
    const d = btn.dataset;
    if (d.protoClose) { onClose(); return; }
    if (d.protoVar) { variant = d.protoVar; reset(); onVariant(variant); }
    else if (d.protoReset) reset();
    else if (d.protoFork != null) st.fork = Number(d.protoFork);
    else if (d.protoPack != null) {
      const on = d.protoPack === '1';
      if (variant === 'b') st.fork = on ? 1 : 0;
      else { st.pack = on; st.rows = on ? (st.rows.length ? st.rows : MEMBERS.slice(0, 3)) : []; st.editing = null; }
    } else if (d.protoUndo) { st.rows = []; st.pack = false; st.editing = null; }
    else if (d.protoAdd) {
      // O primeiro item adicionado é o PRÓPRIO item que estava sendo editado: é a regra do
      // Élder ("um item que ganha companhia não vira pai, nasce um pacote que segura os dois")
      // acontecendo na tela, e é o buraco que hoje não tem caminho nenhum.
      if (!st.rows.length) st.rows.push(MEMBERS[0]);
      const next = MEMBERS[st.rows.length % MEMBERS.length];
      st.rows.push(Object.assign({}, next, { indent: 1 }));
    } else if (d.protoEdit != null) {
      st.editing = d.protoEdit === 'root' ? null : Number(d.protoEdit);
    }
    paint();
  }

  host.addEventListener('click', onClick);
  paint();
  return { destroy: () => { host.removeEventListener('click', onClick); host.innerHTML = ''; } };
}
