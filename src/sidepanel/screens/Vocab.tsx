// Vocab list screen.
//
// Owns local UI-only state: search query, sort mode, which row is expanded,
// and the in-progress note textarea. Persistent state (the words themselves)
// lives in the parent via useVocab — this component is purely a view over it
// plus some transient interaction state.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Strings } from "../i18n";
import type { VocabWord } from "../../shared/types";
import { MetaLabel } from "../components/MetaLabel";

type SortMode = "recent" | "alpha";

interface Props {
  S: Strings;
  words: VocabWord[];
  nearQuota?: boolean;
  // Word the user asked to jump to (via highlight click). When it (or the
  // tick) changes, we expand that row, clear the search filter if it's
  // hiding the row, and scroll the row into view.
  focusedKey?: string | null;
  focusTick?: number;
  onExport: () => void;
  onSaveNote: (word_key: string, note: string) => void;
  onDelete: (w: VocabWord) => void;
}

// "2d" / "today" badge helper. Clamped to ≥0 so a newly-created word with
// a slightly future timestamp (clock skew between devices) still reads "today".
function daysAgo(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

export function Vocab({
  S,
  words,
  nearQuota,
  focusedKey,
  focusTick,
  onExport,
  onSaveNote,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [expandedKey, setExpandedKey] = useState<string | null>(focusedKey ?? null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  // Map word_key → row DOM node so a focus request can scroll the right one
  // into view without traversing the list each time.
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const registerRow = (key: string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  // React to an incoming FOCUS_WORD: expand the row, drop any search filter
  // that would hide it, and scroll it into view once the DOM has caught up.
  // Depending on focusTick (not just focusedKey) makes re-clicking the same
  // highlight re-run the scroll — otherwise React would bail on an unchanged
  // prop value.
  useEffect(() => {
    if (!focusedKey) return;
    setExpandedKey(focusedKey);
    setEditingKey(null);
    // Drop the search filter if the targeted word wouldn't be visible under it.
    setQuery((q) => {
      if (!q) return q;
      const word = words.find((w) => w.word_key === focusedKey);
      if (!word) return "";
      const needle = q.trim().toLowerCase();
      // v2.3: search against the new `translation` field with `zh` as
      // legacy fallback so words saved before the schema migration stay
      // findable.
      const hit =
        word.word.toLowerCase().includes(needle) ||
        (word.translation ?? word.zh ?? "").toLowerCase().includes(needle) ||
        (word.note ?? "").toLowerCase().includes(needle);
      return hit ? q : "";
    });
    // Defer the scroll one frame so the row has mounted / re-rendered with
    // `--focused` styling and its final layout.
    const raf = requestAnimationFrame(() => {
      const el = rowRefs.current.get(focusedKey);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedKey, focusTick]);

  // Search matches against word, translation, and note — no fuzzy, just
  // substring. Sort is applied after filtering so a narrow search list still
  // obeys the user's chosen order.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = words;
    if (q) {
      list = list.filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          (w.translation ?? w.zh ?? "").toLowerCase().includes(q) ||
          (w.note ?? "").toLowerCase().includes(q)
      );
    }
    list = [...list];
    if (sort === "alpha") list.sort((a, b) => a.word.localeCompare(b.word));
    else list.sort((a, b) => b.created_at - a.created_at);
    return list;
  }, [words, query, sort]);

  // Only one row expanded at a time — collapsing any other row makes the list
  // scannable. Collapsing also exits edit mode so a half-typed note doesn't
  // silently stick around.
  const toggleExpand = (key: string) => {
    setExpandedKey((k) => (k === key ? null : key));
    setEditingKey(null);
  };

  const startEdit = (w: VocabWord) => {
    setEditingKey(w.word_key);
    setDraftNote(w.note ?? "");
  };

  // Commit on blur / Cmd+Enter. Always clear editingKey so the textarea
  // doesn't linger after save.
  const commitEdit = (w: VocabWord) => {
    onSaveNote(w.word_key, draftNote);
    setEditingKey(null);
  };

  return (
    <section className="dr-screen dr-vocab">
      <div className="dr-vocab__toolbar">
        <div className="dr-search">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="5.5" cy="5.5" r="4" />
            <path d="M8.5 8.5L12 12" />
          </svg>
          <input
            className="dr-search__input"
            type="search"
            placeholder={S.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="dr-vocab__toolbar-row">
          <div className="dr-vocab__count">{S.wordsCount(words.length)}</div>
          <div className="dr-vocab__spacer" />
          <button
            type="button"
            className="dr-vocab__sort"
            onClick={() => setSort((s) => (s === "recent" ? "alpha" : "recent"))}
          >
            <span>{sort === "recent" ? S.sortRecent : S.sortAlpha}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 4l3 3 3-3" />
            </svg>
          </button>
          <button type="button" className="dr-vocab__export" onClick={onExport}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5.5 1v7M3 6l2.5 2.5L8 6M1 10h9" />
            </svg>
            <span>{S.export}</span>
          </button>
        </div>
      </div>

      {nearQuota && (
        <div className="dr-vocab__quota">
          <div className="dr-vocab__quota-icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M7 1l6 11H1L7 1zM7 5v3M7 10v.5" />
            </svg>
          </div>
          <div className="dr-vocab__quota-text">
            <div className="dr-vocab__quota-title">{S.quotaNear}</div>
            <div className="dr-vocab__quota-body">{S.quotaBody}</div>
          </div>
        </div>
      )}

      <div className="dr-vocab__list">
        {visible.map((w) => {
          const focused = w.word_key === expandedKey;
          const editing = w.word_key === editingKey;
          const d = daysAgo(w.created_at);
          return (
            <div
              key={w.word_key}
              ref={registerRow(w.word_key)}
              className={`dr-vocab-row ${focused ? "dr-vocab-row--focused" : ""}`}
            >
              <div
                className="dr-vocab-row__head"
                onClick={() => toggleExpand(w.word_key)}
                role="button"
                tabIndex={0}
              >
                <div className="dr-vocab-row__word">{w.word}</div>
                <div className="dr-vocab-row__zh">{w.translation ?? w.zh ?? ""}</div>
                <div className="dr-vocab-row__days">{d === 0 ? "today" : `${d}d`}</div>
              </div>
              {w.ctx && <div className="dr-vocab-row__ctx">“…{w.ctx}…”</div>}
              {focused && (
                <div className="dr-vocab-row__expand">
                  <MetaLabel>{S.noteField}</MetaLabel>
                  {editing ? (
                    <textarea
                      className="dr-vocab-row__note-input"
                      value={draftNote}
                      autoFocus
                      placeholder={S.noteAdd}
                      onChange={(e) => setDraftNote(e.target.value)}
                      onBlur={() => commitEdit(w)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitEdit(w);
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                    />
                  ) : (
                    <div
                      className={`dr-vocab-row__note ${!w.note ? "dr-vocab-row__note--empty" : ""}`}
                      onClick={() => startEdit(w)}
                    >
                      {w.note || S.noteAdd}
                    </div>
                  )}
                  <div className="dr-vocab-row__actions">
                    <button type="button" className="dr-vocab-row__edit" onClick={() => startEdit(w)}>
                      {S.edit}
                    </button>
                    <button type="button" className="dr-vocab-row__delete" onClick={() => onDelete(w)}>
                      {S.delete}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
