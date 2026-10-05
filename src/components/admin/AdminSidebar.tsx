"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, FileText, Users, UserCircle, Mail, LifeBuoy, Building, CreditCard, RefreshCw, UserCheck, Webhook, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "System Health", href: "/admin/system-health", icon: Activity },
  { name: "Merchants", href: "/admin/merchants", icon: Building },
  { name: "Merchant Applications", href: "/admin/merchant-applications", icon: UserCheck },
  { name: "Billing & Subscriptions", href: "/admin/billing", icon: CreditCard },
  { name: "Aplos Sync", href: "/admin/aplos", icon: RefreshCw },
  { name: "Support Tickets", href: "/admin/support/tickets", icon: LifeBuoy },
  { name: "First Look Leads", href: "/admin/first-look-leads", icon: Inbox },
  { name: "Inquiries", href: "/admin/inquiries", icon: Inbox },
  { name: "501(c)(3) Documents", href: "/admin/documents", icon: FileText },
  { name: "Email Logs", href: "/admin/email-logs", icon: Mail },
  { name: "Finix Webhook Events", href: "/admin/finix-webhook-events", icon: Webhook },
  { name: "My Profile", href: "/admin/profile", icon: UserCircle },
];

const SUPER_ADMIN_NAV_ITEMS = [{ name: "Admin Users", href: "/admin/settings/admins", icon: Users }];

export default function AdminSidebar({ role }: { role: "wgc_super_admin" | "wgc_admin" }) {
  const pathname = usePathname();
  const items =
    role === "wgc_super_admin"
      ? [...NAV_ITEMS.slice(0, 6), ...SUPER_ADMIN_NAV_ITEMS, ...NAV_ITEMS.slice(6)]
      : NAV_ITEMS;

  return (
    <>
      <aside className="shrink-0 w-64 bg-white border-r border-slate-100 min-h-screen py-8 px-3 hidden md:block">
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 py-2.5 pl-[14px] pr-4 rounded-xl text-sm font-semibold transition-colors border-l-2",
                  isActive
                    ? "bg-slate-100 text-wgc-navy-950 border-wgc-gold-500"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Below md, the sidebar above is hidden — this horizontal bar is
          the only way to reach non-Dashboard admin pages on mobile. */}
      <nav className="md:hidden flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border-b-2",
                isActive ? "bg-slate-100 text-wgc-navy-950 border-wgc-gold-500" : "text-slate-600 hover:bg-slate-50 border-transparent"
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
