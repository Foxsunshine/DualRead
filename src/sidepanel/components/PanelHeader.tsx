import type { Strings } from "../i18n";
import type { Tab } from "../state";
import { LogoMark } from "./LogoMark";

// PanelHeader hosts the brand strip and three-tab navigation. The master
// on/off switch lives on the page-level FAB (D52), not in this header —
// the FAB is reachable without opening the side panel, which is the
// point: a user who wants DualRead silenced shouldn't have to open us to
// do it. Accordingly, this header has no icon controls in v1.1 post-H.
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
