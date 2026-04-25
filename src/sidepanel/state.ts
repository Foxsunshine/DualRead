import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { Settings } from "../shared/types";

// Storage key for the Settings blob in chrome.storage.local. Kept here (not
// in messages.ts) because the panel is the only consumer; the background and
// content scripts read the same `"settings"` key directly to avoid circular
// imports and to keep the hook's read/write pair colocated.
const LOCAL_KEY_SETTINGS = "settings";

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once. We merge with DEFAULT_SETTINGS so a stale storage record
  // missing a newer field (e.g. `level` added in Phase 2) still boots cleanly
  // instead of surfacing `undefined` in the UI.
  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get(LOCAL_KEY_SETTINGS).then((res) => {
      if (cancelled) return;
      const raw = res[LOCAL_KEY_SETTINGS] as Partial<Settings> | undefined;
      setLocal({ ...DEFAULT_SETTINGS, ...(raw ?? {}) });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic update: flip React state first so the UI is instant, then
  // fire-and-forget the storage write. We don't await — the content script
  // and any other panel instance pick up the change via storage.onChanged.
  //
  // Bail when the patch is a no-op against current state. Without this,
  // clicking the already-active option in any settings picker (e.g. tapping
  // the auto-detected Welcome lang card to "confirm" it) still fires
  // `chrome.storage.local.set`, which broadcasts to every content script
  // on every open tab — each re-reads settings and reapplies derived state.
  // Real fan-out for a no-op click.
  const update = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => {
      const keys = Object.keys(patch) as (keyof Settings)[];
      const changed = keys.some((k) => prev[k] !== patch[k]);
      if (!changed) return prev;
      const next = { ...prev, ...patch };
      void chrome.storage.local.set({ [LOCAL_KEY_SETTINGS]: next });
      return next;
    });
  }, []);

  return { settings, loaded, update };
}

export type Screen =
  | "welcome"
  | "translate-empty"
  | "translate"
  | "vocab-empty"
  | "vocab"
  | "settings";

export type Tab = "translate" | "vocab" | "settings";

export function tabForScreen(screen: Screen): Tab | null {
  if (screen.startsWith("translate")) return "translate";
  if (screen.startsWith("vocab")) return "vocab";
  if (screen === "settings") return "settings";
  return null;
}
