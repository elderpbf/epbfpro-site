// js/content-err.js
// Shared error-message formatter for the Content sub-tabs.
//
//   errMsg(e) -> "<localized content.error>: <detail>"
//
// Extracted from the byte-identical _err() copies that lived in apostila.js,
// item-form.js, items.js, presets.js, releases.js and tarefas.js.

import { t } from './i18n.js';

export function errMsg(e) {
  return t('content.error') + ': ' + ((e && e.message) || e);
}
