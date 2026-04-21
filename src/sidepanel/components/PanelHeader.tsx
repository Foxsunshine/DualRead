import type { Strings } from "../i18n";
import type { Tab } from "../state";
import { IconBtn } from "./IconBtn";
import { LogoMark } from "./LogoMark";

interface Props {
  S: Strings;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function PanelHeader({ S, activeTab, onTabChange }: Props) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "translate", label: S.translate },
    { id: "vocab", label: S.vocab },
    { id: "settings", label: S.settings },
  ];
  return (
    <header className="dr-header">
      <div className="dr-header__top">
        <LogoMark size="sm" />
        <div className="dr-header__title">{S.appName}</div>
        <div className="dr-header__spacer" />
        <IconBtn title="Recent">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="5.5" />
            <path d="M7 4v3l2 1.5" />
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
