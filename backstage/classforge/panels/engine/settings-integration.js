// engine/settings-integration.js
//
// Builds the Panels v2 settings-drawer section array for a presentation and
// wires it to the runtime. Returned sections are passed into attachTopbar's
// `sections` option, which forwards them to SettingsDrawer.init.
//
// Does NOT reuse window.PresentationSettings.buildSections; that shared helper
// routes through the 6-var writer (html-slides/theme.js) and is retained only
// for the HTML Slides panel type. Panels v2 builds its own section here so
// the full v2 token set is applied without redundant writes.
//
// Dependencies (globals, loaded via classic <script> tags):
//   window.ThemeRegistry  (from /backstage/js/theme-registry.js)
//
// Example usage (inside a presentation module script):
//
//   import { createRuntime, defaultLoadPanel } from '../../engine/runtime.js';
//   import { registry } from '../../engine/registry.js';
//   import { attachTopbar } from '../../engine/topbar-integration.js';
//   import { attachSettings } from '../../engine/settings-integration.js';
//
//   const runtime = createRuntime({ manifest: 'manifest.json', host, registry, loadPanel: defaultLoadPanel });
//   const sections = attachSettings(runtime, { slug: 'smoke-test' });
//   attachTopbar(runtime, { title: 'ClassForge', backLink: '/backstage/classforge/', sections });
//   runtime.start();

import { applyTheme, restorePersistedTheme } from './theme-integration.js';

function buildThemeSection(slug, runtime) {
  const gridId = 'pn-theme-grid';
  const creatorId = 'pn-theme-creator';

  function onThemeSelected(name) {
    applyTheme(name, { slug });
    if (runtime && typeof runtime.setActiveTheme === 'function') {
      runtime.setActiveTheme(name);
    }
    renderGrid();
  }

  function openCreator(editingName) {
    const creator = document.getElementById(creatorId);
    if (!creator || !window.ThemeRegistry || typeof window.ThemeRegistry.renderCreator !== 'function') return;
    creator.hidden = false;
    window.ThemeRegistry.renderCreator(creator, {
      prefix: 'pn-tc-',
      editingName: editingName || null,
      onSave: (theme) => {
        onThemeSelected(theme.name);
        creator.hidden = true;
      },
    });
  }

  function renderGrid() {
    const container = document.getElementById(gridId);
    if (!container || !window.ThemeRegistry || typeof window.ThemeRegistry.renderThemeGrid !== 'function') return;
    window.ThemeRegistry.renderThemeGrid(container, {
      onSelect: onThemeSelected,
      onEdit: (name) => openCreator(name),
      onCreate: () => openCreator(null),
    });
  }

  return {
    id: 'pn-theme',
    title: 'Tema',
    content:
      '<p class="bs-hint" style="margin-bottom:0.75rem">Selecione ou crie um tema para a apresentação.</p>' +
      '<div id="' + gridId + '" class="cf-theme-grid"></div>' +
      '<div id="' + creatorId + '" style="margin-top:1.25rem" hidden></div>',
    onOpen: () => {
      renderGrid();
      const creator = document.getElementById(creatorId);
      if (creator) creator.hidden = true;
    },
    onInit: () => {},
  };
}

export function attachSettings(runtime, options = {}) {
  const slug = options.slug || 'default';

  if (typeof window === 'undefined' || !window.ThemeRegistry) {
    console.warn('[panels-settings-integration] ThemeRegistry unavailable; returning empty sections');
    return [];
  }

  const restored = restorePersistedTheme(slug);
  if (restored && runtime && typeof runtime.setActiveTheme === 'function') {
    runtime.setActiveTheme(restored);
  }

  return [buildThemeSection(slug, runtime)];
}
