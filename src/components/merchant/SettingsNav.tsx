"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SETTINGS_NAV } from "@/lib/settings/settingsNav";

export default function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = SETTINGS_NAV.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <>
      {/* Desktop: persistent left nav */}
      <nav className="hidden lg:block w-56 shrink-0">
        <ul className="space-y-0.5 sticky top-6">
          {SETTINGS_NAV.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm font-semibold ${
                  active?.key === item.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile/tablet: section dropdown */}
      <div className="lg:hidden mb-4">
        <select
          value={active?.href || SETTINGS_NAV[0].href}
          onChange={(e) => router.push(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none bg-white"
        >
          {SETTINGS_NAV.map((item) => (
            <option key={item.key} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
