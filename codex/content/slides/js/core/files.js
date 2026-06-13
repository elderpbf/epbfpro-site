// core/files.js — browser file helpers for the image gallery: read a picked File into a
// data: URL or raw base64, and a default "image store" that keeps the bytes inline as a
// data URL. The R2-backed store (adapters/imageStore.js) reuses fileToBase64 for upload;
// the editor core falls back to makeDataUrlStore() when no backend store is injected
// (the harness / offline), so the gallery works in every build. FileReader is browser-
// only, but nothing here runs at import time, so the module still loads under node.

/** Read a File into a `data:<mime>;base64,...` URL. */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/** Read a File into raw base64 (no data: prefix), the shape upload_image expects. */
export async function fileToBase64(file) {
  const dataUrl = await fileToDataURL(file);
  return String(dataUrl).split(",")[1] || "";
}

/** The universal fallback storage backend: embed the image in the deck as a data URL.
 *  Works with no backend and persists with the deck. .put(file) -> { url, name }. */
export function makeDataUrlStore() {
  return {
    async put(file) {
      return { url: await fileToDataURL(file), name: (file && file.name) || "" };
    },
  };
}
