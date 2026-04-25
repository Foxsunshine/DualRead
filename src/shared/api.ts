// Backend HTTP client.
//
// Lives at the shared layer so both the background service worker
// (auth flow) and the side panel (Account UI) can use it. fetch is
// MV3-blessed in service workers, and the manifest's host_permissions
// for API_BASE_URL grants both the network access AND the CORS bypass
// for the extension origin.
//
// Two overloads:
//   - exchangeAccessToken: called once per sign-in; sends the Google
//     access_token + native_language hint, gets back a session JWT
//     and a UserDTO snapshot.
//   - apiGet / apiPost: low-level helpers for authenticated calls
//     (Authorization: Bearer <jwt>). They raise ApiError on non-2xx
//     so callers can distinguish a session-expired 401 from other
//     failure modes.

import { API_BASE_URL } from "./config";
import type { Lang } from "./types";
import type { SessionUser } from "./session";

// HTTP failure surface. `status` mirrors the response status code so
// a 401 caller can clear the local session, a 429 caller can back
// off, and a 5xx caller can show a generic "try again later".
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Wire shape of POST /auth/exchange's response (app/schemas/auth.py
// ExchangeResponse). Kept local because the side panel doesn't need
// to import it directly — auth.ts unwraps into a StoredSession.
export interface ExchangeResponseBody {
  token: string;
  expires_at: string; // ISO-8601 datetime
  user: SessionUser;
}

// Trade a Google access_token for a DualRead session JWT.
// Backend verifies the access_token via Google's userinfo endpoint
// (app/services/google_auth.py); a 401 here means the access_token
// itself was rejected (expired/revoked), in which case the caller
// should drop the cached chrome.identity token and re-prompt.
export async function exchangeAccessToken(
  accessToken: string,
  nativeLanguage: Lang,
): Promise<ExchangeResponseBody> {
  const resp = await fetch(`${API_BASE_URL}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: accessToken,
      native_language: nativeLanguage,
    }),
  });
  if (resp.status !== 200) {
    const detail = await safeReadDetail(resp);
    throw new ApiError(resp.status, `auth/exchange ${resp.status}`, detail);
  }
  return (await resp.json()) as ExchangeResponseBody;
}

// Authenticated GET. Used so far for /auth/me (the session-validity
// canary) — vocab + translate sync paths land in subsequent commits.
export async function apiGet<T>(path: string, jwt: string): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (resp.status !== 200) {
    const detail = await safeReadDetail(resp);
    throw new ApiError(resp.status, `${path} ${resp.status}`, detail);
  }
  return (await resp.json()) as T;
}

// Wire shape of POST /translate's response (app/schemas/translate.py
// TranslateResponse). detected_lang and cached are server-side
// hints — the extension only really needs `translation`, but
// surfacing detected_lang lets the panel UI verify the source
// language Google reports back.
export interface TranslateResponseBody {
  translation: string;
  detected_lang: string | null;
  cached: boolean;
}

// Anonymous POST /translate. Backend `/translate` does NOT require
// a session JWT — it's IP-rate-limited rather than user-rate-limited.
//
// **Dormant in Phase 1 W5.5+.** Click-translate is local-only per
// docs/v3-product-design.md §2 (latency budget). This function is
// preserved because Phase 2 W6's LangGraph agent uses it internally
// as the baseline-translation node before RAG + style-polish nodes
// run. No extension UI surface calls it directly today.
//
// source_lang is omitted from the request when null, which the
// backend interprets as "auto-detect" (it omits source from the
// Google MT v2 payload). target_lang is mandatory.
export async function requestTranslate(
  text: string,
  targetLang: string,
): Promise<TranslateResponseBody> {
  const resp = await fetch(`${API_BASE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_lang: targetLang,
      // source_lang intentionally omitted — extension doesn't know.
    }),
  });
  if (resp.status !== 200) {
    const detail = await safeReadDetail(resp);
    throw new ApiError(resp.status, `/translate ${resp.status}`, detail);
  }
  return (await resp.json()) as TranslateResponseBody;
}

// Reads the FastAPI-shaped `{ "detail": "..." }` if present without
// throwing on a malformed body. Used purely for error messages — we
// never branch on the value of detail since opaque 401s by design
// don't tell us why.
async function safeReadDetail(resp: Response): Promise<string | undefined> {
  try {
    const body = (await resp.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : undefined;
  } catch {
    return undefined;
  }
}
