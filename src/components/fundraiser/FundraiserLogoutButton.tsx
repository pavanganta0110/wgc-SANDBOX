"use client";

import { useRouter } from "next/navigation";

export default function FundraiserLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/fundraiser-portal/logout", { method: "POST" });
    router.push("/fundraiser/login");
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-slate-600">
      Log Out
    </button>
  );
}
