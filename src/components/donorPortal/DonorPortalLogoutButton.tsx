"use client";

import { useRouter } from "next/navigation";

export default function DonorPortalLogoutButton({ slug }: { slug: string }) {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/donor-portal/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    router.refresh();
  };
  return (
    <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
      Sign out
    </button>
  );
}
