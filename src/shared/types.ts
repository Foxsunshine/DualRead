// Supported UI languages for v2.2+. zh-CN keeps its BCP-47 region tag for
// backward compatibility with values already persisted to chrome.storage.local
// from v2.0/v2.1; the other three are bare ISO 639-1 codes because we do not
// branch on region today (zh-TW falls back to zh-CN; en-GB to en; etc.).
// Adding a new language means: extend this union, add a Record entry to every
// dict typed with `Record<Lang, T>` (TS will fail to compile if any are
// missed), and write the native-form label in Settings + Welcome.
export type Lang = "zh-CN" | "en" | "ja" | "fr";

// Single source of truth for the ordered list of supported languages and
// their native-form labels. Consumed by:
//  - the Settings dropdown <option> rendering
//  - the Welcome onboarding radio group
//  - isValidLang() runtime guard below
// Native-form labels are intentionally NOT translated through DR_STRINGS:
// every language picker by convention shows each language in its own form
// so a user landed on a foreign UI can find their way home.
export const LANG_OPTIONS: readonly { id: Lang; nativeLabel: string }[] = [
  { id: "zh-CN", nativeLabel: "中文" },
  { id: "en", nativeLabel: "English" },
  { id: "ja", nativeLabel: "日本語" },
  { id: "fr", nativeLabel: "Français" },
];

// Runtime guard for storage reads. The Lang union is a TypeScript-only
// constraint; chrome.storage values are `unknown` until parsed, so any code
// path that hydrates Settings from storage MUST pipe `ui_language` through
// this before trusting it. A user who manually edits storage to an
// unsupported value (or a stale storage record from a future-version
// downgrade) gets a fallback to "en" instead of a runtime crash inside
// the i18n dict lookup.
export function isValidLang(x: unknown): x is Lang {
  return typeof x === "string" && LANG_OPTIONS.some((o) => o.id === x);
}

export type HighlightStyle = "underline" | "background";

export type Level = "A2" | "B1" | "B2" | "C1";

export interface Settings {
  auto_highlight_enabled: boolean;
  highlight_style: HighlightStyle;
  ui_language: Lang;
  first_run_completed: boolean;
  level: Level;
  // v1.1 post-H master switch (D52). When false, DualRead is fully dormant
  // on the page: no selection relay, no click/drag bubble, no `.dr-hl`
  // highlights rendered. Side panel remains functional (shows a paused
  // banner). Default true — first-run users land in learning mode; the
  // floating FAB lets them toggle off any time without opening Settings.
  learning_mode_enabled: boolean;
}

// Canonical default settings. Consumed by:
//  - the side-panel `useSettings` hook (initial state + merge on read),
//  - the content-script settings loader (merge so stale storage records
//    without newer fields still boot),
//  - the background install listener (seed on fresh install + re-seed after
//    CLEAR_DATA so the panel restarts in a clean first-run state).
export const DEFAULT_SETTINGS: Settings = {
  auto_highlight_enabled: true,
  highlight_style: "underline",
  ui_language: "zh-CN",
  first_run_completed: false,
  level: "B1",
  learning_mode_enabled: true,
};

export interface VocabWord {
  word: string;
  word_key: string;
  // v2.3 schema extension. New rows MUST set source_lang / target_lang /
  // translation; legacy v1/v2.x rows have only `zh` (and sometimes `en`).
  // Keeping the new fields OPTIONAL (multi-agent review P0-4) means a
  // checkout sitting between commit B and the migration commit C still
  // typechecks and renders existing storage cleanly. Read paths fall
  // back: `(v.translation ?? v.zh ?? "")` for the displayed translation,
  // `(v.source_lang ?? "en")` and `(v.target_lang ?? "zh-CN")` for legacy
  // rows. The migration in vocabMigrate.ts populates the new fields on
  // first update-install after v2.3 ships, so the optional-ness becomes
  // de facto required for new data without ever being a TypeScript
  // requirement (legacy tolerance is preserved long-term).
  source_lang?: Lang;
  target_lang?: Lang;
  translation?: string;
  zh?: string;
  en?: string;
  ctx?: string;
  source_url?: string;
  note?: string;
  created_at: number;
  updated_at: number;
}

// v2.3 schema migration version. Stored under the same key in
// chrome.storage.SYNC (not chrome.storage.local) so all signed-in devices
// share the same flag — without this the migration would race across
// machines and burn the 1800-writes/hour quota three times over for a
// user with three devices (multi-agent review P0-1).
export const VOCAB_SCHEMA_VERSION = 2;
export const STORAGE_KEY_VOCAB_SCHEMA_VERSION = "vocab_schema_version";

export interface SelectionPayload {
  text: string;
  context_sentence: string;
  source_url: string;
}

export interface TranslateResult {
  translated: string;
  detectedLang: string;
}
