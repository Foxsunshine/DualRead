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

import { ApiError, requestTranslate } from "../shared/api";
import type { MessageResponse } from "../shared/messages";
import { getStoredSession, isSessionExpired } from "../shared/session";
import type { Lang, TranslateResult } from "../shared/types";

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
  target: Lang
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

// ───── Backend route ─────────────────────────────────────────
// W5#5: when the user is signed in, route through the FastAPI
// backend's POST /translate so they benefit from the server-side
// shared_cache (translations across all DualRead users are deduped
// upstream). Anonymous users keep the local Google MT path
// (translateWithGoogle below) — it's the v2.x privacy story
// (no account, no backend) preserved as the unauthenticated default.
//
// The backend response shape is `{ translation, detected_lang,
// cached }`; we map it onto the existing TranslateResult so the
// panel + bubble don't need to know which path served the request.
async function translateViaBackend(
  text: string,
  target: Lang,
): Promise<TranslateResult> {
  let body;
  try {
    body = await requestTranslate(text, target);
  } catch (e) {
    if (e instanceof ApiError) {
      // 429 from the backend's per-IP rate limiter → preserve the
      // existing error code so the panel renders the same i18n
      // string as a Google-side 429.
      if (e.status === 429) throw new TranslateError("rate_limit");
      throw new TranslateError(`http_${e.status}`);
    }
    throw new TranslateError("network");
  }
  return {
    translated: body.translation,
    detectedLang: body.detected_lang ?? "auto",
  };
}

// ───── Public entry point ────────────────────────────────────
// The only function this module exports. Cache-first, then a
// best-effort backend route for signed-in users, then a Google MT
// fallback. Both the side panel (via `useSelection`) and the bubble
// (via content/clickTranslate) route through here. Duplicate
// concurrent requests for the same (text, target) pair both hit
// the network once because the second request is sent *after* the
// first response has written to the cache — but if both fire within
// the first network round-trip, both will call the network. Accepted:
// the race window is small (~200 ms) and Google's endpoint is cheap;
// deduplicating in-flight promises would require keeping promise
// state across service-worker evictions, which is not worth the
// complexity at v1.1's scale.
//
// Backend route is gated on (a) user signed in and (b) session not
// expired. Either-failed → straight to local Google MT, no detour.
// On a backend HTTP error mid-flight we fall through to the local
// path so a backend hiccup never breaks click-translate UX.
export async function handleTranslate(
  text: string,
  target: Lang
): Promise<MessageResponse> {
  try {
    const cached = await getCached(text, target);
    if (cached) return { ok: true, data: cached };

    let data: TranslateResult | null = null;

    // Backend-first when signed in. Local Google MT is the always-
    // available fallback below.
    const session = await getStoredSession();
    if (session && !isSessionExpired(session)) {
      try {
        data = await translateViaBackend(text, target);
      } catch (e) {
        // Soft-fail: log + fall through. Backend being down or
        // temporarily rate-limited shouldn't break click-translate.
        // We don't surface a "backend translate failed" UI because
        // the user is about to see the translation from the local
        // path anyway.
        console.warn("[dualread] backend /translate failed, falling back to local:", e);
      }
    }

    if (!data) {
      data = await translateWithGoogle(text, target);
    }

    await setCached(text, target, data);
    return { ok: true, data };
  } catch (e) {
    const code = e instanceof TranslateError ? e.code : "parse";
    return { ok: false, error: code };
  }
}
