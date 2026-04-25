import { useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../../shared/types";
import { LANG_OPTIONS } from "../../shared/types";
import { LogoMark } from "../components/LogoMark";

interface Props {
  S: Strings;
  // current ui_language (already populated by the v2.2 onInstalled
  // auto-detect by the time Welcome renders). The picker uses this as
  // its initial active option; user clicks override it via onLangChange.
  currentLang: Lang;
  onLangChange: (lang: Lang) => void;
  onStart: () => void;
  onSkipToSettings: () => void;
}

export function Welcome({
  S,
  currentLang,
  onLangChange,
  onStart,
  onSkipToSettings,
}: Props) {
  // v2.4 P1-S5: distinguish "active because we auto-detected for you" from
  // "active because you clicked." On first render the active option carries
  // a dashed outline; clicking any option (even the same one) flips this
  // local state and the outline becomes solid for every option from there
  // on. State is intentionally local to Welcome — once the user dismisses
  // the screen via CTA / skip, this distinction stops mattering.
  const [userHasPickedYet, setUserHasPickedYet] = useState(false);

  return (
    <section className="dr-screen dr-welcome">
      <div className="dr-welcome__logo">
        <LogoMark size="lg" />
      </div>
      <div className="dr-welcome__hello">{S.welcomeHello}</div>
      <h1 className="dr-welcome__heading">{S.welcomeHeading}</h1>
      <p className="dr-welcome__body">{S.welcomeBody}</p>

      {/*
        4-option language picker as a proper ARIA radiogroup with
        roving tabindex (only the active radio is in the tab order)
        and arrow-key navigation per the ARIA APG radio pattern.
        `aria-labelledby` ties the prompt text to the group so a
        screen reader announces "Your native language: radio group,
        4 of 4, 中文 selected" instead of four independent toggles.
      */}
      <div className="dr-welcome__lang-group">
        <div id="dr-welcome-lang-prompt" className="dr-welcome__lang-prompt">
          {S.welcomeLangPrompt}
        </div>
        <div
          role="radiogroup"
          aria-labelledby="dr-welcome-lang-prompt"
          className="dr-welcome__langs"
          onKeyDown={(e) => {
            const idx = LANG_OPTIONS.findIndex((l) => l.id === currentLang);
            if (idx < 0) return;
            let next = idx;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              next = (idx + 1) % LANG_OPTIONS.length;
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              next = (idx - 1 + LANG_OPTIONS.length) % LANG_OPTIONS.length;
            } else {
              return;
            }
            e.preventDefault();
            setUserHasPickedYet(true);
            onLangChange(LANG_OPTIONS[next].id);
          }}
        >
          {LANG_OPTIONS.map((l) => {
            const active = currentLang === l.id;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                lang={l.id}
                className={
                  `dr-lang-card${active ? " dr-lang-card--active" : ""}` +
                  (active && !userHasPickedYet ? " dr-lang-card--auto-detected" : "")
                }
                onClick={() => {
                  setUserHasPickedYet(true);
                  onLangChange(l.id);
                }}
              >
                {l.nativeLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dr-welcome__spacer" />

      <button type="button" className="dr-btn dr-btn--primary" onClick={onStart}>
        {S.welcomeCta}
      </button>
      <button type="button" className="dr-btn dr-btn--ghost" onClick={onSkipToSettings}>
        {S.welcomeSkip}
      </button>
    </section>
  );
}
