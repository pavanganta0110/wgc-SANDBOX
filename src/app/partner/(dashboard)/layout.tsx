import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Building2, CreditCard, KeyRound, Users, Webhook } from "lucide-react";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { partnerKeyEnvironment } from "@/lib/partners/partnerApiKeys";
import PartnerSignOutButton from "@/components/partner/PartnerSignOutButton";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { name: "Organizations", href: "/partner/organizations", icon: Building2 },
  { name: "API Key", href: "/partner/api-keys", icon: KeyRound },
  { name: "Webhook", href: "/partner/webhook", icon: Webhook },
  { name: "Billing", href: "/partner/billing", icon: CreditCard },
  { name: "Team", href: "/partner/team", icon: Users },
  { name: "Docs", href: "/partner/docs", icon: BookOpen },
];

export default async function PartnerDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getPartnerSession();
  if (!session) redirect("/partner/login");
  const live = partnerKeyEnvironment() === "live";

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <div className="flex items-center justify-between px-4 md:px-10 py-5 border-b border-slate-100 bg-white">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{session.partnerName}</h1>
          <p className="text-[11px] text-slate-500">Partner dashboard · WGC Payments</p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-3 py-1 ${live ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            title={live ? "Production: real payments" : "Sandbox: test data only"}
          >
            {live ? "Production" : "Sandbox"}
          </span>
          <span className="text-sm text-slate-600 hidden md:inline">{session.email}</span>
          <PartnerSignOutButton />
        </div>
      </div>
      {/* The side menu below is hidden on narrow screens; this strip takes its place. */}
      <nav aria-label="Partner menu" className="md:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-white border-b border-slate-100">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex shrink-0 items-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Icon className="w-4 h-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="flex-grow flex">
        <aside className="shrink-0 w-56 bg-white border-r border-slate-100 py-6 px-3 hidden md:block">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-grow min-w-0 p-4 md:p-10">{children}</main>
      </div>
    </div>
  );
}
