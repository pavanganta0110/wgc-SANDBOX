"use client";

import Link from "next/link";
import { usePaymentWording } from "@/components/merchant/PaymentModeContext";

export default function GivingLinksTabs({ active }: { active: "links" | "attempts" }) {
  const pw = usePaymentWording();
  const tabs = [
    { key: "links", label: pw("Giving Links"), href: "/merchant/giving-links" },
    { key: "attempts", label: pw("Donation Attempts"), href: "/merchant/giving-links?tab=attempts" },
  ] as const;

  return (
    <div className="flex items-center gap-1 border-b border-slate-100 mb-4">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            active === t.key
              ? "border-blue-600 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
