"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import GatewayIcon from "@/components/ui/GatewayIcon";
import { NAV_ITEMS, NavItem } from "./Sidebar";

export default function MobileSidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isOrgLevelRole = role === "owner" || role === "admin" || role === "church_admin" || !role;
  const visibleItems = isOrgLevelRole ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.organizationOnly);

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 -ml-2 text-slate-600 hover:text-slate-900 focus:outline-none"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl flex flex-col transition-transform duration-300 ease-in-out transform",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <Link href="/merchant/dashboard" className="flex items-center gap-2.5" onClick={() => setIsOpen(false)}>
            <GatewayIcon className="h-8 w-auto shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="font-serif text-base font-bold text-wgc-navy-950">WGC</span>
              <span className="text-[9px] uppercase font-mono tracking-widest text-wgc-navy-400 mt-0.5">Payments</span>
            </div>
          </Link>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <nav className="space-y-1">
            {visibleItems.map((item, index) => {
              const Icon = item.icon;
              const showSectionHeader = index === 0 || visibleItems[index - 1].section !== item.section;
              const sectionHeader = showSectionHeader && (
                <p className="px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 first:pt-1">
                  {item.section}
                </p>
              );

              if (item.children) {
                const isGroupActive = item.children.some((child) => pathname === child.href);
                const isGroupOpen = openGroups[item.name] ?? isGroupActive;

                return (
                  <div key={item.name}>
                    {sectionHeader}
                    <button
                      onClick={() => toggleGroup(item.name)}
                      aria-expanded={isGroupOpen}
                      aria-controls={`mobile-nav-group-${item.name}`}
                      className={cn(
                        "w-full flex items-center gap-3 py-3 pl-[14px] pr-4 rounded-xl text-sm font-semibold transition-colors border-l-2",
                        isGroupActive
                          ? "bg-wgc-gold-500/10 text-wgc-navy-950 border-wgc-gold-500"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent"
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-grow text-left">{item.name}</span>
                      <ChevronDown
                        className={cn("w-4 h-4 transition-transform", isGroupOpen && "rotate-180")}
                      />
                    </button>
                    {isGroupOpen && (
                      <div id={`mobile-nav-group-${item.name}`} className="ml-4 mt-1 space-y-1 border-l border-slate-100 pl-4">
                        {item.children.map((child) => {
                          const isActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              prefetch={false}
                              className={cn(
                                "block py-2.5 rounded-lg text-sm transition-colors",
                                isActive
                                  ? "font-bold text-wgc-navy-950"
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
                <div key={item.href}>
                  {sectionHeader}
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 py-3 pl-[14px] pr-4 rounded-xl text-sm font-semibold transition-colors border-l-2",
                      isActive
                        ? "bg-wgc-gold-500/10 text-wgc-navy-950 border-wgc-gold-500"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {item.name}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
