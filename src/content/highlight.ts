// DualRead highlight engine.
//
// Wraps every occurrence of saved-vocab words in `<span class="dr-hl">` on the
// host page, tracks DOM changes so SPAs stay highlighted, and re-emits a
// synthetic click signal when the user clicks a wrapped word.
//
// Design rationale (see DESIGN.md §7):
//   - DOM-wrap (TreeWalker + MutationObserver) was chosen over the CSS Custom
//     Highlight API because we need per-element click events on each match.
//   - We NEVER build HTML via innerHTML — only `createElement` + `splitText`
//     so no host-page string can smuggle markup into our tree.
//   - The matcher is one batched regex `\b(word1|word2|…)\b` with the `i` flag.
//     At the v1 500-word cap one regex is sufficient; chunking hook is kept
//     in `rebuildMatcher` for when that ceiling moves.
//   - MutationObserver callbacks are debounced (100 ms) and only the *added*
//     subtrees are rescanned. Rebuilds after a vocab change are throttled to
//     500 ms to avoid thundering-herd re-scans when 20 tabs all react to a
//     single VOCAB_UPDATED broadcast.
//   - Our own wrapped spans carry `.dr-hl`, and `shouldVisitText` rejects any
//     text node inside one, so re-entering the MO callback because of our
//     *own* mutations is safe and idempotent.
//
// Public shape: a single `createHighlighter()` factory returns an object with
// `setVocab`, `setEnabled`, `setStyle`, and `dispose`. The orchestrator in
// content/index.ts owns that instance and drives it from settings + vocab.

import type { HighlightStyle } from "../shared/types";

const HIGHLIGHT_CLASS = "dr-hl";
const STYLE_ATTR = "data-dr-hl-style";

// Element tags whose text we never touch — either they carry code / user
// input or rendering-sensitive content. Matches the DESIGN.md §7 list plus a
// few obvious MV3/SPA hazards (iframes' text is inaccessible anyway, but
// listing them keeps the filter explicit).
const EXCLUDED_TAGS = new Set<string>([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "IFRAME",
  "OBJECT",
  "EMBED",
]);

const MO_DEBOUNCE_MS = 100;
const REBUILD_THROTTLE_MS = 500;

// v1.1: instead of sendMessage-ing OPEN_WORD when a highlight is clicked,
// the module invokes this callback and lets the orchestrator decide what
// to do. Passing the element along lets the caller compute a bounding
// rect for bubble anchoring without a second DOM walk.
export interface HighlighterOptions {
  onHighlightClick?: (args: { word_key: string; element: HTMLElement }) => void;
  // Mouse moved across the boundary of a `.dr-hl` span. `kind` flags
  // entry vs leave so the orchestrator can mount or schedule-hide the
  // hover-preview bubble. Detection accounts for nested DOM transitions
  // inside the same span (so e.g. moving across a `<sup>` inside a
  // wrapped word doesn't fire spurious enter/leave pairs).
  onHighlightHover?: (args: {
    word_key: string;
    element: HTMLElement;
    kind: "enter" | "leave";
  }) => void;
}

export interface Highlighter {
  /** Replace the active vocab set; triggers a throttled full re-scan. */
  setVocab(keys: string[]): void;
  /** Toggle the whole engine on/off; off unwraps all existing spans. */
  setEnabled(enabled: boolean): void;
  /** Swap visual variant. Purely a CSS hook via a document-level attribute. */
  setStyle(style: HighlightStyle): void;
  /** Tear down observer + listeners. Leaves wrapped spans alone. */
  dispose(): void;
}

// Escape a user-supplied string for safe inclusion in a regex alternation.
// Word keys are usually plain letters, but apostrophes ("don't") and hyphens
// ("state-of-the-art") need to survive literally.
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build `\b(a|b|c)\b` from a word-key list. Returns null for an empty set so
// callers can cheaply short-circuit into "no matches possible".
//
// Sort longest-first so that if two vocab entries share a prefix ("run" and
// "running"), the alternation tries the longer branch first. `\b` boundaries
// already prevent `run` from matching inside `running`, but we keep the sort
// as defensive insurance against future expansions to multi-word phrases.
function buildMatcher(keys: string[]): RegExp | null {
  if (keys.length === 0) return null;
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  const alternation = sorted.map(escapeForRegex).join("|");
  return new RegExp(`\\b(?:${alternation})\\b`, "gi");
}

// Gate for the TreeWalker. Rejecting a text node stops walking into it but
// does not halt the walk itself — the walker moves on to the next candidate.
function shouldVisitText(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (EXCLUDED_TAGS.has(parent.tagName)) return false;
  // contenteditable hosts are user input; never mutate them.
  if (parent.closest('[contenteditable="true"], [contenteditable=""]')) return false;
  // Our own wrapped spans — skip so we don't re-wrap.
  if (parent.closest(`.${HIGHLIGHT_CLASS}`)) return false;
  // Empty / whitespace-only nodes can't contain a match.
  if (!node.data || !/\S/.test(node.data)) return false;
  return true;
}

// Rewrite one text node: find all regex matches, rebuild the node as a
// fragment of (text | span)* slices, swap in place. If there are no matches
// we leave the node untouched so the DOM identity stays stable for React /
// framework-driven pages.
function wrapTextNode(node: Text, re: RegExp): void {
  const text = node.data;
  re.lastIndex = 0;

  // Collect hit spans first so we only touch the DOM when there's work.
  const hits: Array<{ start: number; end: number; word: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
    // Guard against zero-width matches (can't happen with \b(..)\b, but
    // future regex edits might allow empty alternatives).
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (hits.length === 0) return;

  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, hit.start)));
    }
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    // `data-word` is the canonical (lowercased) key that maps back to the
    // VocabWord in storage; click handler reads it verbatim.
    span.dataset.word = hit.word.toLowerCase();
    // textContent (not innerHTML) — the match is user-selected text from the
    // host page, and even though we sanitize the storage layer, defence in
    // depth matters here because arbitrary pages are the input domain.
    span.textContent = text.slice(hit.start, hit.end);
    frag.appendChild(span);
    cursor = hit.end;
  }
  if (cursor < text.length) {
    frag.appendChild(document.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(frag, node);
}

// Walk a subtree and wrap every eligible text node. `root` may itself be a
// text node — supporting that shape lets the MO path pass addedNode values
// straight through without special-casing.
function scanSubtree(root: Node, re: RegExp): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (shouldVisitText(root as Text)) wrapTextNode(root as Text, re);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

  // If the root itself is an excluded container (e.g., <script>) bail.
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (EXCLUDED_TAGS.has(el.tagName)) return;
    if (el.classList?.contains(HIGHLIGHT_CLASS)) return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      shouldVisitText(n as Text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });

  // Drain the walker into a list first. We can't safely wrap in-flight
  // because the mutation invalidates the walker's internal cursor.
  const texts: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) texts.push(n as Text);
  for (const t of texts) wrapTextNode(t, re);
}

// Reverse the wrap. Replace every `.dr-hl` span inside `root` with a plain
// text node carrying its textContent, then `normalize()` the parent so
// adjacent text nodes merge back into one. Full opt-out, not CSS-hidden.
function unwrapAll(root: ParentNode = document.body): void {
  if (!root) return;
  const spans = root.querySelectorAll(`span.${HIGHLIGHT_CLASS}`);
  const parents = new Set<Node>();
  spans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
    parents.add(parent);
  });
  // Merge freshly adjacent text nodes so the DOM looks like we were never here.
  parents.forEach((p) => {
    (p as Element).normalize?.();
  });
}

export function createHighlighter(options: HighlighterOptions = {}): Highlighter {
  const { onHighlightClick, onHighlightHover } = options;
  let matcher: RegExp | null = null;
  let vocabKeys: string[] = [];
  let enabled = false;
  let observer: MutationObserver | null = null;

  // MO bookkeeping. We coalesce added nodes across a burst of mutations into
  // one set, then drain on a single debounced pass.
  let pendingAdded = new Set<Node>();
  let moTimer: number | null = null;

  // Full-rebuild throttle. `setVocab` can fire rapidly while the user is
  // editing notes (each save → VOCAB_UPDATED → re-scan), and when 20 tabs
  // all react to the same broadcast we need to avoid a thundering herd of
  // full-page walks. Strategy: leading edge runs immediately so the first
  // highlight appears with no perceptible lag; every subsequent call within
  // `REBUILD_THROTTLE_MS` is coalesced into one trailing drain.
  let rebuildTimer: number | null = null;
  let rebuildPending = false;
  let lastRebuildAt = 0;

  // The click handler is installed once and stays installed — it's cheap and
  // the saved-word UX is the whole point of the highlight. Capture phase so
  // host handlers can't stopPropagation away before we see the event.
  //
  // v1.1 (D51): we no longer send OPEN_WORD/FOCUS_WORD_IN_VOCAB ourselves.
  // Instead we invoke `onHighlightClick` and let the orchestrator show the
  // in-page bubble. The only side effects we still own are preventDefault
  // + stopPropagation (so the containing `<a>` doesn't navigate).
  const onClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    const hl = target?.closest?.(`span.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    if (!hl) return;
    const word_key = hl.dataset.word;
    if (!word_key) return;
    e.preventDefault();
    e.stopPropagation();
    onHighlightClick?.({ word_key, element: hl });
  };

  // Hover delegation. mouseover / mouseout are used (not mouseenter /
  // mouseleave) because the latter pair don't bubble and cannot be
  // delegated from `document`. We dedupe spurious cross-child events
  // by comparing the highlight ancestor of `target` against the
  // highlight ancestor of `relatedTarget` — moving inside the same
  // span is a no-op.
  const onMouseOver = (e: MouseEvent): void => {
    if (!onHighlightHover) return;
    const target = e.target as Element | null;
    const hl = target?.closest?.(`span.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    if (!hl) return;
    const related = e.relatedTarget as Element | null;
    const relatedHl = related?.closest?.(`span.${HIGHLIGHT_CLASS}`);
    if (relatedHl === hl) return;
    const word_key = hl.dataset.word;
    if (!word_key) return;
    onHighlightHover({ word_key, element: hl, kind: "enter" });
  };

  const onMouseOut = (e: MouseEvent): void => {
    if (!onHighlightHover) return;
    const target = e.target as Element | null;
    const hl = target?.closest?.(`span.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    if (!hl) return;
    const related = e.relatedTarget as Element | null;
    const relatedHl = related?.closest?.(`span.${HIGHLIGHT_CLASS}`);
    if (relatedHl === hl) return;
    const word_key = hl.dataset.word;
    if (!word_key) return;
    onHighlightHover({ word_key, element: hl, kind: "leave" });
  };

  const scheduleMoFlush = (): void => {
    if (moTimer !== null) return;
    moTimer = window.setTimeout(() => {
      moTimer = null;
      if (!enabled || !matcher) {
        pendingAdded.clear();
        return;
      }
      const batch = Array.from(pendingAdded);
      pendingAdded.clear();
      for (const node of batch) {
        // A host-page framework may have removed the node before we got to
        // it — isConnected is cheap and avoids an exception from the walker.
        if (!node.isConnected) continue;
        scanSubtree(node, matcher);
      }
    }, MO_DEBOUNCE_MS);
  };

  const mutationCallback: MutationCallback = (mutations) => {
    if (!enabled || !matcher) return;
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n as Element;
          // Skip our own inserted spans — we put them there.
          if (el.classList?.contains(HIGHLIGHT_CLASS)) continue;
          pendingAdded.add(n);
        } else if (n.nodeType === Node.TEXT_NODE) {
          // Raw text added by a framework (e.g. React reconciliation) — scan
          // it as-is.
          pendingAdded.add(n);
        }
      }
    }
    if (pendingAdded.size > 0) scheduleMoFlush();
  };

  const startObserver = (): void => {
    if (observer || !document.body) return;
    observer = new MutationObserver(mutationCallback);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const stopObserver = (): void => {
    observer?.disconnect();
    observer = null;
    if (moTimer !== null) {
      window.clearTimeout(moTimer);
      moTimer = null;
    }
    pendingAdded.clear();
  };

  // Full-page rescan. Cheap early-outs: engine off, empty matcher, or body
  // hasn't mounted yet (document_idle is past DOMContentLoaded but be safe).
  const scanAll = (): void => {
    if (!enabled || !matcher || !document.body) return;
    scanSubtree(document.body, matcher);
  };

  // Drain the rebuild throttle: rebuild matcher, then unwrap (so we drop
  // words the user just removed) and do one fresh full scan. Unwrap before
  // scan so newly-added words find an unchopped DOM to walk.
  const drainRebuild = (): void => {
    rebuildPending = false;
    lastRebuildAt = Date.now();
    matcher = buildMatcher(vocabKeys);
    // Even with the engine off, keep state current so a later setEnabled(true)
    // starts from the right place. But don't touch the DOM while off.
    if (!enabled) return;
    unwrapAll(document.body);
    if (matcher) scanAll();
  };

  const scheduleRebuild = (): void => {
    // If a trailing timer is already queued, it'll handle this call — just
    // flag that there's still work pending at drain time.
    if (rebuildTimer !== null) {
      rebuildPending = true;
      return;
    }
    const since = Date.now() - lastRebuildAt;
    if (since >= REBUILD_THROTTLE_MS) {
      // Cooldown elapsed → leading-edge drain.
      drainRebuild();
      return;
    }
    // Inside cooldown → trailing drain at the boundary.
    rebuildPending = true;
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null;
      if (rebuildPending) drainRebuild();
    }, REBUILD_THROTTLE_MS - since);
  };

  // Install click delegation once at construction. The listener is idempotent
  // w.r.t. enable/disable — if we're disabled, there are no `.dr-hl` spans to
  // catch clicks on, so the handler naturally no-ops.
  document.addEventListener("click", onClick, { capture: true });
  // Hover delegation gets installed unconditionally for the same
  // reason: when no spans exist on the page, `closest('.dr-hl')`
  // always returns null and the handler short-circuits.
  if (onHighlightHover) {
    document.addEventListener("mouseover", onMouseOver, { capture: true });
    document.addEventListener("mouseout", onMouseOut, { capture: true });
  }

  return {
    setVocab(keys: string[]): void {
      vocabKeys = [...keys];
      scheduleRebuild();
    },

    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      if (enabled) {
        startObserver();
        if (matcher) scanAll();
      } else {
        stopObserver();
        unwrapAll(document.body);
      }
    },

    setStyle(style: HighlightStyle): void {
      // One document-level attribute keys the CSS variant. Cheaper than
      // rewriting every span's class and survives page navigation within the
      // same SPA (content.css is registered per-frame in the manifest).
      document.documentElement.setAttribute(STYLE_ATTR, style);
    },

    dispose(): void {
      stopObserver();
      if (rebuildTimer !== null) {
        window.clearTimeout(rebuildTimer);
        rebuildTimer = null;
      }
      document.removeEventListener("click", onClick, { capture: true });
      if (onHighlightHover) {
        document.removeEventListener("mouseover", onMouseOver, { capture: true });
        document.removeEventListener("mouseout", onMouseOut, { capture: true });
      }
      // Intentionally do not unwrap — the content script is usually being
      // orphaned on extension update, and leaving spans in place is less
      // disruptive than a late DOM rewrite on a possibly-busy page.
    },
  };
}
