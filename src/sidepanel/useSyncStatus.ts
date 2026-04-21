// Side-panel hook that derives a 4-state sync indicator from local signals.
//
// States:
//   - "offline"  — navigator.onLine is false. Writes queue locally; sync.set
//                  calls will resolve only when Chrome reconnects. We don't
//                  synthesise an error here because this is the *expected*
//                  transient state.
//   - "error"    — LOCAL_KEY_LAST_ERROR is set and no subsequent success has
//                  cleared it. Precedence above "syncing" because a retry
//                  is in flight either way and the user cares about the
//                  error more than the fact that work is being attempted.
//   - "syncing"  — write_buffer has pending sets or deletes, no error.
//   - "synced"   — default. Buffer empty, online, no stale error.
//
// Design motivation (DESIGN.md R5 / D24): we ship no telemetry, so the user
// must be able to copy-paste a verbose status line into bug reports. The
// hook therefore also returns the raw error code and the flush timestamps.

import { useCallback, useEffect, useState } from "react";
import {
  LOCAL_KEY_LAST_ERROR,
  LOCAL_KEY_LAST_SYNCED,
  LOCAL_KEY_WRITE_BUFFER,
} from "../shared/messages";
import type { Message, SyncErrorRecord } from "../shared/messages";
import type { VocabWord } from "../shared/types";

export type SyncState = "synced" | "syncing" | "offline" | "error";

// Public shape consumed by the Settings screen. `online` is folded into
// `state` via deriveState — we don't surface it separately because no caller
// needs the raw signal independent of the derived state label.
export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  lastError: SyncErrorRecord | null;
  pendingCount: number;
}

interface WriteBuffer {
  sets: Record<string, VocabWord>;
  deletes: string[];
}

// Pure reducer: given the three raw inputs, decide the displayed state.
// Kept out of useSyncStatus so it stays trivially testable if we ever add
// unit tests for the panel.
function deriveState(
  online: boolean,
  pendingCount: number,
  lastError: SyncErrorRecord | null
): SyncState {
  if (!online) return "offline";
  if (lastError) return "error";
  if (pendingCount > 0) return "syncing";
  return "synced";
}

export function useSyncStatus(): SyncStatus {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<SyncErrorRecord | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Single source-of-truth pull — used on mount, on VOCAB_UPDATED broadcasts,
  // and on any storage.onChanged event that touches one of our keys.
  const refresh = useCallback(async () => {
    const res = await chrome.storage.local.get([
      LOCAL_KEY_LAST_SYNCED,
      LOCAL_KEY_LAST_ERROR,
      LOCAL_KEY_WRITE_BUFFER,
    ]);
    setLastSyncedAt((res[LOCAL_KEY_LAST_SYNCED] as number | undefined) ?? null);
    setLastError((res[LOCAL_KEY_LAST_ERROR] as SyncErrorRecord | undefined) ?? null);
    const buffer = res[LOCAL_KEY_WRITE_BUFFER] as WriteBuffer | undefined;
    const count = buffer
      ? Object.keys(buffer.sets).length + buffer.deletes.length
      : 0;
    setPendingCount(count);
  }, []);

  useEffect(() => {
    void refresh();

    // Online / offline. Attach to window so we catch both directions.
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // chrome.storage.onChanged is the canonical tripwire. We listen for the
    // specific keys only so unrelated extension traffic doesn't repoll.
    const onStorageChanged = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName
    ) => {
      if (area !== "local") return;
      if (
        LOCAL_KEY_LAST_SYNCED in changes ||
        LOCAL_KEY_LAST_ERROR in changes ||
        LOCAL_KEY_WRITE_BUFFER in changes
      ) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    // VOCAB_UPDATED is the explicit broadcast the background fires on every
    // flush (success or failure). Redundant with storage.onChanged for
    // success cases, but still useful — it guarantees a UI nudge even if
    // two rapid writes ended up with identical storage values.
    const onMessage = (msg: Message) => {
      if (msg.type === "VOCAB_UPDATED") void refresh();
    };
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      chrome.storage.onChanged.removeListener(onStorageChanged);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refresh]);

  return {
    state: deriveState(online, pendingCount, lastError),
    lastSyncedAt,
    lastError,
    pendingCount,
  };
}
