# PensoIA Site

> Last updated: 2026-04-18 -- Initial creation

## Goal
The public showcase at pensoia.com -- marketing surface for PensoIA consultancy (AI and prompt engineering for legal professionals). Single page, bilingual PT-BR/EN, dark-mode capable.

**Site is not the products.** Backstage, Adriana-Updates, and the student-facing `/go/` tools are separate projects with their own manifests. They deploy alongside the Site because they share the Hostinger repo and domain, but their code, roadmaps, and evolution are independent.

| Layer | Purpose | Project | URL |
|---|---|---|---|
| Showcase | Marketing / landing | **Site** (this manifest) | pensoia.com/ |
| Product -- teaching tools | Private portal | Backstage | pensoia.com/backstage/ |
| Product -- student-facing | Live classroom join | Backstage (go/) | pensoia.com/go/ |
| Product -- health updates | Adriana timeline | Adriana-Updates | pensoia.com/adriana/ |
| Tool -- typing trainer | Personal ABNT2 trainer | TypeDrill | pensoia.com/backstage/typedrill/ |

## Progress
Current state: Phase 1 complete (landing page, dark mode, i18n, favicon set, icon system, Hostinger auto-deploy). No active task.

Last phase: Phase 1 -- Foundation
Last task: 1E -- Hostinger git-webhook deploy pipeline
Current task: no task currently in development

Next task: awaiting direction -- candidates are Phase 2 (SEO, accessibility, LGPD compliance)

## Scope
**Owns:** `index.html`, `css/`, `js/`, `images/`, `favicon*.{ico,png}`, `apple-touch-icon.png`, `android-chrome-*.png`, `site.webmanifest`, `README.md`. Concerns: landing page, dark mode, i18n, SEO, CTAs, contact form, legal pages, PWA webmanifest, Hostinger deploy pipeline, cache-busting `?v=X.X` convention.

**Does not own** (lives on disk but belongs to other manifests): `backstage/` (Backstage), `backstage/typedrill/` (TypeDrill), `adriana/` (Adriana-Updates), `go/` (Backstage), `classforge/` and `classpulse/` (legacy, superseded by Backstage sub-apps), `OneSignalSDKWorker.js` (Adriana-Updates -- push notifications service worker at repo root for OneSignal scope reasons).

## Linked Projects
- Backstage -- private products portal. Frontend deployed at pensoia.com/backstage/ and pensoia.com/go/.
  Path: $PROJECTS_DIR/PensoIA/Backstage
  MANIFEST: $PROJECTS_DIR/PensoIA/Backstage/MANIFEST.md

- Adriana-Updates -- health updates timeline. Frontend deployed at pensoia.com/adriana/.
  Path: $PROJECTS_DIR/PensoIA/Adriana-Updates
  MANIFEST: $PROJECTS_DIR/PensoIA/Adriana-Updates/MANIFEST.md

- TypeDrill -- personal ABNT2 typing trainer. Frontend deployed at pensoia.com/backstage/typedrill/ (inside Backstage shell for auth only; planning independent).
  Path: $PROJECTS_DIR/PensoIA/TypeDrill
  MANIFEST: $PROJECTS_DIR/PensoIA/TypeDrill/MANIFEST.md

## Workflow
tasks → planning → execute → manifest-update

- **tasks**: view or update the task list
- **planning**: write an execution brief for a new task
- **execute**: implement a task with a step-by-step approval loop
- **manifest-update**: log progress and update this file at session end

## Stack and Paths
Stack: Vanilla HTML / CSS / JS. MVC separation (translations as Model; index.html + css/ as View; ThemeManager / LanguageManager classes as Controller). CSS variables for theming, CSS filters for brand-colored PNG icons, site.webmanifest for PWA.

- Path: $PROJECTS_DIR/PensoIA/Site/
- Repo: github.com/elderpbf/epbfpro-site (public, shared with Backstage/Adriana)
- Deploy: `dev` → staging.pensoia.com; `master` → pensoia.com (Hostinger webhook auto-deploy)
- Cache busting: increment `?v=X.X` on all `css/*.css` and `js/*.js` references in `index.html` before every push

## Working Style
- Brand switcher lives at `js/brand.js` -- toggle `ACTIVE_BRAND = 'pensoia' | 'epbf'`. See ARCHITECTURE.md for the full switch map.
- Always test on staging first; never push directly to master
- Hard-refresh (Ctrl+Shift+R) when verifying production after a deploy

## Key Decisions
2026-02-05 -- Vanilla HTML/CSS/JS chosen over any framework -- keeps the site a static deploy target; no build step; Hostinger serves the tree as-is.
2026-02-05 -- Hostinger git-webhook auto-deploy replaces manual upload -- eliminates FTP / File Manager step; `dev`→staging and `master`→production separate the review loop from production.
2026-04-18 -- Scope lock: Site owns landing-page code only -- Backstage/Adriana/Go directories share this repo for Hostinger convenience but are owned by their own manifests. Prevents cross-project edits under Site tasks.

## References
manifest/TASKS.md -- Task history (Phase 1 done) and Phase 2-5 upcoming work
manifest/ARCHITECTURE.md -- Brand switcher, MVC layout, CSS filter theming, Hostinger deploy + troubleshooting
manifest/LOGS.log -- Sequential update log
