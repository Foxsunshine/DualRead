import type { ReactNode } from "react";

// Small square icon button used in PanelHeader. The optional `active` prop
// is set on toggle-style buttons (e.g. the click-to-translate switch in
// Phase G) so CSS can render a distinct "on" state — without it, a toggle
// and a one-shot action would look identical and users would have no way
// to tell whether the feature is currently engaged.
interface Props {
  children: ReactNode;
  title?: string;
  active?: boolean;
  onClick?: () => void;
}

export function IconBtn({ children, title, active, onClick }: Props) {
  const className = active ? "dr-icon-btn dr-icon-btn--active" : "dr-icon-btn";
  return (
    <button
      className={className}
      title={title}
      onClick={onClick}
      type="button"
      aria-pressed={active === undefined ? undefined : active}
    >
      {children}
    </button>
  );
}
