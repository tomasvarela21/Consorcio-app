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
    <div
      className={clsx(
        "rounded-2xl border border-slate-200/70 bg-white/90 shadow-lg shadow-slate-200/50 backdrop-blur",
        className,
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-slate-200/50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
            {description && <p className="text-sm text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
