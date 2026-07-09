// codex/js/labs-registry.js
// Codex-owned PensoLabs registry. ES-module port of the legacy window.CVLabs
// (backstage/classvault/js/cv-labs.js). PensoLabs demos are shipped artifacts
// (not user-authored), so the registry lives in code, not the DB: each lab is a
// synthetic item with a 'lab:<key>' id the renderers pick up without schema
// changes. Shared seam (codex/js/): consumed by Content > Labs + Presets and by
// Lessons. The legacy backstage global stays live for the un-ported ClassVault.
//
// Public API: LABS, findItem(idStr), getAllItems(), isLabEnabled(key),
// orderedLabs(), labOrderIndex(key), setLabOrder(keys), labIcon(key).
// The legacy renderSection()/LABS_GLYPH (the ClassVault "Aula" index DOM) is NOT
// ported: Codex renders Labs natively (content/labs.js, lessons.js), so that
// markup would be dead code emitting cv- classes the native modules forbid.

// Lab definitions are SHIPPED DATA — kept byte-identical with the legacy registry
// so the same lab pages resolve. The lab HTML still lives at /codex/labs/<key>/
// (moving it is the legacy quarantine step, not this port).
// Each lab carries a one-line `summary` (the "o que é"), a longer `description`,
// and an `objective` -- the Trail lab card shows all three (item-render.js). This
// registry is the SINGLE SOURCE for lab display text: the Trail overlays these
// onto the released lab item by lab_key (trilha/js/lab-overlay.js) so a rename
// here reaches students on the next load, without re-seeding the DB.
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

// LABS in the admin's chosen order. Keys no longer in the registry are
// dropped; labs not yet in the stored order keep their registry position,
// appended after the ordered ones (covers new labs added after the last drag).
export function orderedLabs() {
  const order = _readOrder();
  const byKey = new Map(LABS.map((l) => [l.key, l]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean);
  const seen = new Set(ordered.map((l) => l.key));
  return ordered.concat(LABS.filter((l) => !seen.has(l.key)));
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
  k9: 'glyph:biohazard', k10: 'glyph:pill', k11: 'glyph:mask', k12: 'glyph:spiral',
  k13: 'glyph:zap', k15: 'glyph:brain', k16: 'glyph:file-text', k17: 'glyph:thumbs-up',
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
    title: lab.title,
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
