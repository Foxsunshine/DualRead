import { useState } from "react";
import type { Strings } from "../i18n";
import type { HighlightStyle, Lang, Settings as SettingsType, TranslationDirection } from "../../shared/types";
import type { SyncState, SyncStatus } from "../useSyncStatus";
import { Toggle } from "../components/Toggle";
import { pickAlternateLang } from "../state";

// Order matters for the dropdown — keep parallel to the language toggle
// row above so users see the same sequence in both controls.
const LANG_OPTIONS: Lang[] = ["zh-CN", "en", "ja", "fr"];

function langDisplayName(S: Strings, lang: Lang): string {
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
        <div className="dr-lang-toggle dr-lang-toggle--quad">
          <LangBtn label={S.zh} active={settings.ui_language === "zh-CN"} onClick={() => onChange({ ui_language: "zh-CN" })} />
          <LangBtn label={S.en} active={settings.ui_language === "en"} onClick={() => onChange({ ui_language: "en" })} />
          <LangBtn label={S.ja} active={settings.ui_language === "ja"} onClick={() => onChange({ ui_language: "ja" })} />
          <LangBtn label={S.fr} active={settings.ui_language === "fr"} onClick={() => onChange({ ui_language: "fr" })} />
        </div>
      </div>

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.directionTitle}</div>
        <DirectionPicker
          S={S}
          direction={settings.translation_direction}
          onChange={(next) => onChange({ translation_direction: next })}
        />
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

      <div className="dr-settings__group">
        <div className="dr-settings__group-title">{S.fabDisabledOriginsTitle}</div>
        <div className="dr-settings__row-subtitle">{S.fabDisabledOriginsHint}</div>
        <FabOriginsManager
          S={S}
          origins={settings.fab_disabled_origins}
          onChange={(next) => onChange({ fab_disabled_origins: next })}
        />
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

// Canonicalize what the user typed into a `protocol//host` origin so the
// content script's `location.origin === entry` check stays a plain string
// compare. Returns null on parse failure or unsupported scheme — callers
// surface the localized invalid-input message.
function canonicalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

interface FabOriginsManagerProps {
  S: Strings;
  origins: string[];
  onChange: (next: string[]) => void;
}

function FabOriginsManager({ S, origins, onChange }: FabOriginsManagerProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd(): void {
    const canonical = canonicalizeOrigin(draft);
    if (!canonical) {
      setError(S.originInvalid);
      return;
    }
    if (origins.includes(canonical)) {
      setDraft("");
      setError(null);
      return;
    }
    onChange([...origins, canonical]);
    setDraft("");
    setError(null);
  }

  function handleRemove(target: string): void {
    onChange(origins.filter((o) => o !== target));
  }

  return (
    <div className="dr-fab-origins">
      <ul className="dr-fab-origins__list">
        {origins.length === 0 ? (
          <li className="dr-fab-origins__empty">{S.fabDisabledOriginsEmpty}</li>
        ) : (
          origins.map((origin) => (
            <li key={origin} className="dr-fab-origins__row">
              <span className="dr-fab-origins__origin">{origin}</span>
              <button
                type="button"
                className="dr-fab-origins__remove"
                aria-label={S.removeOrigin}
                onClick={() => handleRemove(origin)}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
      <form
        className="dr-fab-origins__form"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <input
          type="text"
          inputMode="url"
          className="dr-fab-origins__input"
          placeholder={S.originPlaceholder}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
        />
        <button type="submit" className="dr-fab-origins__add">
          {S.addOrigin}
        </button>
      </form>
      {error ? <div className="dr-fab-origins__error">{error}</div> : null}
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

interface DirectionPickerProps {
  S: Strings;
  direction: TranslationDirection;
  onChange: (next: TranslationDirection) => void;
}

// Two-dropdown source → target picker. Same-lang collisions are guarded at
// commit time: when the user picks an option that would collapse both
// endpoints, the *other* endpoint slides to the next supported language so
// the stored direction stays valid. The matching option in the other
// dropdown is also rendered as `disabled` for clarity even though the
// commit-time guard means it cannot actually be selected.
function DirectionPicker({ S, direction, onChange }: DirectionPickerProps) {
  const handleSourceChange = (next: Lang): void => {
    if (next === direction.target) {
      onChange({ source: next, target: pickAlternateLang(next) });
      return;
    }
    onChange({ source: next, target: direction.target });
  };

  const handleTargetChange = (next: Lang): void => {
    if (next === direction.source) {
      onChange({ source: pickAlternateLang(next), target: next });
      return;
    }
    onChange({ source: direction.source, target: next });
  };

  const same = direction.source === direction.target;

  return (
    <div className="dr-direction">
      <div className="dr-direction__row">
        <label className="dr-direction__field">
          <span className="dr-direction__field-label">{S.directionFromLabel}</span>
          <select
            className="dr-direction__select"
            value={direction.source}
            onChange={(e) => handleSourceChange(e.target.value as Lang)}
          >
            {LANG_OPTIONS.map((lang) => (
              <option key={lang} value={lang} disabled={lang === direction.target}>
                {langDisplayName(S, lang)}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className="dr-direction__arrow">→</span>
        <label className="dr-direction__field">
          <span className="dr-direction__field-label">{S.directionToLabel}</span>
          <select
            className="dr-direction__select"
            value={direction.target}
            onChange={(e) => handleTargetChange(e.target.value as Lang)}
          >
            {LANG_OPTIONS.map((lang) => (
              <option key={lang} value={lang} disabled={lang === direction.source}>
                {langDisplayName(S, lang)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dr-direction__caption">
        {same
          ? S.directionSameLangHint
          : S.directionCaption(
              langDisplayName(S, direction.source),
              langDisplayName(S, direction.target)
            )}
      </div>
    </div>
  );
}

