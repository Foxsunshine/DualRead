// Sign-in / sign-out flow, run on the background service worker.
//
// chrome.identity.getAuthToken is the right primitive for the
// "Sign in with Google" button on a Chrome extension:
//   - First interactive=true call pops Chrome's native account
//     picker (one click for the user).
//   - Subsequent calls (for the same scopes) are silent and return
//     the cached access_token without UI — extension can refresh
//     mid-session without bothering the user.
//
// The returned access_token is what we POST to /auth/exchange; the
// backend exchanges it for the user profile via Google's userinfo
// endpoint (see backend app/services/google_auth.py). We never store
// the Google access_token ourselves — only the resulting DualRead
// session JWT lives on (in chrome.storage.local via session.ts).

import { exchangeAccessToken, ApiError } from "../shared/api";
import {
  type StoredSession,
  clearStoredSession,
  setStoredSession,
} from "../shared/session";
import type { Lang } from "../shared/types";

// Wrap chrome.identity.getAuthToken in a Promise. The callback form
// is the only one that surfaces chrome.runtime.lastError correctly
// — the Promise overload silently rejects with a generic "userinfo"
// error in some Chrome versions.
function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? "identity error"));
        return;
      }
      // Chrome 123+ returns a GetAuthTokenResult object; older form
      // returned the bare token string. Normalize either to a string.
      let token: string | undefined;
      if (typeof result === "string") {
        token = result;
      } else if (result && typeof result === "object" && "token" in result) {
        const t = (result as { token: unknown }).token;
        token = typeof t === "string" ? t : undefined;
      }
      if (!token) {
        reject(new Error("no access_token returned"));
        return;
      }
      resolve(token);
    });
  });
}

// Drop the cached Google access_token so the next sign-in can pick a
// different account. Without this, getAuthToken returns the same
// token for the lifetime of the Chrome session even after our local
// JWT is gone — confusing UX for "sign out then sign in as someone
// else".
function removeCachedAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // We don't surface failures: at worst the cached token sticks
      // around for the session and the next sign-in returns it again.
      // Not a correctness issue — sign-out has already cleared OUR
      // session JWT, which is what bounds authorized backend calls.
      resolve();
    });
  });
}

// Run the full sign-in flow:
//   1. interactive getAuthToken → Google access_token
//   2. POST /auth/exchange → DualRead JWT + user profile
//   3. persist to chrome.storage.local
//
// nativeLanguage is the user's currently-saved ui_language; the
// backend ignores it for returning users and only honors it on
// first sign-up (so a 2nd-device user can't clobber their
// server-side preference from a stale install).
export async function signIn(nativeLanguage: Lang): Promise<StoredSession> {
  const accessToken = await getAuthToken(true);
  let body;
  try {
    body = await exchangeAccessToken(accessToken, nativeLanguage);
  } catch (e) {
    // 401 from /auth/exchange means Google rejected the access_token
    // (revoked/expired). Drop the cached token so the next attempt
    // forces a fresh prompt instead of looping on the bad cache.
    if (e instanceof ApiError && e.status === 401) {
      await removeCachedAuthToken(accessToken);
    }
    throw e;
  }

  // expires_at on the wire is an ISO-8601 string; the storage layer
  // wants unix seconds for a cheap "is this expired?" check without
  // re-parsing on every read.
  const expiresAtSeconds = Math.floor(new Date(body.expires_at).getTime() / 1000);
  const session: StoredSession = {
    jwt: body.token,
    expires_at: expiresAtSeconds,
    user: body.user,
  };
  await setStoredSession(session);
  return session;
}

// Sign-out:
//   1. Clear the Google access_token cache so the next sign-in
//      doesn't silently reuse the same identity.
//   2. Drop the local session JWT.
//
// Order matters — if step 2 fails, the user can still see a
// "Signed in as ..." UI on the next panel render and retry. If
// step 1 fails, they end up signed out anyway (step 2 ran), just
// with a Google token still in the in-memory cache that gets
// flushed on Chrome restart.
export async function signOut(): Promise<void> {
  try {
    const token = await getAuthToken(false).catch(() => null);
    if (token) {
      await removeCachedAuthToken(token);
    }
  } finally {
    await clearStoredSession();
  }
}
