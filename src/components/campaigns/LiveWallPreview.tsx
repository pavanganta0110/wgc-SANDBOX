"use client";

import { formatCents } from "@/lib/format";

/**
 * Live, in-context preview of the public donation wall (LiveDonationWall.tsx)
 * for the campaign builder — same idea as CampaignPagePreview, but mirroring
 * the wall's dark visual language instead of the page's light one. No
 * polling, no QR code (there's no real slug/URL yet for an unsaved
 * campaign), and no recent-gifts data (none can exist yet either).
 */
export default function LiveWallPreview({
  churchName,
  churchLogoUrl,
  name,
  goalAmountCents,
}: {
  churchName: string;
  churchLogoUrl?: string | null;
  name: string;
  goalAmountCents: number | null;
}) {
  return (
    <div className="rounded-2xl bg-wgc-navy-950 text-white overflow-hidden p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {churchLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={churchLogoUrl} alt="" className="h-8 sm:h-10 w-auto" />
          )}
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">{name || "Your Campaign Name"}</h1>
            <p className="text-xs sm:text-sm text-white/50">{churchName}</p>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-center gap-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2">
          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">QR code</span>
          <span className="text-[9px] text-white/30 text-center max-w-[80px]">Appears once published</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-5 gap-6">
        <div className="sm:col-span-3 flex flex-col justify-center">
          <p className="text-4xl sm:text-6xl font-black text-wgc-gold-500 tracking-tighter">{formatCents(0)}</p>
          {goalAmountCents != null && (
            <>
              <p className="text-sm sm:text-lg text-white/70 mt-1">Raised of {formatCents(goalAmountCents)} Goal</p>
              <div className="h-3 sm:h-4 w-full rounded-full bg-white/10 overflow-hidden mt-4">
                <div className="h-full rounded-full bg-wgc-gold-500" style={{ width: "0%" }} />
              </div>
            </>
          )}
          <p className="text-sm sm:text-base text-white/50 mt-3">0 supporters</p>
        </div>

        <div className="sm:col-span-2 bg-white/5 rounded-2xl p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Recent Gifts</h2>
          <p className="text-white/40 text-sm">Be the first to give!</p>
        </div>
      </div>
    </div>
  );
}
