import { clsx } from "clsx";
import type {
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

export function Table({
  children,
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
      {children}
    </thead>
  );
}

export function Th({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx("px-4 py-3 text-left font-semibold", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-200">{children}</tbody>;
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={clsx("hover:bg-slate-50", className)}>{children}</tr>;
}

export function Td({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableDataCellElement>) {
  return (
    <td className={clsx("px-4 py-3 text-slate-700", className)} {...props}>
      {children}
    </td>
  );
}
