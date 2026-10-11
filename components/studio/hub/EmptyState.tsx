import type { ReactNode } from "react";

/** Centered icon, heading, sentence and an optional action, for empty hub pages. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="hub-empty">
      <span className="hub-empty-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
