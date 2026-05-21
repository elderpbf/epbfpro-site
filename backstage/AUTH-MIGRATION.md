# Backstage Auth Migration — Password → Google + Fallback

> Phase brief. Once shipped, the persistent rules from this doc migrate into `Site/backstage/CLAUDE.md` and this file is archived.

## Goal

Make Backstage's auth gate accept **Google sign-in** as the primary path, with the existing `bs_pw_hash` password as a fallback. Every Backstage tool (ClassVault, ClassTrail, ClassPulse, ClassForge, TypeDrill, Adriana-Updates) inherits one Google session, so any future Google integration (Gmail, Calendar, Docs, Sheets, Tasks) needs zero per-tool auth ceremony.

Backstage is the chrome layer. This is its domain.

## Architecture

### Dual-path auth gate

`BS_AUTH.guard()` accepts EITHER:
- A valid Google access token (with `openid email` scope) whose email is on the Backstage allowlist, OR
- A valid `bs_pw_hash` matching the Worker-side hash (current behavior, unchanged)

Login UI primary: large "Entrar com Google" button. Secondary, smaller: "Entrar com senha" link that reveals the existing password input. Password path is a strict fallback for Google outages or locked accounts. No break-glass theater; same risk profile as today, plus Google as the upgraded path.

### Scope set, requested up front

Single consent screen at first Google sign-in, covers everything Backstage tools might need:

- `openid` (required for email claim)
- `email`
- `https://www.googleapis.com/auth/drive.readonly` (already used by ClassVault Phase 5)
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/presentations`

Future scope additions trigger a re-consent (one click for the user). Acceptable.

### Token strategy

- **Storage:** `localStorage['bs_google_token_v1'] = { token, email, expiresAt }`. Survives tab/browser close.
- **Refresh on expiry:** GIS `initTokenClient` with `prompt: ''` (silent). If the user is still signed in to Google in this browser, mints a new access token with no UI. Falls back to popup if signed out.
- **Worker verification:** every Worker request that previously required `bs_pw_hash` now also accepts `Authorization: Bearer <google_access_token>`. Worker calls `https://oauth2.googleapis.com/tokeninfo?access_token=...` and confirms `email` is in the allowlist. ~50ms overhead per call, acceptable for an internal tool.
- **Cache to avoid re-validating per call:** Worker can cache `token → email → allowed` for 5 min via `caches` API. Optional optimization, defer until felt.

### Allowlist

Doppler secret: `BACKSTAGE_GOOGLE_ALLOWLIST` = comma-separated emails. Initial value: `elder777g@gmail.com,epbfpro@gmail.com`. Worker reads at request time. No per-account passwords needed.

### Shared `window.BS_GOOGLE` API

New module: `Site/backstage/js/bs-google.js`. Generic. Replaces the Drive-specific code in `cv-drive-sync.js`.

```js
window.BS_GOOGLE = {
  init(),                          // load GIS, restore cached token, do nothing if cached token still valid
  isAuthed() -> boolean,
  getEmail() -> string,
  requestToken({prompt}) -> Promise<token>,    // popup or silent
  getAccessToken() -> string | null,           // synchronous, returns cached
  signOut() -> void,
  // High-level wrappers (tools call these instead of fetching manually):
  drive: {
    listFolder(folderId) -> Promise<Array<File>>,
    listChildrenOfFolders(folderIds) -> Promise<Map<folderId, Array<File>>>,
  },
  // gmail / calendar / docs / sheets / slides namespaces stub out
  // for now; each gets implemented as tools need them.
};
```

## Work items

### 1. New: `Site/backstage/js/bs-google.js`
- Move GIS init + token client + storage from `cv-drive-sync.js` here, generalized for any scope set.
- Add `drive` namespace with the existing folder-listing logic.
- Wire scope bundle from a constant `BS_GOOGLE_SCOPES = '...'`.
- Use Phase 5's OAuth client ID (`60017317060-le3f1ksschm9vo2qqmt7u9ju8bemqamg.apps.googleusercontent.com`). Same client works.

### 2. Modify: `Site/backstage/js/auth.js`
- `BS_AUTH.guard()` checks Google token first (via `BS_GOOGLE.isAuthed()`); if not, falls back to existing `bs_pw_hash` check.
- If neither: redirect/show login page.
- Add `BS_AUTH.getMethod()` returning `'google' | 'password' | null` so tools can branch on it.
- Add `BS_AUTH.signOut()` that clears both Google and password state.

### 3. Modify: Backstage login page (find existing `Site/backstage/login.html` or wherever the password form lives)
- Primary: "Entrar com Google" button (calls `BS_GOOGLE.requestToken({prompt: 'consent'})` then redirects to `/backstage/`).
- Secondary (collapsed by default, click "Entrar com senha" to reveal): existing password input.
- Error messages PT-BR.

### 4. Modify: Worker — `Backstage/api/src/index.js`
- New helper `_verifyGoogleAccessToken(token)`: calls tokeninfo, returns `{ ok, email }`.
- New helper `_isAllowlistedEmail(email)`: checks against `env.BACKSTAGE_GOOGLE_ALLOWLIST` (Doppler secret).
- Replace the existing password-check middleware with: try Google verification first; if Bearer header present and email allowlisted → ok. Else fall back to existing `bs_pw_hash` check.
- Add Doppler secret `BACKSTAGE_GOOGLE_ALLOWLIST` (comma-separated emails). Initial value: `elder777g@gmail.com,epbfpro@gmail.com`.

### 5. Refactor: `Site/backstage/classvault/js/cv-drive-sync.js`
- Strip out GIS init, token storage, popup flow. Delegate all of that to `BS_GOOGLE`.
- Keep: Drive folder fetching, item synthesis, MIME mapping (these stay ClassVault-specific).
- Result: file shrinks from ~330 lines to ~100.

### 6. Modify: `Site/backstage/classvault/js/classvault.js`
- Drop the "Conectar Drive" CTA from the Drive section render — user is already authed at Backstage entry, so Drive sync auto-runs on Vault boot.
- If `BS_GOOGLE.isAuthed()` is false at boot (user signed in via password fallback), show a small "Conectar para sincronizar Drive" prompt inside the Drive section, which calls `BS_GOOGLE.requestToken()` to upgrade their session in-place.

### 7. New: `Site/backstage/CLAUDE.md`
Permanent doc for Backstage's auth contract. Sections:
- **Rule: Dual-path auth.** Google primary, password fallback. Tools never re-authenticate; they read from `window.BS_GOOGLE`.
- **Rule: Adding new scopes.** Edit `BS_GOOGLE_SCOPES` constant; existing users get re-consent popup on next session. Document the user-visible impact.
- **Rule: Adding new tools.** New tool consumes `window.BS_GOOGLE.<service>` (drive, gmail, ...). If the service namespace doesn't exist yet, the first consumer adds it to `bs-google.js`.
- **Rule: Allowlist changes.** Edit `BACKSTAGE_GOOGLE_ALLOWLIST` in Doppler. Worker picks up at next request.
- **Architecture: how Worker verifies.** Tokeninfo on Bearer header; falls back to `bs_pw_hash` if no Bearer.

### 8. Cache-bust bumps in all consumer `index.html` files
- `Site/backstage/index.html` (login)
- `Site/backstage/classvault/index.html`
- Any other tool's `index.html` that loads `auth.js`

### 9. Doppler
- Add secret `BACKSTAGE_GOOGLE_ALLOWLIST` (project: `backstage`, env: `prd` AND `dev`). Value: `elder777g@gmail.com,epbfpro@gmail.com`.

## Out of scope (this phase)

- Gmail / Calendar / Docs / Sheets / Slides API namespaces beyond the `BS_GOOGLE.<service>` stubs. Each gets implemented when its first consumer tool ships.
- Token expiry UX polish (toast on silent refresh failure, etc). Phase 2.
- Backstage manifest folder structure. Deferred until Backstage gets formally bootstrapped as a tracked project.
- Drop the password path entirely. Stays as fallback indefinitely until we have a reason to remove it.

## Validation checklist

- [ ] Cold load `pensoia.com/backstage/` → login page shows Google button primary + password fallback secondary.
- [ ] Click Google button → consent screen lists all 8 scopes → approve → redirect to backstage landing → authed.
- [ ] Token persists across browser restart (localStorage, not sessionStorage).
- [ ] Token expires after 1h → next Worker call silently refreshes; user sees nothing.
- [ ] Sign out from Google in another tab → Backstage call returns 401 → frontend bounces to login.
- [ ] Password path still works: enter existing password → authed → Drive section in ClassVault shows "Conectar para sincronizar Drive" prompt (since this user is password-authed, no Google scope).
- [ ] Click that prompt → Google consent → Drive section populates without redirecting.
- [ ] Add a non-allowlisted email to Google sign-in → Worker rejects → user sees "Conta não autorizada" message.
- [ ] ClassVault Drive section auto-syncs on Vault load when Google-authed (no "Conectar Drive" button).
- [ ] All Backstage tools (ClassTrail, ClassPulse, ClassForge admin if applicable) still load and function.

## Risk + open questions

- **Workers `caches` API for tokeninfo caching:** worth doing? 50ms × every API call adds up. Decide based on observed latency after rollout.
- **localStorage vs HttpOnly cookie:** localStorage is fine for an internal tool with allowlist + 1h tokens. Cookie would be more secure against XSS but requires server-side session state. Defer.
- **OAuth consent for new scopes:** when we add a scope later, existing users get re-prompted. Surfaces user-visible. Document in Site/backstage/CLAUDE.md.
- **Migration cutover:** existing `bs_pw_hash` sessions remain valid throughout. Users opt in to Google by clicking the button. No forced re-auth.
