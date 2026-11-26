"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/merchant/logout", { method: "POST" });
    // Inside a partner's frame, signing out lands on a signed-out screen in the frame. The normal WGC
    // sign-in page is not for these people: they open WGC again from the partner's own screen.
    router.push(embedded ? "/partner-embed/ended?signedOut=1" : "/merchant/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Log out
    </button>
  );
}
