import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared header for every Reporting page: breadcrumb (so it's clear which page you're on),
 * title, subtitle, and a right-aligned slot for the period selector and primary actions.
 */
export default function PageHeader({
  current,
  title,
  subtitle,
  actions,
  children,
}: {
  current: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500"
        >
          <Link
            href="/merchant/reporting"
            className="rounded outline-none hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Reporting
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden />
          <span aria-current="page" className="text-slate-700">
            {current}
          </span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
