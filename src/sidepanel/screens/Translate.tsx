import type { Strings } from "../i18n";
import { MetaLabel } from "../components/MetaLabel";

export interface TranslateData {
  word: string;
  translation: string;
  contextBefore?: string;
  contextAfter?: string;
  contextSentence?: string;
  source?: string;
  sourceUrl?: string;
  saved?: boolean;
}

interface Props {
  S: Strings;
  data: TranslateData;
  onSave: () => void;
}

export function Translate({ S, data, onSave }: Props) {
  return (
    <section className="dr-screen dr-translate">
      <div className="dr-translate__block">
        <MetaLabel>{S.selectionLabel}</MetaLabel>
        <div className="dr-translate__word">{data.word}</div>
      </div>

      <div className="dr-divider" />

      <div className="dr-translate__block">
        <MetaLabel>{S.translationLabel}</MetaLabel>
        <div className="dr-translate__translation">{data.translation}</div>
      </div>

      {(data.contextBefore || data.contextAfter || data.source) && (
        <div className="dr-translate__context">
          <MetaLabel>{S.contextLabel}</MetaLabel>
          <div className="dr-translate__context-text">
            {data.contextBefore}
            <mark>{data.word}</mark>
            {data.contextAfter}
          </div>
          {data.source && (
            <div className="dr-translate__source">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M4 5.5l-1 1a1.5 1.5 0 01-2-2l2-2a1.5 1.5 0 012 0M6 4.5l1-1a1.5 1.5 0 012 2l-2 2a1.5 1.5 0 01-2 0" />
              </svg>
              <span>{data.source}</span>
            </div>
          )}
        </div>
      )}

      <div className="dr-translate__spacer" />

      <div className="dr-translate__actions">
        <button
          type="button"
          className={`dr-btn dr-btn--primary dr-btn--save ${data.saved ? "dr-btn--saved" : ""}`}
          onClick={onSave}
        >
          <svg className="dr-icon-save" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 2h8v10l-4-2.5L3 12V2z" />
          </svg>
          <svg className="dr-icon-saved" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7l3.5 3.5L12 4" />
          </svg>
          <span className="dr-btn__label dr-btn__label--save">{S.saveBtn}</span>
          <span className="dr-btn__label dr-btn__label--saved">{S.savedBtn}</span>
        </button>
      </div>
      <div className="dr-translate__powered">{S.poweredBy}</div>
    </section>
  );
}
