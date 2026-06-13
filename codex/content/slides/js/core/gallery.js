// core/gallery.js — the deck's central IMAGE GALLERY registry. Every image the user
// uploads (or, later, imports from Drive) is registered here as { id, name, url }, so
// the picker can offer past images first. PURE + DOM-free: list/add/remove/get over
// deck.gallery, the same per-deck registry shape as savedThemes. An absent gallery reads
// as empty (read defensively everywhere), so a legacy deck needs NO migration. This
// module tracks REFERENCES only; the bytes live wherever the injected image store put
// them (an R2 URL in the deployed app, a data: URL offline) — see adapters/imageStore.js.
import { uid } from "./schema.js";

/** All registered images (defensive: absent gallery -> []). */
export function listImages(deck) {
  return (deck && deck.gallery) || [];
}

export function getImage(deck, id) {
  return listImages(deck).find((g) => g && g.id === id) || null;
}

/** Register an image; returns the entry. De-dupes by url so picking the same upload
 *  twice doesn't pile up duplicate tiles (returns the existing entry instead). */
export function addImage(deck, { name, url } = {}) {
  if (!deck || !url) return null;
  const gallery = (deck.gallery = deck.gallery || []);
  const existing = gallery.find((g) => g && g.url === url);
  if (existing) return existing;
  const entry = { id: uid(), name: name || "", url };
  gallery.push(entry);
  return entry;
}

/** Drop an image from the registry by id. Returns whether one was removed. */
export function removeImage(deck, id) {
  if (!deck || !Array.isArray(deck.gallery)) return false;
  const i = deck.gallery.findIndex((g) => g && g.id === id);
  if (i < 0) return false;
  deck.gallery.splice(i, 1);
  return true;
}
