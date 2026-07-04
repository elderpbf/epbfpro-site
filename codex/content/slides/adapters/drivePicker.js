// adapters/drivePicker.js — the Slides image gallery's "import from Google Drive" option.
// The Picker/Drive logic now lives in the shared codex/js/file-source.js (ONE backend for
// Slides + Content, no duplication). This adapter just pins the image view and preserves the
// { available, pick } contract the vendored gallery core consumes as app._drivePicker, so the
// Slides insert looks and behaves exactly as before.
import { createDriveSource } from '../../../js/file-source.js';

export function createDrivePicker({ getApiKey, getToken } = {}) {
  const src = createDriveSource({ getApiKey, getToken });
  return {
    /** Is the Drive option wired yet (the Picker key has arrived)? */
    available() { return src.available(); },
    /** Open the Picker and resolve the chosen image as a File (or null on cancel/no-auth). */
    pick() { return src.pick({ view: 'images' }); },
  };
}
