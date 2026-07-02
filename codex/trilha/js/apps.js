// codex/trilha/js/apps.js
// Aplicativos tab: the granted apps for this turma, each as a full card (name + tagline +
// benefits + access note + download). The tab surfaces only when the turma has at least one
// app whose lesson has occurred (the backend happened-gate already filtered state.data.apps),
// and the tab is NAMED after the single app when there is exactly one (page.js owns the tab
// label). The same buildAppCard also renders inside the lesson body (aulas.js), so the two
// never drift. Registers its renderer with the page orchestrator.
import { state } from './state.js';
import { registerRenderer } from './page.js';
import { buildAppCard } from './app-card.js';
import { t } from '../i18n.js';

export function renderApps() {
  const container = document.getElementById('cdx-tr-apps-list');
  if (!container) return;
  const apps = (state.data && state.data.apps) || [];
  container.innerHTML = '';
  if (!apps.length) {
    container.innerHTML = '<div class="cdx-tr-empty">' + t('apps.empty') + '</div>';
    return;
  }
  apps.forEach((app) => container.appendChild(buildAppCard(app)));
}

registerRenderer('apps', renderApps);
