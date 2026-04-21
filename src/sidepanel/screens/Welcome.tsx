import type { Strings } from "../i18n";
import type { Level } from "../../shared/types";
import { LogoMark } from "../components/LogoMark";

interface Props {
  S: Strings;
  level: Level;
  onLevelChange: (level: Level) => void;
  onStart: () => void;
  onSkipToSettings: () => void;
}

const LEVELS: { id: Level; labelKey: keyof Strings }[] = [
  { id: "A2", labelKey: "levelA2" },
  { id: "B1", labelKey: "levelB1" },
  { id: "B2", labelKey: "levelB2" },
  { id: "C1", labelKey: "levelC1" },
];

export function Welcome({ S, level, onLevelChange, onStart, onSkipToSettings }: Props) {
  return (
    <section className="dr-screen dr-welcome">
      <div className="dr-welcome__logo">
        <LogoMark size="lg" />
      </div>
      <div className="dr-welcome__hello">{S.welcomeHello}</div>
      <h1 className="dr-welcome__heading">{S.welcomeHeading}</h1>
      <p className="dr-welcome__body">{S.welcomeBody}</p>

      <div className="dr-welcome__level-group">
        <div className="dr-welcome__level-prompt">{S.levelPrompt}</div>
        <div className="dr-welcome__levels">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`dr-level ${level === l.id ? "dr-level--active" : ""}`}
              onClick={() => onLevelChange(l.id)}
            >
              {S[l.labelKey] as string}
            </button>
          ))}
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
