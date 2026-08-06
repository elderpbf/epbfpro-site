// content/item-form-proto.js
// PROTÓTIPO da tela única de item (as 4 candidatas), clicável dentro do próprio Codex.
//
// Élder 2026-08-06: "eu acho que a gente deveria construir isso dentro, meio que como se fosse
// um protótipo mas não numa página separada, dentro do Codex mesmo, porque aí não precisaria
// portar código depois... valeria ver ao vivo ao invés de estar tentando ver aqui em texto".
//
// Por isso ele usa as classes REAIS (cdx-editor, cdx-field, cdx-type-opt, cdx-tag-chip,
// cdx-mem-*) e os tipos/etiquetas REAIS do acervo: a candidata que vencer vira o item-form de
// verdade, ela não é reescrita. O que é falso aqui é só o miolo: nada salva, nada chama o
// Worker, e os membros são o pacote 900110 com seus títulos longos.
//
// SEGUNDA RODADA (Élder, mesma data). O que ele reprovou e o que mudou:
//   "inconsistência gigantesca do tamanho das fontes"  -> uma escala de 4 degraus, declarada em
//        .cdx-proto e usada em tudo. É proposta para a tela nova, não só para o protótipo.
//   "modal estreito... tenho que usar rolagem"         -> modal largo, e quem rola é o CORPO,
//        com cabeçalho, abas e rodapé fixos: trocar de candidata não exige subir a página.
//   "a lista pode ser bem mais compacta, fonte menor"  -> linhas densas, fonte menor.
//   "os 2 painéis precisam ter um arrastador"          -> o js/resizable.js compartilhado, o
//        mesmo de Liberações e do dossiê. Sem código de arraste novo.
//   "na A não consigo ver a indentação, você não preencheu" -> as QUATRO abrem com o mesmo
//        pacote de 6 degraus. Comparar é o objetivo; abrir vazio matava a comparação.
//   "a ideia das portas é péssima: são 2 telas quando eu falei que só seria uma, e se eu mudar
//        de ideia depois a escolha já passou"          -> o garfo MORREU. A B guarda a única
//        coisa que valia dela, o interruptor Item|Pacote, agora vivo desde o primeiro quadro e
//        também na edição. Isso deixa a B sendo a D sem as duas colunas, e isso é informação
//        sobre o espaço de desenho, não motivo para inventar uma quinta ideia.
//
// Mount:
//   mount(host, { variant, types, tags, onVariant, onClose })  ->  { destroy }
import { esc as _esc } from '../js/dom.js';
import { iconHtml } from '../js/glyphs.js';
import { installResizer } from '../js/resizable.js';

export const VARIANTS = [
  { key: 'a', name: 'A. Uma coluna', line: 'Nunca pergunta "item ou pacote?": o pacote nasce quando você põe o segundo item dentro.' },
  { key: 'b', name: 'B. O interruptor', line: 'Uma coluna, e o Item|Pacote do cabeçalho vale a qualquer momento, inclusive editando.' },
  { key: 'c', name: 'C. Duas colunas', line: 'O item à esquerda, o que está dentro à direita, com arrastador. Editar um membro troca só a esquerda.' },
  { key: 'd', name: 'D. A recomendada', line: 'As duas colunas da C, a promoção automática da A e o interruptor da B, juntos.' },
];

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

// ── pedaços compartilhados pelas quatro ─────────────────────────────────────
// São função e não texto colado porque as quatro mostram os MESMOS campos em arranjos
// diferentes: se o campo divergir entre elas, a comparação vira ruído.

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

// A caixa de conteúdo com a IA presa nela. É o coração das quatro: sumindo o passo 1, a IA passa
// a agir SOBRE campos que já estão na tela e possivelmente já preenchidos.
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
          // Os dois rádios em linha PRÓPRIA: junto com o campo de link eles herdavam a sobra do
          // flex e saíam espalhados na largura toda, com "extrair o texto" quebrando em duas.
          '<div class="cdx-proto-filemode">' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '" checked> extrair o texto</label>' +
            '<label class="cdx-radio-label"><input type="radio" name="pf-' + (opts.ns || 'x') + '"> usar como arquivo para baixar</label>' +
          '</div>'
        : '') +
    '</div>';
}

// O que a IA deve à tela quando ela mesma preencheu os campos abaixo.
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

// A lista do que está dentro, com as guias reais. `mode` muda só as ações oferecidas:
//   'full'  todas (recuar, mover, editar, tirar)  -> A e B, que têm a largura toda
//   'rail'  a coluna estreita                     -> C e D
function memberRows(rows, mode) {
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
    const acts = mode === 'rail'
      ? '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="' + i + '" title="Editar aqui">✎</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Tirar do pacote">✕</button>'
      : '<button type="button" class="cdx-btn cdx-btn-sm" title="Sair um degrau">|&#8592;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Entrar um degrau">&#8594;|</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Subir">&#8593;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Descer">&#8595;</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-edit="' + i + '" title="Editar aqui">✎</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" title="Tirar do pacote">✕</button>';
    return '<li class="cdx-mem-row">' + elbow +
        '<span class="cdx-mem-title">' + _esc(m.t) + '</span>' +
        '<span class="cdx-mem-type">' + _esc(m.ty) + '</span>' + acts +
      '</li>';
  }).join('');
}

function membersBlock(rows, mode, opts = {}) {
  return '<div class="cdx-proto-members' + (opts.flush ? ' is-flush' : '') + '">' +
      '<div class="cdx-proto-members-head">' +
        '<span>DENTRO' + (rows.length ? ' (' + rows.length + ')' : '') + '</span>' +
        '<span class="cdx-proto-members-acts">' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="pool">+ existente</button>' +
          '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-add="new">+ criar aqui</button>' +
        '</span>' +
      '</div>' +
      '<ul class="cdx-mem-tree cdx-proto-tree">' + memberRows(rows, mode) + '</ul>' +
      (opts.onlyHere !== false
        ? '<label class="cdx-radio-label cdx-proto-onlyhere"><input type="checkbox"> o item selecionado só existe dentro deste pacote</label>'
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

// O interruptor Item|Pacote. Fica no CABEÇALHO e vale desde o primeiro quadro: era um garfo numa
// tela anterior, e o Élder matou o garfo ("são 2 telas quando eu falei que só seria uma, e se eu
// mudar de ideia depois a escolha já passou"). Como interruptor, mudar de ideia é um clique, e
// ele existe igual na edição.
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

// ── as quatro candidatas ────────────────────────────────────────────────────

function viewA(st, types, tags) {
  const pack = st.rows.length > 0;
  return '<div class="cdx-editor-body cdx-proto-body">' +
    (pack
      ? '<div class="cdx-proto-banner">Isto é um <b>PACOTE</b>. Ele nasceu quando um segundo item ' +
        'entrou aqui: o Prompt continua sendo um Prompt e virou o primeiro membro. ' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-proto-undo="1">ver um item virando pacote</button></div>'
      : '<div class="cdx-proto-banner">Um item comum. Clique em <b>+ existente</b> lá embaixo e ' +
        'veja ele virar pacote sem ninguém perguntar nada.</div>') +
    contentBox(pack ? 'DESCRIÇÃO DO PACOTE' : 'CONTEÚDO',
      pack ? 'Do que se trata este pacote...' : 'Cole aqui o conteúdo do item...', { ns: 'a', rows: 4 }) +
    AI_NOTE +
    fields(types, tags, {
      title: pack ? TITLE_PACK : TITLE_ITEM,
      type: pack ? 'pasta' : 'prompt',
      summaryPh: 'Uma linha sobre o item',
    }) +
    (pack ? '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>' : '') +
    membersBlock(st.rows, 'full', { onlyHere: pack }) +
  '</div>';
}

function viewB(st, types, tags) {
  const pack = !!st.pack;
  // Sendo pacote, o que importa é o que está dentro, então a lista sobe. É a diferença real
  // entre a B e a A: mesma coluna única, ordem invertida pelo interruptor.
  const inner = pack
    ? fields(types, tags, { title: TITLE_PACK, type: 'pasta', summaryPh: 'Uma linha sobre o pacote' }) +
      membersBlock(st.rows, 'full') +
      contentBox('DESCRIÇÃO DO PACOTE', 'Do que se trata este pacote...', { ns: 'b', rows: 3, sources: false }) +
      '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>'
    : contentBox('CONTEÚDO', 'Cole aqui o conteúdo do item...', { ns: 'b', rows: 4 }) + AI_NOTE +
      fields(types, tags, { title: TITLE_ITEM, type: 'prompt', summaryPh: 'Uma linha sobre o item' }) +
      membersBlock([], 'full', { onlyHere: false });
  return '<div class="cdx-editor-body cdx-proto-body">' +
      '<div class="cdx-proto-banner">O garfo morreu. O <b>Item|Pacote</b> lá em cima vale agora e ' +
      'daqui a um mês, editando: mudar de ideia é um clique, e nunca houve uma segunda tela.</div>' +
      inner +
    '</div>';
}

function twoCol(st, types, tags, opts) {
  const child = st.editing != null ? st.rows[st.editing] : null;
  const left = child
    ? fields(types, tags, { title: child.t, type: child.ty === 'Arquivo' ? 'arquivo' : 'prompt', summaryPh: 'Uma linha sobre o item' }) +
      contentBox('CONTEÚDO', 'O conteúdo deste item...', { ns: opts.ns, rows: 8, sources: false, edit: true })
    : (opts.banner || '') +
      contentBox(opts.pack ? 'DESCRIÇÃO DO PACOTE' : 'CONTEÚDO',
        opts.pack ? 'Do que se trata este pacote...' : 'Cole aqui o conteúdo do item...',
        { ns: opts.ns, rows: 5 }) +
      AI_NOTE +
      fields(types, tags, {
        title: opts.pack ? TITLE_PACK : TITLE_ITEM,
        type: opts.pack ? 'pasta' : 'prompt',
        summaryPh: 'Uma linha sobre o item',
      }) +
      (opts.pack ? '<label class="cdx-radio-label"><input type="checkbox"> incluir esta descrição no .zip</label>' : '');
  // A grade NÃO é o elemento que rola. Se fossem o mesmo, a alça (position:absolute com
  // top:0/bottom:0) se ancoraria na caixa VISÍVEL do container de rolagem em vez de na altura
  // das colunas, e ficaria curta e fora de lugar ao rolar. Um div rola, o de dentro é a grade.
  return '<div class="cdx-editor-body cdx-proto-body">' +
      '<div class="cdx-proto-two" id="cdx-proto-split">' +
        '<div class="cdx-proto-left">' + left + '</div>' +
        '<div class="cdx-proto-right">' + membersBlock(st.rows, 'rail', { flush: true, onlyHere: opts.pack }) +
          '<p class="cdx-proto-note">' + opts.note + '</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    crumb(opts.pack ? TITLE_PACK : TITLE_ITEM, child);
}

function viewC(st, types, tags) {
  return twoCol(st, types, tags, {
    ns: 'c', pack: true,
    note: 'Clique no ✎ de um membro: troca só a coluna da esquerda, e a migalha embaixo diz onde ' +
      'você está. É o "um editor que faz tudo" ao pé da letra, sem modal em cima de modal. ' +
      'Arraste a divisória para dar espaço ao lado que você estiver usando.',
  });
}

function viewD(st, types, tags) {
  const pack = st.rows.length > 0 || st.pack;
  return twoCol(st, types, tags, {
    ns: 'd', pack,
    banner: pack
      ? '<div class="cdx-proto-banner">É um <b>PACOTE</b>: o item continua o que era e entrou aqui ' +
        'dentro. <button type="button" class="cdx-btn cdx-btn-sm" data-proto-undo="1">ver um item virando pacote</button></div>'
      : '<div class="cdx-proto-banner">Um item comum. Ponha algo dentro (ou use o interruptor) e ' +
        'ele vira pacote.</div>',
    note: 'Ninguém é obrigado a responder "item ou pacote?" antes de ter conteúdo: pôr um item ' +
      'dentro já resolve. Quem já sabe que quer um pacote vazio usa o interruptor lá em cima, ' +
      'que também existe na edição.',
  });
}

const VIEWS = { a: viewA, b: viewB, c: viewC, d: viewD };

export function mount(host, opts = {}) {
  const types = opts.types || [];
  const tags = opts.tags || [];
  const onVariant = opts.onVariant || function () {};
  const onClose = opts.onClose || function () {};
  let variant = opts.variant || 'a';
  let st = null;
  let uninstallRz = null;

  // As QUATRO abrem com o mesmo pacote de 6 degraus. Élder: "a versão A eu não consigo ver a
  // indentação porque você não preencheu". Comparar é o objetivo, e abrir uma vazia matava a
  // comparação; o estado de item-comum da A e da D virou um clique, não o padrão.
  function reset() {
    st = { rows: MEMBERS.slice(), editing: null, pack: true };
  }
  reset();

  function paint() {
    const v = VARIANTS.find((x) => x.key === variant) || VARIANTS[0];
    const showToggle = variant === 'b' || variant === 'd';
    host.innerHTML = '<div class="cdx-editor cdx-proto">' +
        '<div class="cdx-editor-header">' +
          '<span class="cdx-editor-title">' + _esc(v.name) + '</span>' +
          (showToggle ? toggle(variant === 'b' ? !!st.pack : (st.rows.length > 0 || st.pack)) : '') +
          '<button class="cdx-btn cdx-btn-sm" data-proto-reset="1">Recomeçar</button>' +
          '<button class="cdx-btn cdx-btn-sm" data-proto-close="1">Fechar</button>' +
        '</div>' +
        '<div class="cdx-proto-tabs">' + VARIANTS.map((x) =>
          '<button type="button" class="cdx-btn cdx-btn-sm' + (x.key === variant ? ' cdx-btn-primary' : '') +
            '" data-proto-var="' + x.key + '">' + _esc(x.name) + '</button>').join('') +
          '<span class="cdx-proto-lead">' + _esc(v.line) + '</span>' +
        '</div>' +
        VIEWS[variant](st, types, tags) +
        footer() +
      '</div>';
    mountResizer();
  }

  // O arrastador é o js/resizable.js COMPARTILHADO (o mesmo de Liberações e do dossiê), e não
  // código de arraste novo. Reinstalar a cada pintura não é zelo: `paint()` reescreve o
  // innerHTML, então a grade e a alça anterior deixam de existir, e sem esta linha a alça
  // sumiria no primeiro clique. Nenhum teste sem DOM pega isso; só arrastando no navegador.
  function mountResizer() {
    if (uninstallRz) { uninstallRz(); uninstallRz = null; }
    const grid = host.querySelector('#cdx-proto-split');
    if (!grid) return;
    uninstallRz = installResizer(grid, {
      storeKey: 'cdx_rz_proto_split', defaultPx: 620, min: 340, max: 900,
    });
  }

  function onClick(e) {
    const btn = e.target.closest('[data-proto-var],[data-proto-add],[data-proto-edit],' +
      '[data-proto-pack],[data-proto-undo],[data-proto-reset],[data-proto-close]');
    if (!btn || !host.contains(btn)) return;
    const d = btn.dataset;
    if (d.protoClose) { onClose(); return; }
    if (d.protoVar) { variant = d.protoVar; reset(); onVariant(variant); }
    else if (d.protoReset) reset();
    else if (d.protoPack != null) {
      const on = d.protoPack === '1';
      st.pack = on;
      st.rows = on ? (st.rows.length ? st.rows : MEMBERS.slice()) : [];
      st.editing = null;
    } else if (d.protoUndo) { st.rows = []; st.pack = false; st.editing = null; }
    else if (d.protoAdd) {
      // O primeiro item adicionado é o PRÓPRIO item que estava sendo editado: a regra do Élder
      // ("um item que ganha companhia não vira pai, nasce um pacote que segura os dois")
      // acontecendo na tela. É o buraco que hoje não tem caminho nenhum.
      if (!st.rows.length) { st.rows.push(MEMBERS[0]); st.pack = true; }
      const next = MEMBERS[st.rows.length % MEMBERS.length];
      st.rows.push(Object.assign({}, next, { indent: Math.min(5, st.rows.length) }));
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
