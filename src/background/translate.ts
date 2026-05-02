// DualRead background translator.
//
// v1 shipped with the translator co-located in `index.ts`; v1.1 extracts it
// into its own module ahead of the bubble work. Two motivations for the split:
//   - The bubble (content script) will drive translation requests alongside
//     the side panel, so the translator needs a stable single entry point
//     (`handleTranslate`) that is obviously *the* hub, not one of several
//     switch-case branches buried in the message router.
//   - Tests, when they eventually land, can import `translateWithGoogle` /
//     `handleTranslate` directly without dragging in the whole service worker
//     bootstrap (install listener, message router, vocab handlers).
//
// Contract for callers:
//   - `handleTranslate(text, target)` is the only exported entry point.
//   - Returns a `MessageResponse` ready to ship back through sendResponse.
//   - Session-scoped cache is internal; callers don't need to know about it.
//
// Error taxonomy (bubbled up to the UI verbatim as `MessageResponse.error`):
//   "network"     — fetch rejected (offline, DNS, TLS, CORS)
//   "rate_limit"  — Google returned 429
//   "http_<n>"    — any other non-2xx status
//   "parse"       — response parsed as non-JSON or unexpected shape
// The side panel collapses the open-ended set into three i18n strings; the
// bubble (Phase C) will do the same.

import type { MessageResponse } from "../shared/messages";
import type { TranslateResult } from "../shared/types";

// Template-literal type for HTTP errors lets us surface the actual status
// ("http_503", "http_418") in logs and bug reports without inventing one
// generic bucket per failure mode.
type TranslateErrorCode = "network" | "rate_limit" | "parse" | `http_${number}`;

// Error subclass so callers can `instanceof` check and extract the code
// without string-parsing `.message`. The Error's `.message` is the code
// itself — redundant but keeps the object self-describing in devtools.
class TranslateError extends Error {
  code: TranslateErrorCode;
  constructor(code: TranslateErrorCode) {
    super(code);
    this.code = code;
    this.name = "TranslateError";
  }
}

// ───── Session cache ─────────────────────────────────────────
// Cache keys are prefixed with `t:` so they don't collide with the selection
// relay's `latest_selection` / `pending_focus_word` keys already living in
// session storage. `target` participates in the key because the same `text`
// can resolve to different translations depending on direction (CN→EN vs
// EN→CN). Lowercase + trim matches how `word_key` is canonicalised elsewhere
// in the app so a repeat lookup from a slightly differently-cased selection
// still hits the cache.
function cacheKey(text: string, target: string): string {
  return `t:${target}:${text.trim().toLowerCase()}`;
}

async function getCached(text: string, target: string): Promise<TranslateResult | null> {
  const key = cacheKey(text, target);
  const res = await chrome.storage.session.get(key);
  return (res[key] as TranslateResult | undefined) ?? null;
}

async function setCached(
  text: string,
  target: string,
  result: TranslateResult
): Promise<void> {
  await chrome.storage.session.set({ [cacheKey(text, target)]: result });
}

// ───── Google Translate fetch ────────────────────────────────
// Uses the `translate.googleapis.com/translate_a/single` endpoint with the
// anonymous `client=gtx` slot — no API key, no auth. This endpoint is
// undocumented but stable enough to ship; DESIGN.md R1 tracks the risk and
// notes Gemini as the intended fallback (not yet implemented in v1 or v1.1
// Phase A — that lands in a later phase once users actually hit 429 in the
// field).
async function translateWithGoogle(
  text: string,
  target: "zh-CN" | "en"
): Promise<TranslateResult> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    throw new TranslateError("network");
  }
  if (resp.status === 429) throw new TranslateError("rate_limit");
  if (!resp.ok) throw new TranslateError(`http_${resp.status}`);

  try {
    // Google returns a nested array; `data[0]` is the segment list, each
    // segment is `[translated, source, ...]`. Joining segment[0] gives the
    // full translation because long inputs get split at sentence boundaries.
    const data = (await resp.json()) as [Array<[string, ...unknown[]]>, unknown, string];
    const translated = data[0].map((item) => item[0]).join("");
    const detectedLang = data[2] || "auto";
    return { translated, detectedLang };
  } catch {
    throw new TranslateError("parse");
  }
}

// ───── Public entry point ────────────────────────────────────
// The only function this module exports. Cache-first, network-fallback,
// error-normalised. Both the side panel (via `useSelection`) and the bubble
// (via content/clickTranslate) route through here. Duplicate concurrent
// requests for the same (text, target) pair both hit the network once
// because the second request is sent *after* the first response has written
// to the cache — but if both fire within the first network round-trip, both
// will call `translateWithGoogle`. Accepted: Google's endpoint is cheap and
// the race window is small (~200 ms); deduplicating in-flight promises here
// would require keeping promise state across service-worker evictions, which
// is not worth the complexity at v1.1's scale.
export async function handleTranslate(
  text: string,
  target: "zh-CN" | "en"
): Promise<MessageResponse> {
  try {
    const cached = await getCached(text, target);
    if (cached) return { ok: true, data: cached };
    const data = await translateWithGoogle(text, target);
    await setCached(text, target, data);
    return { ok: true, data };
  } catch (e) {
    const code = e instanceof TranslateError ? e.code : "parse";
    return { ok: false, error: code };
  }
}
