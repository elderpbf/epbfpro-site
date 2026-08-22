// codex/js/labs-registry.js
// Codex-owned PensoLabs registry. ES-module port of the legacy window.CVLabs
// (backstage/classvault/js/cv-labs.js). PensoLabs demos are shipped artifacts
// (not user-authored), so the registry lives in code, not the DB: each lab is a
// synthetic item with a 'lab:<key>' id the renderers pick up without schema
// changes. Shared seam (codex/js/): consumed by Content > Labs + Presets and by
// Lessons. The legacy backstage global stays live for the un-ported ClassVault.
//
// Public API: LABS, findItem(idStr), getAllItems(), isLabEnabled(key),
// orderedLabs(), archivedLabs(), isLabArchived(key), setLabArchived(key,on),
// labOrderIndex(key), setLabOrder(keys), labIcon(key), isLabRenamed(key),
// setLabTitle(key,title).
// The legacy renderSection()/LABS_GLYPH (the ClassVault "Aula" index DOM) is NOT
// ported: Codex renders Labs natively (content/labs.js, lessons.js), so that
// markup would be dead code emitting cv- classes the native modules forbid.

// Lab definitions are SHIPPED DATA — kept byte-identical with the legacy registry
// so the same lab pages resolve. The lab HTML still lives at /codex/labs/<key>/
// (moving it is the legacy quarantine step, not this port).
// Each lab carries a one-line `summary` (the "what it is"), a longer `description`,
// and an `objective` -- the Trail lab card shows all three (item-render.js). This
// registry is the SINGLE SOURCE for lab display text: the Trail overlays these
// onto the released lab item by lab_key (trilha/js/lab-overlay.js) so a rename
// of the `title:` field HERE (in source) reaches students on the next load,
// without re-seeding the DB. The admin-UI rename (setLabTitle, Content > Labs)
// is a separate, client-only override on TOP of this -- see its own comment.
export const LABS = [
  {
    key: 'k1',
    title: 'Atenção!',
    summary: 'Contexto reescreve significado',
    description: 'A mesma palavra muda de sentido conforme o que vem antes dela. O demo mostra a atenção do modelo reescrevendo o significado de um trecho conforme o contexto ao redor.',
    objective: 'Ver como o contexto, e não só a palavra, decide o que o modelo entende.',
    emoji: '🎯'
  },
  {
    key: 'k2',
    title: 'Temperatura',
    summary: 'Distribuição, amostragem, sobreajuste',
    description: 'A temperatura controla o quanto o modelo arrisca na escolha da próxima palavra. O demo deixa você variar a temperatura e ver a distribuição das respostas ir de conservadora a criativa.',
    objective: 'Entender temperatura como o botão entre resposta previsível e resposta variada.',
    emoji: '🌡️'
  },
  {
    key: 'k3',
    title: 'Janela de contexto',
    summary: 'Orçamento de tokens e compactação',
    description: 'Todo modelo tem um limite de quanto texto cabe de uma vez. O demo mostra o orçamento de tokens enchendo e o que é descartado ou compactado quando estoura.',
    objective: 'Ver por que conversas longas esquecem o começo e como o orçamento é gasto.',
    emoji: '🪟'
  },
  {
    key: 'k4',
    title: 'Perdido no meio',
    summary: 'Acurácia cai onde a atenção afrouxa',
    description: 'Modelos lembram melhor do começo e do fim de um texto longo do que do meio. O demo mostra a acurácia caindo quando a informação está no miolo do contexto.',
    objective: 'Ver por que enterrar o que importa no meio de um texto longo é arriscado.',
    emoji: '🧩'
  },
  {
    key: 'k5',
    title: 'Tokens',
    summary: 'Palavra não é a mesma coisa que token',
    description: 'O modelo não lê palavra por palavra: ele lê tokens, pedaços que às vezes são uma palavra inteira e às vezes um fragmento dela. O demo mostra uma frase quebrando em tokens coloridos, e como a estrutura da conversa e a formatação também custam token.',
    objective: 'Ver que token não é palavra, e que estrutura e formatação também têm custo.',
    emoji: '🔤'
  },
  {
    key: 'k6',
    title: 'Embeddings',
    summary: 'Sentido tem geometria',
    description: 'Palavras de assuntos variados entram uma a uma e se posicionam sozinhas num espaço, sem que ninguém diga a categoria. O demo mostra o agrupamento por semelhança de sentido acontecendo ao vivo, a mesma geometria por trás da busca semântica.',
    objective: 'Ver que palavras parecidas em sentido terminam perto umas das outras, sem rótulo.',
    emoji: '🧭'
  },
  {
    key: 'k9',
    title: 'Petição envenenada',
    summary: 'Texto invisível vira instrução ao modelo',
    description: 'Texto escondido num documento, branco no branco ou em metadados, pode ser lido pelo modelo como ordem. O demo mostra uma petição com instrução invisível sequestrando a resposta.',
    objective: 'Reconhecer injeção de prompt: conteúdo que o humano não vê, mas o modelo obedece.',
    emoji: '☣️'
  },
  {
    key: 'k10',
    title: 'Cápsula do GPT',
    summary: 'Setup pinado uma vez, reutilizado em todo turno',
    description: 'Em vez de repetir o mesmo setup a cada pergunta, você fixa uma vez e reusa. O demo mostra a mesma instrução-base sendo aplicada a cada novo turno sem reescrever.',
    objective: 'Ver o ganho de fixar um contexto reutilizável em vez de repetir a cada vez.',
    emoji: '💊'
  },
  {
    key: 'k11',
    title: 'Confiança vs Fundamento',
    summary: 'Soa convicto mesmo quando inventa',
    description: 'O tom seguro do modelo não é prova de que ele está certo. O demo contrasta uma resposta bem fundamentada com uma alucinação que soa igualmente convicta.',
    objective: 'Separar o quão convincente soa do quão fundamentado está.',
    emoji: '🎭'
  },
  {
    key: 'k12',
    title: 'Lavagem de informação',
    summary: 'Repetição em escala vira "conhecimento" no peso',
    description: 'Algo repetido muitas vezes na internet vira "fato" no peso do modelo, mesmo sem fonte. O demo mostra a repetição em escala virando conhecimento aparente.',
    objective: 'Ver como frequência, e não veracidade, molda o que o modelo sabe.',
    emoji: '🌀'
  },
  {
    key: 'k13',
    title: 'Três velocidades',
    summary: 'Tradicional, raciocínio e agêntico são formatos diferentes',
    description: 'Nem toda resposta usa o modelo do mesmo jeito. O demo compara três formatos: resposta direta, raciocínio passo a passo e agêntico com ferramentas.',
    objective: 'Escolher o formato certo, rápido, pensado ou agêntico, para cada tarefa.',
    emoji: '⚡'
  },
  {
    key: 'k15',
    title: 'Sobreajuste',
    summary: 'Repetição fortalece o peso, até virar decoreba',
    description: 'Repetir o mesmo exemplo fortalece o peso, mas em excesso vira decoreba: o modelo memoriza em vez de generalizar. O demo mostra o peso subindo até travar num padrão.',
    objective: 'Ver a linha entre aprender um padrão e decorar o exemplo.',
    emoji: '🧠'
  },
  {
    key: 'k16',
    title: 'PDF e OCR',
    summary: 'Duas camadas de um PDF, e o que o OCR faz entre elas',
    description: 'Um PDF tem a imagem da página e, às vezes, uma camada de texto por baixo. O demo mostra as duas camadas e o papel do OCR quando só existe a imagem.',
    objective: 'Entender por que alguns PDFs já vêm lidos e outros precisam de OCR.',
    emoji: '📄'
  },
  {
    key: 'k17',
    title: 'Treinamento',
    summary: 'Humano prefere uma resposta a outra; a preferida reforça o peso',
    description: 'Quando um humano prefere uma resposta a outra, essa preferência reforça o peso na direção escolhida. O demo mostra o peso estabilizando conforme o treino avança.',
    objective: 'Ver como a preferência humana, repetida, molda o comportamento do modelo.',
    emoji: '👍'
  },
  {
    key: 'k18',
    title: 'Janela de contexto',
    summary: 'Tudo que ocupa a janela, do sistema à resposta',
    description: 'Versão granular da janela de contexto: os insumos entram separados (sistema, memórias, ferramentas, arquivos, histórico) e o próprio processo do modelo também ocupa a janela. O raciocínio custa milhares de tokens, a chamada de ferramenta custa quase nada, e o resultado e a resposta somam mais. A barra dá zoom no que é usado, e o botão alterna entre uma janela de 200.000 e uma de 1.000.000.',
    objective: 'Ver que o raciocínio e as ferramentas gastam a mesma janela, e quanto cada parte custa.',
    emoji: '🪟'
  },
  {
    key: 'k19',
    title: 'Framework CORE',
    summary: 'Contexto, Objetivo, Regras e Estrutura mudam a resposta',
    description: 'O mesmo pedido, com os 4 elementos do CORE ligados um de cada vez. Sem nenhum, a resposta sai com o tom errado, sem saber o que entregar, inventando dado que faltou e sem formato. Cada elemento liga e corrige um problema específico.',
    objective: 'Ver o que cada elemento do CORE corrige, um de cada vez, no mesmo pedido.',
    emoji: '🧱'
  },
  {
    key: 'k20',
    title: 'Aposta na Citação',
    summary: 'Soa correto não é prova de que é real',
    description: 'Cinco citações jurídicas, algumas reais e outras inventadas, todas escritas no mesmo tom seguro. Você aposta se cada uma é real ou inventada antes de revelar. As inventadas erram no conteúdo, não no número, o mesmo jeito que uma alucinação real engana.',
    objective: 'Ver que confiança no texto não é prova de veracidade, só verificar na fonte prova.',
    emoji: '⚖️'
  },
  {
    key: 'k21',
    title: 'Modelo e Esforço',
    summary: 'Não soube ou não se esforçou?',
    description: 'A mesma tarefa, variando modelo (pequeno a grande) e esforço (baixo a alto). Em cada cenário, um dos dois eixos é o que realmente decide entre acertar e errar, o outro não ajuda sozinho. O demo mostra qual pergunta fazer quando a IA erra.',
    objective: 'Diagnosticar um erro de IA: falta de capacidade (modelo) ou falta de cuidado (esforço).',
    emoji: '🎚️'
  },
  {
    key: 'k22',
    title: 'Próximo Token',
    summary: 'Não é pensamento, é probabilidade',
    description: 'O demo gera uma frase palavra por palavra: cada token vira um vetor de números, passa pelo transformador (atenção), vira uma lista de probabilidades, e o token escolhido volta pro início do ciclo.',
    objective: 'Ver a geração de texto como um ciclo de atenção e probabilidade repetido, não como um raciocínio contínuo.',
    emoji: '📊'
  }
];

// Reads the on/off map written by the Content > Labs subtab (content/labs.js).
// Default-on: a missing key = enabled. Disabled labs are filtered from the Aula
// index and from getAllItems so the Presets picker can't reach them.
export function isLabEnabled(key) {
  try {
    var raw = localStorage.getItem('cv_labs_enabled');
    if (!raw) return true;
    var map = JSON.parse(raw);
    return !map || map[key] !== false;
  } catch (e) { return true; }
}

// Archived labs are "put away": dropped from the active list and from every
// consumer (Presets/Lessons/Liberações) via orderedLabs(), but kept in the
// registry so they can be restored. State is an array of keys in localStorage,
// deliberately behind this thin seam (isLabArchived/setLabArchived/archivedLabs)
// so it can move server-side later without touching any consumer. Client-only
// for now, same reach as the on/off map — it does not filter the public Trilha.
const LS_ARCHIVED = 'cv_labs_archived';
function _readArchived() {
  try {
    const raw = localStorage.getItem(LS_ARCHIVED);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
export function isLabArchived(key) {
  return _readArchived().indexOf(key) !== -1;
}
export function setLabArchived(key, on) {
  const next = _readArchived().filter((k) => k !== key);
  if (on) next.push(key);
  try { localStorage.setItem(LS_ARCHIVED, JSON.stringify(next)); } catch (e) { /* ignore */ }
}

// Admin rename (Content > Labs, "Renomear"): a display-title override on top of
// the registry, same shape and same seam as the archive/order overlays above --
// client-only for now, does not reach other admins' browsers or the public
// Trilha (unlike editing `title:` in source, see the header comment). Storing
// only the DIFFERENCE (default title = no entry) means a lab added later or a
// copy edit to its registry title is never shadowed by a stale override.
const LS_RENAMED = 'cv_labs_renamed';
function _readRenamed() {
  try {
    const raw = localStorage.getItem(LS_RENAMED);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}
export function isLabRenamed(key) {
  const custom = _readRenamed()[key];
  return typeof custom === 'string' && custom.trim() !== '';
}
// The registry's own title for a key, ignoring any rename override -- lets a
// caller show "revert to '<default>'" without importing LABS directly.
export function labDefaultTitle(key) {
  const lab = LABS.find((l) => l.key === key);
  return lab ? lab.title : '';
}
// Empty string or the lab's own registry title clears the override (reverts to
// default) instead of storing a redundant/blank entry.
export function setLabTitle(key, title) {
  const trimmed = (title || '').trim();
  const lab = LABS.find((l) => l.key === key);
  const overrides = _readRenamed();
  if (!trimmed || (lab && trimmed === lab.title)) {
    delete overrides[key];
  } else {
    overrides[key] = trimmed;
  }
  try { localStorage.setItem(LS_RENAMED, JSON.stringify(overrides)); } catch (e) { /* ignore */ }
}
function _displayTitle(lab) {
  const custom = _readRenamed()[lab.key];
  return (typeof custom === 'string' && custom.trim()) ? custom.trim() : lab.title;
}

// Drag-to-reorder (Content > Labs) persists here as an ordered array of keys.
// Every consumer (the rail itself, getAllItems(), releases.js's Labs rows)
// derives its order from orderedLabs(), so reordering in one place propagates
// everywhere without each consumer keeping its own order state.
const LS_ORDER = 'cv_labs_order';

function _readOrder() {
  try {
    const raw = localStorage.getItem(LS_ORDER);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// LABS in the admin's chosen order, with any rename override applied to
// `title`. Keys no longer in the registry are dropped; labs not yet in the
// stored order keep their registry position, appended after the ordered ones
// (covers new labs added after the last drag).
function _allOrdered() {
  const order = _readOrder();
  const byKey = new Map(LABS.map((l) => [l.key, l]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean);
  const seen = new Set(ordered.map((l) => l.key));
  return ordered.concat(LABS.filter((l) => !seen.has(l.key)))
    .map((l) => Object.assign({}, l, { title: _displayTitle(l) }));
}

// The ACTIVE labs (archived ones dropped), in the admin's chosen order. Every
// consumer derives its list from here, so archiving hides a lab everywhere at
// once. The archived ones are reachable only via archivedLabs().
export function orderedLabs() {
  return _allOrdered().filter((l) => !isLabArchived(l.key));
}

// The archived labs, in the same order basis — for the Content > Labs drawer.
export function archivedLabs() {
  return _allOrdered().filter((l) => isLabArchived(l.key));
}

export function labOrderIndex(key) {
  return orderedLabs().findIndex((l) => l.key === key);
}

export function setLabOrder(keys) {
  try { localStorage.setItem(LS_ORDER, JSON.stringify(keys)); } catch (e) { /* ignore */ }
}

function _enabledLabs() {
  return orderedLabs().filter(function (l) { return isLabEnabled(l.key); });
}

// Per-lab glyph from the shared library (js/glyphs.js), each chosen to echo the
// lab's old emoji (🧩→puzzle, 💊→pill, 🎭→mask, 🧠→brain, 👍→thumbs-up …) so it
// reads the same but renders crisply everywhere. The Trail pairs this glyph with a
// small flask badge as the "family" marker. Unknown key -> the generic flask.
const LAB_GLYPH = {
  k1: 'glyph:target', k2: 'glyph:thermometer', k3: 'glyph:window', k4: 'glyph:puzzle',
  k5: 'glyph:hash', k6: 'glyph:compass',
  k9: 'glyph:biohazard', k10: 'glyph:pill', k11: 'glyph:mask', k12: 'glyph:spiral',
  k13: 'glyph:zap', k15: 'glyph:brain', k16: 'glyph:file-text', k17: 'glyph:thumbs-up',
  k18: 'glyph:window', k19: 'glyph:layers', k20: 'glyph:checklist', k21: 'glyph:cpu', k22: 'glyph:bar-chart',
};

export function labIcon(key) {
  return LAB_GLYPH[key] || 'glyph:flask';
}

// Build the synthetic item shape the renderers expect.
function labToItem(lab) {
  return {
    id: 'lab:' + lab.key,
    type: 'lab',
    type_label: 'Lab',
    type_icon: labIcon(lab.key),
    title: _displayTitle(lab),
    summary: lab.summary,
    description: lab.description || '',
    objective: lab.objective || '',
    meta_json: { url: '/codex/labs/' + lab.key + '/' }
  };
}

export function findItem(idStr) {
  if (!idStr || String(idStr).indexOf('lab:') !== 0) return null;
  const key = String(idStr).slice(4);
  const lab = LABS.find(l => l.key === key);
  return lab ? labToItem(lab) : null;
}

// Returns every ENABLED lab in picker-compatible item shape. Used by the Presets
// editor (so labs can be added to presets alongside ct_items rows) and by the
// Lessons sidebar Labs section. Cheap synchronous accessor (no I/O).
export function getAllItems() {
  return _enabledLabs().map(labToItem);
}
