import type { Strings } from "../i18n";

export function VocabEmpty({ S }: { S: Strings }) {
  return (
    <section className="dr-screen dr-vocab-empty">
      <div className="dr-vocab-empty__card">
        <div className="dr-vocab-empty__line dr-vocab-empty__line--1" />
        <div className="dr-vocab-empty__line dr-vocab-empty__line--2" />
        <div className="dr-vocab-empty__line dr-vocab-empty__line--3" />
      </div>
      <div className="dr-vocab-empty__title">{S.vocabEmpty}</div>
      <div className="dr-vocab-empty__body">{S.vocabEmptyBody}</div>
    </section>
  );
}
