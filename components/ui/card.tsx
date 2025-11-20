import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}>;

export function Card({ className, title, description, actions, children }: CardProps) {
  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
