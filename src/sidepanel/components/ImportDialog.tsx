// Bulk-import modal for the vocab list.
//
// Two ingress paths share one parser: paste into the textarea, or pick a
// .csv / .txt / .tsv file. The parser runs on every text change so the
// preview counts stay in sync with what the user is about to import.
// Confirm calls importMany; the success state shows the resulting counts
// inline before the user closes.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportResult } from "../../shared/messages";
import { VOCAB_QUOTA_WARN_AT } from "../../shared/messages";
import type { Lang, VocabWord } from "../../shared/types";
import type { Strings } from "../i18n";
import { parseImportText, type ImportParseResult } from "../importVocab";

interface Props {
  S: Strings;
  uiLanguage: Lang;
  existing: VocabWord[];
  onClose: () => void;
  onImport: (rows: VocabWord[]) => Promise<ImportResult>;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: ImportResult }
  | { kind: "error"; message: string };

export function ImportDialog({ S, uiLanguage, existing, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Esc closes — only when not mid-import, otherwise the user could lose a
  // half-finished round-trip.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && phase.kind !== "running") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, onClose]);

  const parsed: ImportParseResult = useMemo(() => {
    if (!text.trim()) return { rows: [], invalid: [] };
    return parseImportText(text, { uiLanguage });
  }, [text, uiLanguage]);

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const w of existing) set.add(w.word_key);
    return set;
  }, [existing]);

  const counts = useMemo(() => {
    let added = 0;
    let updated = 0;
    for (const r of parsed.rows) {
      if (existingKeys.has(r.word_key)) updated += 1;
      else added += 1;
    }
    return { added, updated };
  }, [parsed.rows, existingKeys]);

  const projectedTotal = existing.length + counts.added;
  const showQuotaWarn = projectedTotal >= VOCAB_QUOTA_WARN_AT;

  const canConfirm =
    phase.kind === "idle" && parsed.rows.length > 0;

  async function handleFile(file: File): Promise<void> {
    try {
      const content = await file.text();
      setText(content);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleConfirm(): Promise<void> {
    if (parsed.rows.length === 0) return;
    setPhase({ kind: "running" });
    try {
      const result = await onImport(parsed.rows);
      setPhase({
        kind: "done",
        result: {
          added: result.added,
          updated: result.updated,
          // The parser-rejected rows aren't part of `rows`, but they are
          // user-visible "skipped" in the success summary. Surface them so
          // the count matches what the preview just showed.
          skipped: result.skipped + parsed.invalid.length,
        },
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div
      className="dr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={S.importDialogTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase.kind !== "running") onClose();
      }}
    >
      <div className="dr-modal">
        <div className="dr-modal__header">
          <div className="dr-modal__title">{S.importDialogTitle}</div>
          <button
            type="button"
            className="dr-modal__close"
            aria-label={S.importCancel}
            onClick={onClose}
            disabled={phase.kind === "running"}
          >
            ×
          </button>
        </div>

        <div className="dr-modal__hint">{S.importPasteHint}</div>

        <textarea
          className="dr-modal__textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (phase.kind !== "idle" && phase.kind !== "running") {
              setPhase({ kind: "idle" });
            }
          }}
          placeholder={"apple,苹果\nbanana,香蕉"}
          disabled={phase.kind === "running"}
          spellCheck={false}
        />

        <div className="dr-modal__file-row">
          <button
            type="button"
            className="dr-modal__file-btn"
            onClick={() => fileRef.current?.click()}
            disabled={phase.kind === "running"}
          >
            {S.importPickFile}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="dr-modal__file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              // Reset so picking the same filename twice still re-parses.
              e.target.value = "";
            }}
          />
        </div>

        {text.trim().length === 0 ? (
          <div className="dr-modal__preview dr-modal__preview--empty">
            {S.importEmpty}
          </div>
        ) : (
          <div className="dr-modal__preview">
            <div className="dr-modal__preview-counts">
              {S.importPreview(counts.added, counts.updated, parsed.invalid.length)}
            </div>
            {parsed.invalid.length > 0 && (
              <div className="dr-modal__preview-invalid">
                {parsed.invalid
                  .slice(0, 8)
                  .map((row) => S.importInvalidLine(row.line))
                  .join(", ")}
                {parsed.invalid.length > 8 ? " …" : ""}
              </div>
            )}
            {showQuotaWarn && (
              <div className="dr-modal__preview-quota">
                {S.importQuotaWarn(projectedTotal)}
              </div>
            )}
          </div>
        )}

        {phase.kind === "done" && (
          <div className="dr-modal__result">
            {S.importDone(
              phase.result.added,
              phase.result.updated,
              phase.result.skipped
            )}
          </div>
        )}
        {phase.kind === "error" && (
          <div className="dr-modal__error">{phase.message}</div>
        )}

        <div className="dr-modal__actions">
          <button
            type="button"
            className="dr-modal__btn dr-modal__btn--ghost"
            onClick={onClose}
            disabled={phase.kind === "running"}
          >
            {S.importCancel}
          </button>
          <button
            type="button"
            className="dr-modal__btn dr-modal__btn--primary"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {phase.kind === "running" ? S.importRunning : S.importConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
