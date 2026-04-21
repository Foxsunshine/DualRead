import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  title?: string;
  onClick?: () => void;
}

export function IconBtn({ children, title, onClick }: Props) {
  return (
    <button className="dr-icon-btn" title={title} onClick={onClick} type="button">
      {children}
    </button>
  );
}
