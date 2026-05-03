import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, isValidLang } from "../shared/types";
import type { Settings } from "../shared/types";

// Storage key for the Settings blob in chrome.storage.local. Kept here (not
// in messages.ts) because the panel is the only consumer; the background and
// content scripts read the same `"settings"` key directly to avoid circular
// imports and to keep the hook's read/write pair colocated.
const LOCAL_KEY_SETTINGS = "settings";

// Drop fields that have been removed from the schema before merging with
// DEFAULT_SETTINGS. Ensures stale records (e.g. `level` from earlier
// versions, or the now-retired translation_direction pair) get
// garbage-collected on the next write rather than lingering.
function sanitizeRaw(raw: Partial<Settings> & Record<string, unknown> | undefined): Partial<Settings> {
  if (!raw) return {};
  const {
    level: _level,
    translation_direction: _direction,
    direction_user_overridden: _directionLatch,
    ...rest
  } = raw as Record<string, unknown>;
  void _level;
  void _direction;
  void _directionLatch;
  const out: Partial<Settings> = { ...(rest as Partial<Settings>) };
  // ui_language might be an unknown string from a future/foreign version —
  // fall back to the canonical default rather than letting the UI render
  // against an undefined dictionary.
  if ("ui_language" in out && !isValidLang(out.ui_language)) {
    delete out.ui_language;
  }
  return out;
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.auto_highlight_enabled === b.auto_highlight_enabled &&
    a.highlight_style === b.highlight_style &&
    a.ui_language === b.ui_language &&
    a.first_run_completed === b.first_run_completed &&
    a.learning_mode_enabled === b.learning_mode_enabled &&
    a.fab_disabled_origins.length === b.fab_disabled_origins.length &&
    a.fab_disabled_origins.every((v, i) => v === b.fab_disabled_origins[i])
  );
}

// Pure reducer for a Settings update. Translation target follows ui_language
// directly (no separate picker), so this function reduces to a shallow merge.
// Kept as an exported pure function so unit tests can target it without the
// React hook scaffolding.
export function applySettingsPatch(prev: Settings, patch: Partial<Settings>): Settings {
  return { ...prev, ...patch };
}

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once. We sanitize first (strip dropped fields like `level`,
  // guard `ui_language` against unknown values) then merge with defaults
  // so missing newer fields still boot cleanly.
  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get(LOCAL_KEY_SETTINGS).then((res) => {
      if (cancelled) return;
      const raw = res[LOCAL_KEY_SETTINGS] as (Partial<Settings> & Record<string, unknown>) | undefined;
      const cleaned = sanitizeRaw(raw);
      setLocal({ ...DEFAULT_SETTINGS, ...cleaned });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic update: flip React state first so the UI is instant, then
  // fire-and-forget the storage write. Skip the write entirely when the
  // patched value is identical to the previous one — repeated toggles on
  // the same option (e.g. tapping the active language pill) would otherwise
  // dispatch redundant storage.onChanged events to every listener.
  const update = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => {
      const next = applySettingsPatch(prev, patch);
      if (settingsEqual(prev, next)) return prev;
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
