import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, isValidLang } from "../shared/types";
import type { Lang, Settings, TranslationDirection } from "../shared/types";

// Storage key for the Settings blob in chrome.storage.local. Kept here (not
// in messages.ts) because the panel is the only consumer; the background and
// content scripts read the same `"settings"` key directly to avoid circular
// imports and to keep the hook's read/write pair colocated.
const LOCAL_KEY_SETTINGS = "settings";

// Drop fields that have been removed from the schema before merging with
// DEFAULT_SETTINGS. Ensures stale records (e.g. `level` from earlier
// versions) get garbage-collected on the next write rather than lingering.
function sanitizeRaw(raw: Partial<Settings> & Record<string, unknown> | undefined): Partial<Settings> {
  if (!raw) return {};
  const { level: _level, ...rest } = raw as Record<string, unknown>;
  void _level;
  const out: Partial<Settings> = { ...(rest as Partial<Settings>) };
  // ui_language might be an unknown string from a future/foreign version —
  // fall back to the canonical default rather than letting the UI render
  // against an undefined dictionary.
  if ("ui_language" in out && !isValidLang(out.ui_language)) {
    delete out.ui_language;
  }
  // translation_direction is similarly fragile across versions — drop the
  // whole object if either endpoint is unknown so the merge restores the
  // default direction rather than booting against a half-valid record.
  if ("translation_direction" in out) {
    const dir = out.translation_direction;
    if (!dir || !isValidLang(dir.source) || !isValidLang(dir.target)) {
      delete out.translation_direction;
    }
  }
  return out;
}

function directionsEqual(a: TranslationDirection, b: TranslationDirection): boolean {
  return a.source === b.source && a.target === b.target;
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.auto_highlight_enabled === b.auto_highlight_enabled &&
    a.highlight_style === b.highlight_style &&
    a.ui_language === b.ui_language &&
    a.first_run_completed === b.first_run_completed &&
    a.learning_mode_enabled === b.learning_mode_enabled &&
    a.direction_user_overridden === b.direction_user_overridden &&
    directionsEqual(a.translation_direction, b.translation_direction) &&
    a.fab_disabled_origins.length === b.fab_disabled_origins.length &&
    a.fab_disabled_origins.every((v, i) => v === b.fab_disabled_origins[i])
  );
}

// Pure reducer for a Settings update. Two coupled rules live here:
//   - When the user picks a new ui_language while direction has not yet been
//     manually set, the translation target follows along so a Japanese user
//     who switched languages does not stay stuck on a Chinese target.
//   - When the user edits translation_direction from the Settings UI, the
//     overridden latch flips on so subsequent ui_language changes stop
//     mutating direction silently.
// The function is deliberately export-only and free of chrome.* / React so
// it can be unit-tested directly.
export function applySettingsPatch(prev: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...prev, ...patch };

  if (patch.translation_direction !== undefined) {
    next.direction_user_overridden = true;
  }

  // Auto-follow only when the patch did not also explicitly set the
  // direction — an explicit direction edit always wins. If the new target
  // would collide with the existing source, swap source to a different
  // language so the invariant (source ≠ target) holds without a second
  // round trip through the user.
  if (
    patch.ui_language !== undefined &&
    patch.translation_direction === undefined &&
    !prev.direction_user_overridden
  ) {
    const newTarget = patch.ui_language;
    const currentSource = next.translation_direction.source;
    const newSource = currentSource === newTarget ? pickAlternateLang(newTarget) : currentSource;
    next.translation_direction = { source: newSource, target: newTarget };
  }

  return next;
}

// Force source !== target. Picks the next supported lang in a stable order so
// the dropdowns never silently land in an invalid state. Used as the fallback
// when the user picks an option that would collapse both endpoints.
const LANG_ORDER: Lang[] = ["en", "zh-CN", "ja", "fr"];

export function pickAlternateLang(avoid: Lang): Lang {
  const found = LANG_ORDER.find((l) => l !== avoid);
  // LANG_ORDER has 4 entries — `found` is always defined for any single
  // `avoid` value. The non-null assertion keeps the public type clean.
  return found ?? "en";
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
