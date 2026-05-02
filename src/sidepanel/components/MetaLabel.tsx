import type { ReactNode } from "react";

export function MetaLabel({ children }: { children: ReactNode }) {
  return <div className="dr-meta-label">{children}</div>;
}
