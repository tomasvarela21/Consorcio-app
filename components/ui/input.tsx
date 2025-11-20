import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, ...props }: Props) {
  return (
    <label className="flex w-full flex-col gap-1 text-xs font-medium text-slate-600">
      {label && <span>{label}</span>}
      <input
        className={clsx(
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none",
          error && "border-red-400 focus:border-red-500",
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}
