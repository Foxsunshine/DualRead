# DualRead

A Chrome side-panel extension for Chinese speakers learning English. Save unknown words as you browse, and watch them auto-highlight every time they appear on any page.

## How it works

1. **Select** any English text on any webpage — the side panel shows a Chinese translation, the surrounding sentence, and where you found it.
2. **Save** interesting words to your personal vocab list (stored in `chrome.storage.sync`, so it follows your Chrome profile across devices).
3. **Recognise** — every saved word is gently underlined on every page you visit afterwards. Click a highlight to jump back to that word's entry in the side panel.
4. **Export** to CSV whenever you want to import into Anki or any spreadsheet.

No account. No backend. No telemetry. Only the text you explicitly select ever leaves your browser, and only to the translation API.

## Install (from source)

```sh
nvm use 20
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `dist/` folder. **Not** the project root — `@crxjs/vite-plugin` emits a Chrome-compliant MV3 bundle to `dist/`.

## Develop

```sh
npm run dev          # Vite dev server, HMR for the side panel
npm run typecheck    # tsc -b --noEmit
npm run build        # production build → dist/
```

Live-reload: `npm run dev` keeps a watcher running. Side-panel changes hot-reload automatically; content-script or background changes require the extension's reload button at `chrome://extensions`.

## Tech stack

- TypeScript 5.7 (strict) + React 19
- Vite 6 + `@crxjs/vite-plugin` (MV3 manifest rewriting, HMR, service-worker bundling)
- Native CSS + CSS variables (design tokens mirrored in `src/sidepanel/tokens.ts`)
- Chrome MV3 — module service worker, side-panel UI, content script for the highlight engine
- Node 20 (pinned via `.nvmrc`)

## Architecture at a glance

```
content script ──┐            ┌── side panel (React)
(selection +     │            │   - Translate / Vocab / Settings tabs
 highlight       │            │   - useSelection / useVocab /
 engine)         │            │     useFocusWord / useSyncStatus hooks
                 ▼            ▲
              background service worker
                 · translate proxy (Google Translate)
                 · message router
                 · vocab write buffer (debounced sync flush)
```

- Vocab lives in `chrome.storage.sync` under per-word keys `v:<word_key>` — gives us ~500-word headroom under the 100 KB total cap and per-key last-write-wins across devices.
- Settings, write buffer, and last-sync / last-error metadata live in `chrome.storage.local` — device-local, no quota pressure.
- Translation cache lives in `chrome.storage.session` — wiped on browser restart.

Full design rationale and decision log: see [`DESIGN.md`](./DESIGN.md).

## Data & privacy

- **What is sent to a server?** Only the text you select, and only to `translate.googleapis.com`. Nothing else touches any network we control, because there *is* no network we control.
- **What is stored?** Your saved vocab (Chrome Sync), your settings (local), and a transient translation cache (session). No analytics. No telemetry.
- **Privacy policy:** [`privacy-policy.html`](./privacy-policy.html)

## Status

- Phases 0 → 3 shipped (TS/React migration, side-panel shell, vocab storage + CSV export, highlight engine with click-to-focus).
- Phase 4 in progress: Chrome Web Store listing, first-run polish, sync-status indicator.

## License

MIT.
