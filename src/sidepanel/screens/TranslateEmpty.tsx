import type { Strings } from "../i18n";

export function TranslateEmpty({ S }: { S: Strings }) {
  return (
    <section className="dr-screen dr-translate-empty">
      <div className="dr-translate-empty__icon">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 5h7M6.5 5v10M4 15h5" />
          <path d="M14 10h7M14 10l3 9m4-9l-3 9m-5-3h6" />
        </svg>
      </div>
      <div className="dr-translate-empty__title">{S.selectPrompt}</div>
      <div className="dr-translate-empty__hint">{S.selectHint}</div>
    </section>
  );
}
