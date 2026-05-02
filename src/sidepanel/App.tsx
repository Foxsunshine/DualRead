// Root side-panel component.
//
// Responsible for:
//   - Composing the per-feature hooks (settings, selection, vocab) and turning
//     them into one active screen.
//   - Routing tab clicks → screen. v1.1 (D43, supersedes D21): a fresh
//     selection always forces the Translate tab — the old "sticky intent"
//     behavior (don't yank the user away from Vocab) turned out to be a
//     complaint, not a feature. Users expect a new lookup to land where
//     the result actually is.
//   - Wiring Save / Edit note / Delete / Export / Clear to the vocab hook.

import { useEffect, useMemo, useState } from "react";
import { DR_STRINGS } from "./i18n";
import { VOCAB_QUOTA_WARN_AT } from "../shared/messages";
import type { VocabWord } from "../shared/types";
import { PanelHeader } from "./components/PanelHeader";
import { Welcome } from "./screens/Welcome";
import { TranslateEmpty } from "./screens/TranslateEmpty";
import { Translate } from "./screens/Translate";
import { VocabEmpty } from "./screens/VocabEmpty";
import { Vocab } from "./screens/Vocab";
import { Settings } from "./screens/Settings";
import { tabForScreen, useSettings } from "./state";
import type { Screen, Tab } from "./state";
import { useSelection } from "./useSelection";
import type { TranslateErrorCode } from "./useSelection";
import { useVocab, wordKeyOf } from "./useVocab";
import { useFocusWord } from "./useFocusWord";
import { useSyncStatus } from "./useSyncStatus";
import { exportVocabCsv } from "./exportCsv";
import type { Strings } from "./i18n";

// Renders whatever should appear in the "translation" slot: loading placeholder,
// error string, or the real translation. Centralised so the JSX below stays flat.
function translationText(
  S: Strings,
  loading: boolean,
  error: TranslateErrorCode | null,
  translation: string
): string {
  if (loading) return S.translatingLabel;
  if (error === "rate_limit") return S.translateErrorRateLimit;
  if (error === "network") return S.translateErrorNetwork;
  if (error) return S.translateErrorGeneric;
  return translation;
}

// Formats an epoch ms as local HH:MM for the Settings "last synced" line.
// Returns em dash when we've never successfully flushed.
function formatSyncedAt(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function App() {
  const { settings, loaded, update } = useSettings();
  const [screen, setScreen] = useState<Screen | null>(null);
  const vocab = useVocab();
  const selection = useSelection(settings.ui_language === "en" ? "en" : "zh-CN");
  const focus = useFocusWord();
  const syncStatus = useSyncStatus();

  // D43 (supersedes D21): a fresh selection always pulls the user to the
  // Translate tab, no matter where they were. v1's "sticky intent" check
  // (don't yank users off Vocab) was a pain point — users expected a new
  // lookup to surface its own result, not sit silently behind another tab.
  useEffect(() => {
    if (!selection.data) return;
    setScreen("translate");
  }, [selection.data]);

  // FOCUS_WORD_IN_VOCAB intent — the user clicked "打开详情" in the bubble
  // (Phase E) or clicked a highlight in the v1 flow. Jump to the Vocab tab
  // so the focused word becomes visible. Depends on focusTick so re-clicking
  // the same highlight re-triggers scroll-into-view in the Vocab screen.
  useEffect(() => {
    if (!focus.focusedKey) return;
    setScreen("vocab");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.focusedKey, focus.focusTick]);

  const S = DR_STRINGS[settings.ui_language];

  // Derive the active screen: explicit user choice wins, else fall back to
  // "Welcome on first run, Translate otherwise".
  // Note: computed unconditionally (before the `loaded` early-return below)
  // so the hook call count stays stable across renders — React error #310
  // happens the instant an early return hides a later useMemo from one pass.
  const activeScreen: Screen =
    screen ??
    (settings.first_run_completed
      ? selection.data
        ? "translate"
        : "translate-empty"
      : "welcome");

  const activeTab = tabForScreen(activeScreen);

  const handleTabChange = (tab: Tab) => {
    if (tab === "translate") setScreen(selection.data ? "translate" : "translate-empty");
    else if (tab === "vocab") setScreen(vocab.words.length ? "vocab" : "vocab-empty");
    else setScreen("settings");
  };

  // Nuke everything via CLEAR_DATA, then hard-reload so every cached piece of
  // state (hooks, closures, transient React state) starts from zero.
  const handleClear = async () => {
    if (!confirm(S.clearDataHint)) return;
    await vocab.clear();
    window.location.reload();
  };

  // `word_key` is the dedup key — lowercased/trimmed. Computed once so both
  // the "Saved" indicator and the Save handler stay consistent.
  const currentKey = selection.data ? wordKeyOf(selection.data.word) : null;
  const isSaved = !!currentKey && vocab.words.some((w) => w.word_key === currentKey);

  // Build a VocabWord from the current translation and hand it off.
  // If the word is already saved we preserve `created_at` + any existing note —
  // Save on an already-saved word acts as "refresh translation/context".
  const handleSaveCurrent = async () => {
    if (!selection.data || !currentKey) return;
    const now = Date.now();
    const existing = vocab.words.find((w) => w.word_key === currentKey);
    const word: VocabWord = {
      word: selection.data.word,
      word_key: currentKey,
      translation: selection.data.translation,
      ctx: selection.data.contextSentence,
      source_url: selection.data.sourceUrl,
      note: existing?.note,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      schema_version: 2,
    };
    await vocab.save(word);
  };

  // Notes are persisted by re-saving the whole word with a bumped updated_at;
  // the write buffer coalesces bursts so rapid edits collapse into one sync write.
  const handleSaveNote = async (word_key: string, note: string) => {
    const existing = vocab.words.find((w) => w.word_key === word_key);
    if (!existing) return;
    await vocab.save({ ...existing, note: note.trim() || undefined, updated_at: Date.now() });
  };

  const handleExport = async () => {
    if (vocab.words.length === 0) return;
    await exportVocabCsv(vocab.words);
  };

  const syncedAtLabel = useMemo(
    () => formatSyncedAt(syncStatus.lastSyncedAt),
    [syncStatus.lastSyncedAt]
  );

  const content = useMemo(() => {
    switch (activeScreen) {
      case "welcome":
        return (
          <Welcome
            S={S}
            onStart={() => {
              update({ first_run_completed: true });
              setScreen("translate-empty");
            }}
            onSkipToSettings={() => {
              update({ first_run_completed: true });
              setScreen("settings");
            }}
          />
        );
      case "translate-empty":
        return <TranslateEmpty S={S} paused={!settings.learning_mode_enabled} />;
      case "translate":
        if (!selection.data)
          return <TranslateEmpty S={S} paused={!settings.learning_mode_enabled} />;
        return (
          <Translate
            S={S}
            data={{
              ...selection.data,
              saved: isSaved,
              translation: translationText(
                S,
                selection.loading,
                selection.error,
                selection.data.translation
              ),
            }}
            onSave={() => {
              // Don't let a user "save" while the translation is still a
              // placeholder or an error string — we'd be persisting "…".
              if (selection.loading || selection.error) return;
              void handleSaveCurrent();
            }}
            onAddNote={() => {
              // "Add note" is a shortcut to the Vocab tab where inline
              // editing lives; no separate modal in v1.
              setScreen("vocab");
            }}
          />
        );
      case "vocab-empty":
        return <VocabEmpty S={S} />;
      case "vocab":
        return (
          <Vocab
            S={S}
            words={vocab.words}
            nearQuota={vocab.words.length >= VOCAB_QUOTA_WARN_AT}
            focusedKey={focus.focusedKey}
            focusTick={focus.focusTick}
            onExport={() => void handleExport()}
            onSaveNote={(key, note) => void handleSaveNote(key, note)}
            onDelete={(w) => void vocab.remove(w.word_key)}
          />
        );
      case "settings":
        return (
          <Settings
            S={S}
            settings={settings}
            onChange={update}
            onClear={handleClear}
            syncedAtLabel={syncedAtLabel}
            syncedCount={vocab.words.length}
            syncStatus={syncStatus}
          />
        );
    }
  }, [activeScreen, S, settings, selection, vocab, update, isSaved, syncedAtLabel, focus.focusedKey, focus.focusTick, syncStatus]);

  // Gate the first render until settings hydrate. Placed AFTER all hooks so
  // the hook count is identical on both the pre-load and post-load passes —
  // otherwise React throws error #310 on the transition.
  if (!loaded) return null;

  return (
    <div className="dr-root" data-screen={activeScreen} lang={settings.ui_language}>
      {activeScreen !== "welcome" && activeTab && (
        <PanelHeader S={S} activeTab={activeTab} onTabChange={handleTabChange} />
      )}
      {activeScreen === "welcome" ? content : <main className="dr-main">{content}</main>}
    </div>
  );
}
