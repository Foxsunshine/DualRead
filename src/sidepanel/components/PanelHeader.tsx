import type { Strings } from "../i18n";
import type { Tab } from "../state";
import { IconBtn } from "./IconBtn";
import { LogoMark } from "./LogoMark";

// PanelHeader hosts the brand strip and the three-tab navigation. The
// right-side icon slot in the top row is the "global feature switch" area;
// v1.1 Phase G uses it for the click-to-translate toggle (F3 in
// docs/v1-1-feedback.md). It intentionally lives outside the tab bar so the
// control is reachable from any tab, not just Settings — users who dismiss
// a page-level bubble should be able to silence the feature on the spot
// without navigating away from the translation they're reading.
interface Props {
  S: Strings;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  clickToTranslate: boolean;
  onToggleClickTranslate: () => void;
}

export function PanelHeader({
  S,
  activeTab,
  onTabChange,
  clickToTranslate,
  onToggleClickTranslate,
}: Props) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "translate", label: S.translate },
    { id: "vocab", label: S.vocab },
    { id: "settings", label: S.settings },
  ];
  const toggleTitle = clickToTranslate
    ? S.clickTranslateTooltipOn
    : S.clickTranslateTooltipOff;
  return (
    <header className="dr-header">
      <div className="dr-header__top">
        <LogoMark size="sm" />
        <div className="dr-header__title">{S.appName}</div>
        <div className="dr-header__spacer" />
        <IconBtn
          title={toggleTitle}
          active={clickToTranslate}
          onClick={onToggleClickTranslate}
        >
          {/* Cursor + sparkle glyph — reads as "tap to get something". When
              active the filled fill and accent background make the "engaged"
              state unmistakable against the neutral chrome. */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 2.2 L3 10.2 L5.2 8.2 L6.6 11.4 L8.1 10.8 L6.7 7.6 L9.6 7.4 Z" />
            <path d="M11 2.5 L11 4.5" />
            <path d="M10 3.5 L12 3.5" />
          </svg>
        </IconBtn>
      </div>
      <nav className="dr-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`dr-tab ${activeTab === t.id ? "dr-tab--active" : ""}`}
            onClick={() => onTabChange(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
