export type Lang = "zh-CN" | "en";

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

// Bumped to 2 in the schema-migration track: replaces the v1 `zh` / `en?`
// pair with a single `translation` field plus optional source/target language
// metadata. The literal type on `schema_version` makes any future bump a
// compile-time error wherever VocabWord literals are constructed, forcing the
// next bump to walk the call sites instead of silently accepting v2 records.
export const CURRENT_SCHEMA_VERSION = 2 as const;

export interface VocabWord {
  word: string;
  word_key: string;
  translation: string;
  source_lang?: Lang;
  target_lang?: Lang;
  ctx?: string;
  source_url?: string;
  note?: string;
  created_at: number;
  updated_at: number;
  schema_version: 2;
}

export interface SelectionPayload {
  text: string;
  context_sentence: string;
  source_url: string;
}

export interface TranslateResult {
  translated: string;
  detectedLang: string;
}
