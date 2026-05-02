import type { Strings } from "../i18n";
import { LogoMark } from "../components/LogoMark";

interface Props {
  S: Strings;
  onStart: () => void;
  onSkipToSettings: () => void;
}

export function Welcome({ S, onStart, onSkipToSettings }: Props) {
  return (
    <section className="dr-screen dr-welcome">
      <div className="dr-welcome__logo">
        <LogoMark size="lg" />
      </div>
      <div className="dr-welcome__hello">{S.welcomeHello}</div>
      <h1 className="dr-welcome__heading">{S.welcomeHeading}</h1>
      <p className="dr-welcome__body">{S.welcomeBody}</p>

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
