// Vocab write buffer.
//
// Goals:
//  - Absorb bursts of saves/deletes into a single chrome.storage.sync batch
//    (sync is capped at ~120 writes/min per extension).
//  - Survive service-worker eviction by mirroring the pending set into
//    chrome.storage.local so nothing is lost when the SW goes to sleep.
//  - Broadcast VOCAB_UPDATED once per flush so the side panel stays live.

import {
  LOCAL_KEY_LAST_ERROR,
  LOCAL_KEY_LAST_SYNCED,
  LOCAL_KEY_SETTINGS,
  LOCAL_KEY_WRITE_BUFFER,
  STORAGE_PREFIX_VOCAB,
  SYNC_VALUE_MAX_BYTES,
} from "../shared/messages";
import type { SyncErrorRecord } from "../shared/messages";
import { estimateRecordBytes, migrateRecord, shrinkToCap } from "../shared/migration";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { Settings, VocabWord } from "../shared/types";

interface PendingState {
  sets: Record<string, VocabWord>;
  deletes: string[];
}

const FLUSH_DEBOUNCE_MS = 100;
const RETRY_DELAY_MS = 2000;

let pending: PendingState = { sets: {}, deletes: [] };
let hydrated = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

function keyOf(word_key: string): string {
  return `${STORAGE_PREFIX_VOCAB}${word_key}`;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  const res = await chrome.storage.local.get(LOCAL_KEY_WRITE_BUFFER);
  const saved = res[LOCAL_KEY_WRITE_BUFFER] as PendingState | undefined;
  if (saved) pending = { sets: { ...saved.sets }, deletes: [...saved.deletes] };
  hydrated = true;
}

async function persistPending(): Promise<void> {
  await chrome.storage.local.set({ [LOCAL_KEY_WRITE_BUFFER]: pending });
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

async function loadSettings(): Promise<Settings> {
  try {
    const res = await chrome.storage.local.get(LOCAL_KEY_SETTINGS);
    return (res[LOCAL_KEY_SETTINGS] as Settings | undefined) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function flush(): Promise<void> {
  if (inFlight) return inFlight;
  if (Object.keys(pending.sets).length === 0 && pending.deletes.length === 0) return;

  // Snapshot — any further calls during flight go into a fresh pending.
  const snapshot: PendingState = { sets: pending.sets, deletes: pending.deletes };
  pending = { sets: {}, deletes: [] };
  await persistPending();

  inFlight = (async () => {
    try {
      // Re-run the migration on every snapshot record: SAVE messages that
      // landed before init() finished may carry pre-v2 shapes from the
      // buffer mirror. migrateRecord is idempotent on v2 input.
      const settings = await loadSettings();
      const setPayload: Record<string, VocabWord> = {};
      const oversized: Array<{ key: string; bytes: number }> = [];

      for (const [k, w] of Object.entries(snapshot.sets)) {
        const upgraded = migrateRecord(w, settings);
        if (upgraded === null) continue;
        const sized = shrinkToCap(upgraded, SYNC_VALUE_MAX_BYTES);
        const bytes = estimateRecordBytes(sized);
        if (bytes > SYNC_VALUE_MAX_BYTES) {
          oversized.push({ key: k, bytes });
          continue;
        }
        setPayload[keyOf(k)] = sized;
      }

      if (oversized.length > 0) {
        // Oversized records are dropped, not re-enqueued: they would bounce
        // off the cap on every flush and starve the rest of the buffer.
        // last_sync_error carries the offending keys for bug reports.
        const detail = oversized.map((o) => `${o.key}:${o.bytes}b`).join(",");
        const record: SyncErrorRecord = {
          code: `oversize:${detail}`,
          at: Date.now(),
        };
        await chrome.storage.local.set({ [LOCAL_KEY_LAST_ERROR]: record });
      }

      if (Object.keys(setPayload).length > 0) await chrome.storage.sync.set(setPayload);
      if (snapshot.deletes.length > 0) {
        await chrome.storage.sync.remove(snapshot.deletes.map(keyOf));
      }
      // Success clears last_error and bumps last_synced_at atomically so the
      // panel's sync-status hook sees a consistent snapshot.
      await chrome.storage.local.set({ [LOCAL_KEY_LAST_SYNCED]: Date.now() });
      await chrome.storage.local.remove(LOCAL_KEY_LAST_ERROR);
      broadcastUpdated();
    } catch (err) {
      // Roll snapshot back onto pending, drop duplicates, and retry.
      for (const [k, w] of Object.entries(snapshot.sets)) {
        if (!pending.sets[k]) pending.sets[k] = w;
      }
      for (const k of snapshot.deletes) {
        if (!pending.deletes.includes(k)) pending.deletes.push(k);
      }
      await persistPending();
      // Record the failure for the Sync-status indicator. We only overwrite
      // if the retry chain is fresh — preserves the *first* error's
      // timestamp so users can report when the problem started.
      const record: SyncErrorRecord = {
        code: err instanceof Error ? err.message : String(err),
        at: Date.now(),
      };
      const existing = (await chrome.storage.local.get(LOCAL_KEY_LAST_ERROR))[
        LOCAL_KEY_LAST_ERROR
      ] as SyncErrorRecord | undefined;
      await chrome.storage.local.set({
        [LOCAL_KEY_LAST_ERROR]: existing ?? record,
      });
      // Always broadcast so the panel recomputes its state even when nothing
      // new landed in storage.sync — the error itself is the state change.
      broadcastUpdated();
      console.warn("[dualread] vocab flush failed, will retry", err);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flush();
      }, RETRY_DELAY_MS);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function broadcastUpdated(): void {
  chrome.runtime.sendMessage({ type: "VOCAB_UPDATED" }).catch(() => {
    /* no listener, fine */
  });
}

export async function saveWord(word: VocabWord): Promise<void> {
  await hydrate();
  pending.sets[word.word_key] = word;
  pending.deletes = pending.deletes.filter((k) => k !== word.word_key);
  await persistPending();
  scheduleFlush();
}

export async function deleteWord(word_key: string): Promise<void> {
  await hydrate();
  delete pending.sets[word_key];
  if (!pending.deletes.includes(word_key)) pending.deletes.push(word_key);
  await persistPending();
  scheduleFlush();
}

export async function getVocab(): Promise<VocabWord[]> {
  await hydrate();
  const all = await chrome.storage.sync.get(null);
  const byKey = new Map<string, VocabWord>();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const w = v as VocabWord;
    byKey.set(w.word_key, w);
  }
  // Pending sets override synced values; pending deletes remove them.
  for (const [k, w] of Object.entries(pending.sets)) byKey.set(k, w);
  for (const k of pending.deletes) byKey.delete(k);
  return Array.from(byKey.values());
}

// Best-effort drain for chrome.runtime.onSuspend. The SW suspension window
// is only a few seconds — authoritative recovery still goes through the
// cold-start hydrate from write_buffer.
export async function flushPending(): Promise<void> {
  await hydrate();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (inFlight) await inFlight;
  await flush();
}

export async function clearVocab(): Promise<void> {
  pending = { sets: {}, deletes: [] };
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  await chrome.storage.local.remove([
    LOCAL_KEY_WRITE_BUFFER,
    LOCAL_KEY_LAST_SYNCED,
    LOCAL_KEY_LAST_ERROR,
  ]);
  await chrome.storage.sync.clear();
  broadcastUpdated();
}

