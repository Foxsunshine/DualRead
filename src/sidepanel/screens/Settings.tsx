import type { Strings } from "../i18n";
import type { HighlightStyle, Settings as SettingsType } from "../../shared/types";
import type { SyncState, SyncStatus } from "../useSyncStatus";
import { Toggle } from "../components/Toggle";

interface Props {
  S: Strings;
  settings: SettingsType;
  onChange: (patch: Partial<SettingsType>) => void;
  onClear: () => void;
  syncedAtLabel?: string;
  syncedCount?: number;
  syncStatus: SyncStatus;
}

export function Settings({
  S,
  settings,
  onChange,
  onClear,
  syncedAtLabel = "—",
  syncedCount = 0,
  syncStatus,
}: Props) {
  return (
    <section className="dr-screen dr-settings">
      <div className="dr-settings__row">
        <div className="dr-settings__row-text">
          <div className="dr-settings__row-title">{S.highlightAuto}</div>
          <div className="dr-settings__row-subtitle">{S.highlightAutoHint}</div>
        </div>
        <Toggle
          on={settings.auto_highlight_enabled}
          onChange={(v) => onChange({ auto_highlight_enabled: v })}
        />
      </div>

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.highlightStyle}</div>
        <div className="dr-settings__style-grid">
          <StyleOption
            active={settings.highlight_style === "underline"}
            onClick={() => onChange({ highlight_style: "underline" })}
            label={S.highlightUnderline}
            variant="underline"
          />
          <StyleOption
            active={settings.highlight_style === "background"}
            onClick={() => onChange({ highlight_style: "background" })}
            label={S.highlightBackground}
            variant="background"
          />
        </div>
      </div>

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.uiLanguage}</div>
        <div className="dr-lang-toggle">
          <LangBtn label={S.zh} active={settings.ui_language === "zh-CN"} onClick={() => onChange({ ui_language: "zh-CN" })} />
          <LangBtn label={S.en} active={settings.ui_language === "en"} onClick={() => onChange({ ui_language: "en" })} />
        </div>
      </div>

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.syncStatus}</div>
        <SyncIndicator
          S={S}
          status={syncStatus}
          syncedAtLabel={syncedAtLabel}
          syncedCount={syncedCount}
        />
      </div>

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.feedbackTitle}</div>
        <ul className="dr-contact">
          <li className="dr-contact__row">
            <a
              className="dr-contact__link"
              href="mailto:jiang.ch2022@gmail.com?subject=DualRead"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="1.5" y="3" width="11" height="8" rx="1.5" />
                <path d="M2 4l5 4 5-4" />
              </svg>
              <span>jiang.ch2022@gmail.com</span>
            </a>
          </li>
          <li className="dr-contact__row">
            <a
              className="dr-contact__link"
              href="https://github.com/Foxsunshine/DualRead/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5.5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" />
                <path d="M8 2h4v4" />
                <path d="M6.5 7.5L12 2" />
              </svg>
              <span>github.com/Foxsunshine/DualRead/issues</span>
            </a>
          </li>
        </ul>
      </div>

      <div className="dr-settings__spacer" />

      <div className="dr-danger">
        <div className="dr-danger__title">{S.clearData}</div>
        <div className="dr-danger__body">{S.clearDataHint}</div>
        <button type="button" className="dr-danger__btn" onClick={onClear}>
          {S.clearData}
        </button>
      </div>
    </section>
  );
}

interface StyleOptionProps {
  active: boolean;
  label: string;
  variant: HighlightStyle;
  onClick: () => void;
}

function StyleOption({ active, label, variant, onClick }: StyleOptionProps) {
  return (
    <button
      type="button"
      className={`dr-style-option ${active ? "dr-style-option--active" : ""}`}
      onClick={onClick}
    >
      <div className="dr-style-option__preview">
        <span className={`dr-style-preview dr-style-preview--${variant}`}>profound</span>
      </div>
      <div className="dr-style-option__label">{label}</div>
    </button>
  );
}

// Sync status widget. Collapses the 4 states into:
//   - a colored dot (via modifier class on `.dr-sync__dot`)
//   - a primary line (localized state name)
//   - a detail line that is *always* copy-pasteable — includes the raw error
//     code when present, so users can include it verbatim in bug reports
//     (R5 rationale: no telemetry, so the UI itself is the diagnostic).
interface SyncIndicatorProps {
  S: Strings;
  status: SyncStatus;
  syncedAtLabel: string;
  syncedCount: number;
}

function labelForState(S: Strings, state: SyncState, pending: number): string {
  switch (state) {
    case "syncing":
      return pending > 0 ? S.syncingItems(pending) : S.syncing;
    case "offline":
      return S.syncOffline;
    case "error":
      return S.syncError;
    case "synced":
    default:
      return S.synced;
  }
}

function SyncIndicator({ S, status, syncedAtLabel, syncedCount }: SyncIndicatorProps) {
  const primary = labelForState(S, status.state, status.pendingCount);
  // Secondary detail is state-specific:
  //   error   → the raw code, so the user can paste it.
  //   offline → hint explaining queued-until-online semantics.
  //   synced  → last-synced timestamp + item count (the existing v1 display).
  //   syncing → item count only; timestamp isn't meaningful mid-flight.
  let detail: string;
  if (status.state === "error" && status.lastError) {
    detail = S.syncErrorDetail(status.lastError.code);
  } else if (status.state === "offline") {
    detail = S.syncOfflineHint;
  } else if (status.state === "syncing") {
    detail = `${syncedCount} items`;
  } else {
    detail = `${S.syncedAt(syncedAtLabel)} · ${syncedCount} items`;
  }

  return (
    <div className={`dr-sync dr-sync--${status.state}`}>
      <div className="dr-sync__dot" />
      <div className="dr-sync__text">
        <div className="dr-sync__status">{primary}</div>
        <div className="dr-sync__detail">{detail}</div>
      </div>
    </div>
  );
}

function LangBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`dr-lang-toggle__btn ${active ? "dr-lang-toggle__btn--active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

