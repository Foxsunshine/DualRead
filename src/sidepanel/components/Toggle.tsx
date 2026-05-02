interface Props {
  on: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ on, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`dr-toggle ${on ? "dr-toggle--on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="dr-toggle__knob" />
    </button>
  );
}
