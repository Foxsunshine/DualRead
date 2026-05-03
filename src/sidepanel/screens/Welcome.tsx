import { useState } from "react";
import type { Strings } from "../i18n";
import type { Lang } from "../../shared/types";
import { LogoMark } from "../components/LogoMark";

// 4-language picker order. Mirrors the Settings ui_language pill row so the
// user sees the same sequence in both places.
const LANG_OPTIONS: Lang[] = ["zh-CN", "en", "ja", "fr"];

function langLabel(S: Strings, lang: Lang): string {
  switch (lang) {
    case "zh-CN":
      return S.zh;
    case "en":
      return S.en;
    case "ja":
      return S.ja;
    case "fr":
      return S.fr;
  }
}

interface Props {
  S: Strings;
  // Currently active UI language. Drives the highlighted card on the picker
  // grid; the background install listener pre-seeds this from navigator.language
  // so a Japanese-locale user lands with 日本語 already highlighted.
  currentLang: Lang;
  // Fired when the user clicks any language card. Updates the persisted
  // ui_language; translation target follows ui_language directly, so the
  // single click sets both interface and translation language at once.
  onPickLang: (lang: Lang) => void;
  onStart: () => void;
  onSkipToSettings: () => void;
}

export function Welcome({ S, currentLang, onPickLang, onStart, onSkipToSettings }: Props) {
  // Track whether the user has explicitly confirmed their language. The
  // install detector pre-highlights a card, but D5 says we must require a
  // click before enabling the CTA — explicit intent over a saved click.
  const [hasPicked, setHasPicked] = useState(false);

  const handlePick = (lang: Lang): void => {
    setHasPicked(true);
    onPickLang(lang);
  };

  return (
    <section className="dr-screen dr-welcome">
      <div className="dr-welcome__logo">
        <LogoMark size="lg" />
      </div>
      <div className="dr-welcome__hello">{S.welcomeHello}</div>
      <h1 className="dr-welcome__heading">{S.welcomeHeading}</h1>
      <p className="dr-welcome__body">{S.welcomeBody}</p>

      <div className="dr-welcome__pick-lang">
        <div className="dr-welcome__pick-lang-prompt">{S.pickLanguageHeading}</div>
        <div className="dr-welcome__pick-lang-grid">
          {LANG_OPTIONS.map((lang) => (
            <button
              key={lang}
              type="button"
              className={`dr-pick-lang ${lang === currentLang ? "dr-pick-lang--active" : ""}`}
              onClick={() => handlePick(lang)}
              aria-pressed={lang === currentLang}
            >
              {langLabel(S, lang)}
            </button>
          ))}
        </div>
        <div className="dr-welcome__pick-lang-hint">{S.pickLanguageHint}</div>
      </div>

      <div className="dr-welcome__spacer" />

      <button
        type="button"
        className="dr-btn dr-btn--primary"
        onClick={onStart}
        disabled={!hasPicked}
      >
        {S.welcomeCta}
      </button>
      <button type="button" className="dr-btn dr-btn--ghost" onClick={onSkipToSettings}>
        {S.welcomeSkip}
      </button>
    </section>
  );
}
