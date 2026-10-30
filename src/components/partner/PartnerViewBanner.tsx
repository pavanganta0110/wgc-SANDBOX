"use client";

/** Shown at the top of the partner dashboard while a WGC admin is looking at it. */
export default function PartnerViewBanner({ partnerName }: { partnerName: string }) {
  async function exit() {
    await fetch("/api/partner/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/partners");
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-600 px-4 md:px-10 py-2.5 text-sm text-white">
      <p>
        <span className="font-semibold">Viewing {partnerName}'s dashboard as a WGC admin.</span> This is read-only: keys, webhook, menu, card and team cannot be changed here.
      </p>
      <button type="button" onClick={exit} className="rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 font-semibold">
        Exit view
      </button>
    </div>
  );
}
