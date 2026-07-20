// codex/js/interativos-registry.js
// Codex-owned registry of "Interativo" content: self-contained HTML artifacts the
// student EXPLORES (opens, toggles versions, lights up passages, zooms). Sibling of
// the Labs registry (js/labs-registry.js): a shipped-artifact type whose items live
// in CODE, not the DB, each a synthetic item with an 'interativo:<key>' id the
// renderers pick up with no schema change. Shared seam (js/): consumed by
// Content > Interativos (content/interativos.js) and by Lessons (lessons/lessons.js).
//
// An "Interativo" is NOT a Lab (hands-on exercise) and NOT static Conteúdo (reading
// material): it is "a document you explore". Future ones may not even be documents,
// just interactive HTML.
//
// PROVISIONAL TYPE NAME: the user-facing label lives in ONE i18n key
// (`interativos.type`, mirrored only by the computed `lessons.section_interativos`),
// never hardcoded in this file, so renaming the type is an i18n edit, not a code sweep.
//
// Public API: INTERATIVOS, findItem(idStr), getAllItems(), interativoIcon(key), BASE_PATH.

import { t } from './i18n.js';

// The served HTML lives at `${BASE_PATH}<key>/index.html`, self-contained (CSS/JS
// inline), served as-is by Cloudflare Pages. Adding a new Interativo = (1) drop the
// folder codex/interativos/<key>/index.html, (2) add one entry to INTERATIVOS below.
export const BASE_PATH = '/codex/interativos/';

const ID_PREFIX = 'interativo:';

// Shipped data. Each entry: key (folder + id), title, summary ("o que é"),
// description, objective, and an optional `icon` (a 'glyph:<name>' from js/glyphs.js;
// defaults to the family glyph). The three text beats mirror the Lab card.
export const INTERATIVOS = [
  {
    key: 'demo-peca',
    title: 'Escrever para a IA: a mesma causa, dois jeitos',
    summary: 'Uma petição real em duas versões, com as regras que acendem cada trecho',
    description: 'Um documento jurídico em duas versões (antes / depois) que o aluno alterna, com uma camada de regras que acende o trecho correspondente. Explora-se abrindo, trocando de versão, acendendo os trechos e dando zoom.',
    objective: 'Ver, no mesmo texto, o que muda quando se escreve pensando na leitura da IA.',
    icon: 'glyph:layers',
  },
  {
    key: 'injecao-joaninha',
    title: 'Injeção em PDF: o que o olho vê e o que a IA lê',
    summary: 'A história da Joaninha: texto invisível num PDF faz a IA ler outra versão',
    description: 'Um conto infantil doce vira, na leitura da IA, uma versão sombria: quatro táticas escondidas no mesmo PDF (branco no branco, dado oculto na tabela, trecho fora da página, camada de texto trocada). O aluno alterna entre "o que o olho vê" e "o que a IA lê" e acende cada tática.',
    objective: 'Reconhecer injeção de prompt em documento: o que a pessoa lê pode divergir do que a IA resume.',
    icon: 'glyph:biohazard',
  },
];

// Family glyph for the type (echoes "explore"); each item may override via `icon`.
const FAMILY_GLYPH = 'glyph:compass';
export function interativoIcon(key) {
  const it = INTERATIVOS.find((x) => x.key === key);
  return (it && it.icon) || FAMILY_GLYPH;
}

// Build the synthetic item shape the renderers expect (mirrors labs-registry's
// labToItem). type_label is read from the single i18n source at call time, so a
// rename of the provisional type name propagates to every consumer at once.
function toItem(it) {
  return {
    id: ID_PREFIX + it.key,
    type: 'interativo',
    type_label: t('interativos.type'),
    type_icon: interativoIcon(it.key),
    title: it.title,
    summary: it.summary,
    description: it.description || '',
    objective: it.objective || '',
    meta_json: { url: BASE_PATH + it.key + '/' },
  };
}

export function findItem(idStr) {
  if (!idStr || String(idStr).indexOf(ID_PREFIX) !== 0) return null;
  const key = String(idStr).slice(ID_PREFIX.length);
  const it = INTERATIVOS.find((x) => x.key === key);
  return it ? toItem(it) : null;
}

// Every Interativo in synthetic item shape (Content subtab + Lessons section).
export function getAllItems() {
  return INTERATIVOS.map(toItem);
}
