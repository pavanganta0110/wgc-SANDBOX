"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  ArrowLeftRight,
  ShieldAlert,
  Landmark,
  PiggyBank,
  Users,
  HeartHandshake,
  Repeat,
  RefreshCw,
  CreditCard,
  Settings,
  LifeBuoy,
  Building2,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  children?: { name: string; href: string }[];
  /** Sections that are organization-level only — hidden for FUNDRAISER/VIEWER,
   * matching the API-level access policy (they're denied server-side either way;
   * this just keeps the nav from showing a link that always 404s/401s for them). */
  organizationOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Home", href: "/merchant/dashboard", icon: LayoutDashboard },
  { name: "Insights", href: "/merchant/insights", icon: LineChart },
  {
    name: "Transactions",
    href: "/merchant/transactions",
    icon: ArrowLeftRight,
    children: [
      { name: "Payments", href: "/merchant/transactions/payments" },
      { name: "Authorizations", href: "/merchant/transactions/authorizations" },
      { name: "Refunds", href: "/merchant/transactions/refunds" },
      { name: "Bank Returns", href: "/merchant/transactions/bank-returns" },
    ],
  },
  { name: "Disputes", href: "/merchant/disputes", icon: ShieldAlert, organizationOnly: true },
  { name: "Settlements", href: "/merchant/settlements", icon: Landmark, organizationOnly: true },
  { name: "Deposits", href: "/merchant/deposits", icon: PiggyBank, organizationOnly: true },
  { name: "Donors", href: "/merchant/donors", icon: Users },
  { name: "Giving Links", href: "/merchant/giving-links", icon: HeartHandshake },
  { name: "Recurring Donors", href: "/merchant/recurring-donors", icon: Repeat },
  { name: "Subscriptions", href: "/merchant/subscriptions", icon: RefreshCw },
  { name: "Billing Plan", href: "/merchant/subscription", icon: CreditCard, organizationOnly: true },
  { name: "Compliance", href: "/merchant/compliance", icon: ShieldCheck, organizationOnly: true },
  { name: "Settings", href: "/merchant/settings", icon: Settings, organizationOnly: true },
  { name: "Support", href: "/merchant/support", icon: LifeBuoy },
  { name: "Company", href: "/merchant/organization", icon: Building2, organizationOnly: true },
];

const STORAGE_KEY = "wgc_merchant_sidebar_collapsed";

export default function Sidebar({ role }: { role?: string } = {}) {
  const pathname = usePathname();
  // Role navigation: FUNDRAISER/VIEWER get only their own links,
  // transactions, donors, and recurring gifts — organization-level
  // sections (settlements, deposits, disputes, billing, compliance,
  // settings, company) are hidden rather than shown-but-denied.
  const isOrgLevelRole = role === "owner" || role === "admin" || role === "church_admin" || !role;
  const visibleItems = isOrgLevelRole ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.organizationOnly);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    const activeGroup = visibleItems.find((item) =>
      item.children?.some((child) => pathname === child.href)
    );
    if (activeGroup) {
      setOpenGroups((prev) => ({ ...prev, [activeGroup.name]: true }));
    }
  }, [pathname]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <aside
      className={cn(
        "shrink-0 bg-white border-r border-slate-100 min-h-screen py-8 px-3 hidden md:block transition-all",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("flex mb-4 px-1", collapsed ? "justify-center" : "justify-end")}>
        <button
          onClick={toggle}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const isGroupActive = item.children.some((child) => pathname === child.href);
            const isOpen = collapsed ? false : (openGroups[item.name] ?? isGroupActive);

            return (
              <div key={item.name}>
                <button
                  onClick={() => toggleGroup(item.name)}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                    collapsed ? "justify-center px-2" : "px-4",
                    isGroupActive
                      ? "text-[#010409]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-grow text-left">{item.name}</span>
                      <ChevronDown
                        className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-slate-100 pl-4">
                    {item.children.map((child) => {
                      const isActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block py-2 rounded-lg text-sm transition-colors",
                            isActive
                              ? "font-bold text-[#010409]"
                              : "text-slate-500 hover:text-slate-900"
                          )}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                "flex items-center gap-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                collapsed ? "justify-center px-2" : "px-4",
                isActive
                  ? "bg-[#eab308]/10 text-[#010409]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
