# Chrome Web Store Listing — DualRead

## Short description (132 chars max)

Save unknown English words as you browse. DualRead auto-highlights them on every page and exports to Anki-ready CSV.

## Detailed description

DualRead is a reading companion for Chinese speakers learning English.

- Select any English word on any webpage — the side panel shows the Chinese translation, the surrounding sentence, and where you found it.
- Save the word with one tap. It's stored in your Chrome profile and follows you across devices automatically (no account needed).
- Every saved word is gently underlined on every page you visit afterwards. Click a highlight to jump back to that word in the side panel — edit your notes, see where you first saw it, or delete it.
- Export your whole vocabulary to CSV any time. Import into Anki or any spreadsheet tool for deeper review.
- No account. No server. No tracking. The only text that ever leaves your browser is the word you select, and only to Google Translate.

Features in this release:
- Chrome Side Panel UI — no popups, no page-layout disruption.
- Simplified Chinese interface by default; English available in settings.
- Auto-highlight toggle, with underline or soft-background style.
- Live sync status indicator (synced / syncing / offline / error) so you always know your saves are safe.
- CSV export with UTF-8 BOM so Excel on Windows reads Chinese correctly.
- Chinese/English level selector to tailor future tutor features (planned).

Planned for v1.1:
- AI tutor tab (Gemini, user-supplied key).
- Native Anki .apkg export.
- Optional cloud sync beyond Chrome Sync's ~500-word ceiling.

## Category

Productivity

## Languages

- UI: Simplified Chinese (default), English
- Target: English-to-Chinese reading support

## Screenshots needed (Chrome Web Store asks for 1–5, 1280×800 recommended)

1. Side panel Translate tab — word + translation + in-context sentence on a real article.
2. Side panel Vocab tab — list with search and a row expanded showing note field.
3. A webpage with a few saved words underlined in orange.
4. Settings — auto-highlight toggle, highlight style picker, sync status indicator.
5. Welcome screen on first run — level selector.

## Privacy policy URL

https://foxsunshine.github.io/DualRead/privacy-policy.html

## Permissions justification (for store review)

- `storage` — save vocabulary + settings locally.
- `sidePanel` — render the extension UI in the Chrome side panel.
- `contextMenus` — reserved for future right-click actions (declared now to avoid a manifest bump later).
- `downloads` — save vocabulary list as a CSV when the user clicks Export.
- `host_permissions: translate.googleapis.com` — contact Google Translate to translate the selected text.
- `content_scripts: <all_urls>` — required so the extension can detect text selection and underline saved words on any page the user visits. The content script only transmits text the user explicitly selects; highlight wrapping happens entirely in the local DOM.
