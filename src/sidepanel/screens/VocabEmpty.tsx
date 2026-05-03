import type { Strings } from "../i18n";

interface Props {
  S: Strings;
  onImport?: () => void;
}

export function VocabEmpty({ S, onImport }: Props) {
  return (
    <section className="dr-screen dr-vocab-empty">
      <div className="dr-vocab-empty__card">
        <div className="dr-vocab-empty__line dr-vocab-empty__line--1" />
        <div className="dr-vocab-empty__line dr-vocab-empty__line--2" />
        <div className="dr-vocab-empty__line dr-vocab-empty__line--3" />
      </div>
      <div className="dr-vocab-empty__title">{S.vocabEmpty}</div>
      <div className="dr-vocab-empty__body">{S.vocabEmptyBody}</div>
      {onImport && (
        <button
          type="button"
          className="dr-vocab-empty__import"
          onClick={onImport}
        >
          {S.importBtn}
        </button>
      )}
    </section>
  );
}
