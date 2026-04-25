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

The user's machine only has Node 20 installed — don't prepend `nvm use 20`
(or `source ~/.nvm/nvm.sh`) to build/test commands; just run them directly.

```sh
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
npm test            # vitest run
```

## Commit policy

The user's past commits (`☘️: vibe coding : xxx`) are deliberately being
retired — from now on you are expected to create **real, structured git
commits on the user's behalf at meaningful checkpoints**, without being
asked every single time. The user has pre-authorized commits *within the
scope rules below*; you still never push, never amend published commits,
never `git reset --hard`, never `--no-verify`.

### When to commit (proactively, without asking)

Commit as soon as **all** of these are true for a coherent unit of work:

1. The work is a single identifiable concern — a feature, a bugfix, a
   refactor, a doc update, a brainstorm landing. Not "everything I
   touched today."
2. `npm run typecheck` passes **and** `npm test` passes (skip `npm run
   build` unless the change could break the bundle; always run it for
   manifest / vite / @crxjs changes).
3. The working tree after the commit would be a clean, rollback-able
   state — not "half of F3 done."
4. You are **not** in the middle of a multi-step user dialogue where
   another turn is imminent (e.g. mid-brainstorming clarification — let
   the user confirm the direction first).

Natural checkpoints that should auto-commit:
- A brainstorm document reaches §7 / §8 Implementation notes status
- A DL-N decision is implemented end-to-end (tests + docs synced)
- A bugfix lands with its regression test and bug doc
- A CLAUDE.md / DESIGN.md / brainstorm-md update stands on its own

If a single user request produced **multiple independent concerns** (e.g.
a feature + an unrelated bug found along the way), split into **two
commits** — do not bundle.

### When NOT to commit

- You're about to ask the user a question — they might redirect you
- Mid-way through a multi-file change where the intermediate state
  doesn't typecheck or breaks a test
- Exploratory edits / experiments you're not sure will survive
- Anything involving credentials, `.env`, new large binaries, or files
  outside the repo's normal scope

### Message format (strict)

Drop the `☘️: vibe coding :` prefix. Use Conventional-Commit–flavored
one-liner subject + short body. Keep it in English.

```
<type>(<scope>): <imperative subject, ≤70 chars>

<optional 2–5 line body explaining the *why*, not the *what*.
Reference DL / D / R IDs where they exist (DL-4, D62, R8) so the
commit threads into the design docs. No PR / issue numbers yet —
this is a solo project.>
```

**Types we use:**

| type | use for |
|---|---|
| `feat` | new user-visible behavior |
| `fix` | bug fix with a reproducer or known failure mode |
| `refactor` | code restructure, no behavior change |
| `perf` | measurable performance improvement |
| `test` | tests only |
| `docs` | markdown / comments only |
| `chore` | deps, config, build plumbing |
| `style` | formatting only (rare — we don't use a formatter) |

**Scopes we use** (pick the narrowest that fits; multi-scope → pick the
most load-bearing):

`content`, `sidepanel`, `background`, `shared`, `bubble`, `hover`,
`toast`, `highlight`, `manifest`, `docs`, `brainstorm`, `cws`,
`tests`, `build`.

**Good examples** (project-specific):

```
feat(bubble): add trash icon + 5s undo toast (DL D58)

Silent delete with viewport-centered toast, reusing the same snapshot
strategy as saved-toast. DELETE_WORD path unchanged; undo re-issues
SAVE_WORD with the original created_at / note.
```

```
fix(content): reject clicks that caretRangeFromPoint snaps to offset 0

caretRangeFromPoint is a nearest-caret API, not a hit-test. Clicks in
a block's left padding were snapping to textNode[0] and firing the
first word. Verify the click actually lands in the word's client rect
before committing. Bug doc: docs/bugs/bug-2026-04-24-*.md.
```

```
docs(brainstorm): lock v2.1.1 (F1–F5) Understanding + DL-1..5
```

```
refactor(clickTranslate): extract paintSavedBubble shared by click + hover
```

**Bad examples** (do not emit):

- `update stuff` — no type, no scope, no why
- `feat: various improvements` — vague scope, vague subject
- `☘️ vibe coding : phase X` — the retired style
- `fix: WIP` — WIP does not land on main

### Mechanics

- Use `git add <specific paths>` — never `git add .` or `git add -A`.
  The user's `.gitignore` is good but a stray `dist/` or `.env` that
  slips in is a real risk.
- Hand-write the message via `git commit -m "$(cat <<'EOF' … EOF)"`
  so multi-line bodies format correctly.
- Include the Co-Authored-By trailer per the global protocol.
- **Do not push.** Pushing is a separate user-initiated action.
- After the commit, run `git status` to confirm a clean tree.

### When unsure, ask — once

If a given checkpoint is ambiguous (e.g. "is this one concern or two?",
"should this commit include the unrelated README tweak I also made?"),
ask the user **one** quick question before committing. Don't wait for
every commit — only the ambiguous ones.
