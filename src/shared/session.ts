// Session JWT storage layer.
//
// The DualRead session token (returned by POST /auth/exchange) lives
// in chrome.storage.local — *not* sync — for two reasons:
//   1. JWT is per-device-trusted; bouncing it through sync would
//      replicate auth across machines silently in a way Google's
//      account picker doesn't model.
//   2. sync's 8KB per-item limit is a real ceiling we don't want
//      to share with vocab rows.
//
// We persist a small wrapper around the bare JWT so the panel can
// render the signed-in user's email + tier without re-decoding the
// token (which would require decoding HS256 client-side and we don't
// ship the secret to the client). The wrapper is hydrated from the
// /auth/exchange response and never trusted as the source of
// authorization — every backend call still re-presents `jwt` as the
// Bearer header and the server re-validates it.

import type { Lang } from "./types";

export const LOCAL_KEY_SESSION = "dr_session";

// Mirrors the backend's UserDTO wire shape (app/schemas/auth.py).
// Local-only convenience snapshot — the canonical user record lives
// in Postgres on the backend; this is what we display in the UI
// between calls so the side panel doesn't roundtrip /auth/me on
// every render.
export interface SessionUser {
  id: string;
  email: string;
  native_language: Lang;
  tier: "free" | "pro";
}

export interface StoredSession {
  // Raw HS256 token. Sent as Authorization: Bearer on every
  // authenticated backend call.
  jwt: string;
  // Unix epoch seconds — UI uses this to detect "session about to
  // expire" without having to decode the JWT body. Backend is the
  // source of truth; this is just a hint for client-side prompts.
  expires_at: number;
  user: SessionUser;
}

// Read the persisted session, if any. Returns null when storage is
// empty OR when the stored shape doesn't match — defensive against
// a downgrade (a v2.5 user opening a v2.4 binary or vice versa) that
// would otherwise crash the panel on a partial record.
export async function getStoredSession(): Promise<StoredSession | null> {
  const got = await chrome.storage.local.get(LOCAL_KEY_SESSION);
  const candidate = got[LOCAL_KEY_SESSION];
  if (!candidate || typeof candidate !== "object") return null;
  const c = candidate as Partial<StoredSession>;
  if (typeof c.jwt !== "string" || typeof c.expires_at !== "number") return null;
  if (!c.user || typeof c.user !== "object") return null;
  const u = c.user as Partial<SessionUser>;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;
  return candidate as StoredSession;
}

export async function setStoredSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [LOCAL_KEY_SESSION]: session });
}

export async function clearStoredSession(): Promise<void> {
  await chrome.storage.local.remove(LOCAL_KEY_SESSION);
}

// Treat the session as expired ~1 minute before the wall-clock expiry.
// Skew + network-latency cushion: a backend call that's about to use
// this token would 401 if the token expires mid-flight, and the panel
// can show a re-auth prompt earlier instead of letting the user mash
// a button that's about to fail.
const EXPIRY_GRACE_SECONDS = 60;
export function isSessionExpired(session: StoredSession): boolean {
  return Date.now() / 1000 + EXPIRY_GRACE_SECONDS >= session.expires_at;
}
