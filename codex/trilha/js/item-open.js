// codex/trilha/js/item-open.js
// OPENING AN ITEM, once.
//
// Élder, 2026-08-17, looking at the action button sitting in the wrong place on one tab and not
// the other: *"this should not be two different components, they do the same thing, why are you
// duplicating functions... the solution is not to add the function to the second one, is to
// remove the duplication"*.
//
// The two cards (sub.js in the Aulas tab, flat.js in Apostila and Outros) each carried their own
// copy of: fetch ct_get_item_public, overlay the lab and interativo registries, choose between
// renderProjeto and renderItem, mount the action, log the failure. Identical work, written twice,
// and it had already drifted: flat.js called NEITHER overlay, so the same lab opened from Outros
// showed the stale description the database holds while the one opened inside its lesson showed
// the current one. Two components, two behaviours, one of them wrong.
//
// What each card still owns is the only thing that genuinely differs: WHERE the body goes (a
// sibling node for the sub-row, a child for the flat card) and where its button is mounted.
import { state } from './state.js';
import { trail } from './api.js';
import { renderItem } from '../../js/item-render.js';
import { overlayLabItem } from './lab-overlay.js';
import { overlayInterativoItem } from './interativo-overlay.js';
import { isProjeto, renderProjeto } from './projeto.js';

// Fill `host` with the item's content and mount its action. Returns the fetched item, or null if
// it could not be loaded (the message is already on screen by then).
//   o.aulaNumber   which lesson the student is looking at. The Worker honours it only when the
//                  item is actually bound to that lesson, so it selects a list, never unlocks one.
//   o.subBuilder   how to build a child row, for an item that packages others
//   o.mountAction  (fetchedItem) => void, the card's own way of showing the action
//   o.logTag       which surface is reporting, for the debug pill
export async function openItemInto(host, item, o = {}) {
  if (!host) return null;
  host.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  try {
    const data = await trail.itemPublic({
      client_slug: state.clientSlug,
      turma_slug: state.turmaSlug,
      token: state.token,
      item_id: item.id,
      session_token: state.sessionToken,
      aula_number: o.aulaNumber != null ? o.aulaNumber : undefined,
      _silent: true,
    });
    // A lab's and an interativo's real text lives in the frontend registry; the copy in the
    // database goes stale (§18). Overlaying here is what makes both tabs agree.
    overlayLabItem(data.item);
    overlayInterativoItem(data.item);
    host.innerHTML = '';
    // A packager renders no content of its own: it lists its children, each a row built by the
    // caller's own builder, so a child opens, copies and downloads on its own.
    if (isProjeto(data.item)) renderProjeto(data.item, host, o.subBuilder, o.opts || {});
    else renderItem(data.item, host, { preview: true });
    if (typeof o.mountAction === 'function') o.mountAction(data.item);
    return data.item;
  } catch (e) {
    if (window.bsLog) window.bsLog('trilha ' + (o.logTag || 'item') + ' itemPublic: ' + ((e && e.message) || e), 'error');
    host.innerHTML = '<div class="cdx-tr-empty">Erro ao carregar conteúdo.</div>';
    return null;
  }
}
