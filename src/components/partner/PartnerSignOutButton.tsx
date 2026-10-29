"use client";

export default function PartnerSignOutButton() {
  async function signOut() {
    await fetch("/api/partner/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/partner/login");
  }
  return (
    <button type="button" onClick={signOut} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
      Sign out
    </button>
  );
}
