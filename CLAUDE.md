# DualRead — Working Notes for Claude

## Commenting policy (project override)

Write comments. The user wants code documented, not minimal.

- **Every non-trivial function gets a short header comment** explaining its purpose and anything non-obvious about its contract (ownership, side effects, error modes, timing).
- **Explain the *why*, not the *what*.** Don't narrate syntax. Do call out:
  - hidden invariants or ordering requirements
  - Chrome API quirks (storage quotas, service-worker eviction, CSP, user-gesture rules)
  - why an edge case is handled the way it is
  - rollback / retry logic intent
- **Section banners** (`// ───── Name ─────`) are welcome in longer files to aid navigation.
- **Don't reference the current PR, ticket, or task** — those belong in commit messages.
- Keep comments in English for now; UI strings are localized separately via `src/sidepanel/i18n.ts`.

This overrides the default "no comments" stance. Apply it consistently going forward and when touching existing code.

## Tech stack ground rules

- TypeScript 5.7 strict, React 19, Vite 6 + `@crxjs/vite-plugin`
- Native CSS with CSS variables in `src/sidepanel/styles.css`; design tokens mirrored in `src/sidepanel/tokens.ts`
- Chrome MV3 — background is a module service worker; expect eviction
- Runtime i18n via `DR_STRINGS` dict, not `chrome.i18n` (v1)
- Node pinned to 20 via `.nvmrc`

## Storage layers

- `chrome.storage.sync` — vocab (per-word keys `v:<word_key>`); cross-device
- `chrome.storage.local` — settings, write buffer (`write_buffer`), `last_synced_at`
- `chrome.storage.session` — translation cache, latest selection (clears on restart)

## Message flow

All cross-context communication goes through `src/shared/messages.ts`. Discriminated `Message` union; responses are `{ ok: true, data? } | { ok: false, error }`.

## Build & verify

```sh
nvm use 20
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
```
