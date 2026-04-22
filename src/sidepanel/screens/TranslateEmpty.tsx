import type { Strings } from "../i18n";

// Empty-state for the Translate tab. Two variants share this file because
// their layout is identical — only the copy differs:
//   - default: "select text on a page" prompt (selection has never arrived)
//   - paused: FAB master switch is off, so there's nothing to translate
//     regardless of user action. The paused body tells the user where to
//     find the re-enable control (page-level FAB, bottom-right) so they
//     don't conclude the extension is broken.
interface Props {
  S: Strings;
  paused?: boolean;
}

export function TranslateEmpty({ S, paused = false }: Props) {
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
      <div className="dr-translate-empty__title">
        {paused ? S.learningModePausedTitle : S.selectPrompt}
      </div>
      <div className="dr-translate-empty__hint">
        {paused ? S.learningModePausedBody : S.selectHint}
      </div>
    </section>
  );
}
