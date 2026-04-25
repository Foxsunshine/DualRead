// Best-effort cloud mirror of the local vocab write buffer.
//
// Architecture: chrome.storage.sync remains the source of truth for
// the user's library — works without a backend, free, cross-device
// via the user's Google account. The backend at /vocab is an
// additional aggregation layer that:
//   - feeds the Phase 3 pgvector RAG over the user's vocab history
//   - powers cross-device merge once the panel grows a "pull from
//     backend" path (deferred — see TODO at bottom of this file)
//
// Wire-through model: every successful local sync (vocab.ts flush)
// fires a fire-and-forget cloudSyncSnapshot(snapshot). Failures are
// logged via console.warn and DO NOT surface as a sync-status error
// — the panel's "Sync error" indicator continues to mean
// "chrome.storage.sync is unhealthy", not "backend is unreachable".
// Reasoning:
//   - Backend may be down for an hour while the user is happily
//     using the v2.x-style local-only experience; surfacing that
//     as a red dot would be misleading.
//   - Backend out-of-sync is recoverable: the next save re-pushes
//     the affected word_keys, and a future re-sync command can
//     repair longer-running drift.

import { API_BASE_URL } from "../shared/config";
import { clearStoredSession, getStoredSession, isSessionExpired } from "../shared/session";
import type { Lang, VocabWord } from "../shared/types";

interface PendingSnapshot {
  sets: Record<string, VocabWord>;
  deletes: string[];
}

interface BackendUpsertItem {
  word: string;
  word_key: string;
  source_lang: Lang;
  target_lang: Lang;
  translation: string;
  ctx: string | null;
  source_url: string | null;
  note: string | null;
}

// Convert a stored VocabWord into the backend's VocabUpsertItem
// shape. Returns null when the row lacks any of the required v2.3
// fields (source_lang / target_lang / translation) — those are
// pre-v2.3 legacy rows that vocabMigrate.ts is supposed to fill in
// at upgrade time, but a fresh sign-in on a never-upgraded device
// could still encounter them. Skipping is safer than synthesizing
// defaults.
function toBackendItem(word: VocabWord): BackendUpsertItem | null {
  if (!word.source_lang || !word.target_lang || !word.translation) {
    return null;
  }
  return {
    word: word.word,
    word_key: word.word_key,
    source_lang: word.source_lang,
    target_lang: word.target_lang,
    translation: word.translation,
    ctx: word.ctx ?? null,
    source_url: word.source_url ?? null,
    note: word.note ?? null,
  };
}

// Push a batch of upserts. Resolves on any HTTP completion (2xx or
// otherwise) — caller treats a non-2xx as "logged + move on".
async function pushUpserts(jwt: string, items: BackendUpsertItem[]): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/vocab/bulk-upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ items }),
  });
  if (resp.status === 401) {
    // Session is dead server-side. Clearing it locally avoids the
    // next save trying the same bad token; the user is already in
    // the "signed-in UI but failing to sync" half-state, and the
    // Account block will refresh to "signed out" on the next render.
    await clearStoredSession();
    console.warn("[dualread] cloud sync: 401 from /vocab/bulk-upsert; cleared local session");
    return;
  }
  if (resp.status !== 200) {
    console.warn(`[dualread] cloud sync: /vocab/bulk-upsert ${resp.status}`);
  }
}

// Issue per-word DELETEs. The backend has no batch-delete endpoint
// (deliberate — single-word delete is the canonical UX gesture);
// we serialize them here to avoid hitting the per-user rate limit
// on a large purge.
async function pushDeletes(jwt: string, wordKeys: string[]): Promise<void> {
  for (const wordKey of wordKeys) {
    let resp;
    try {
      resp = await fetch(`${API_BASE_URL}/vocab/${encodeURIComponent(wordKey)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch (e) {
      console.warn(`[dualread] cloud sync: delete ${wordKey} network error`, e);
      continue;
    }
    if (resp.status === 401) {
      await clearStoredSession();
      console.warn("[dualread] cloud sync: 401 on DELETE; cleared local session");
      return;
    }
    // 204 = ok; 404 = already absent upstream (fine — we agree on
    // the end state). Anything else is a soft failure logged for
    // the next debug session.
    if (resp.status !== 204 && resp.status !== 404) {
      console.warn(`[dualread] cloud sync: delete ${wordKey} ${resp.status}`);
    }
  }
}

// Public entry point. Called by vocab.ts's flush() after its
// chrome.storage.sync write succeeds, so by the time we run the
// snapshot already lives in the user's local source-of-truth and
// our job is purely to mirror it upstream.
export async function cloudSyncSnapshot(snapshot: PendingSnapshot): Promise<void> {
  const session = await getStoredSession();
  if (!session) return;
  if (isSessionExpired(session)) {
    // Mid-flight expiry: skip rather than 401 ourselves into a
    // clearStoredSession. The user can re-sign-in on the next UI
    // gesture; meanwhile chrome.storage.sync still works.
    return;
  }

  const upsertItems: BackendUpsertItem[] = [];
  for (const word of Object.values(snapshot.sets)) {
    const item = toBackendItem(word);
    if (item) upsertItems.push(item);
  }

  // Bulk-upsert and per-key deletes are independent — a save burst
  // and a delete burst can interleave in one snapshot. Run them
  // sequentially because they share the same /vocab rate-limit
  // bucket; parallelism would just race against the 600/hr cap.
  if (upsertItems.length > 0) {
    try {
      await pushUpserts(session.jwt, upsertItems);
    } catch (e) {
      console.warn("[dualread] cloud sync: bulk-upsert network error", e);
    }
  }
  if (snapshot.deletes.length > 0) {
    await pushDeletes(session.jwt, snapshot.deletes);
  }
}

// TODO (W5 follow-up): pull-merge on sign-in. When a user signs in
// from a device that already has local vocab, we currently only
// dual-write going forward — words saved before the sign-in event
// never reach the backend. A one-time GET /vocab + chrome.storage
// merge on sign-in success would close that gap. Out of scope for
// W5#4 because the merge logic (last-write-wins on word_key, or
// surface conflicts to the user?) needs its own design pass.
