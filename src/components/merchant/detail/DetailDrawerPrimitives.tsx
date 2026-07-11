import { ReactNode } from "react";

export function Section({
  title,
  action,
  last,
  children,
}: {
  title: string;
  action?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`px-5 py-4 ${last ? "" : "border-b border-slate-100"}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700 text-right">{value}</span>
    </div>
  );
}
