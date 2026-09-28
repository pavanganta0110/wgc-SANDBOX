"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatCents } from "@/lib/format";

interface WallGift {
  id: string;
  amountCents: number;
  donorName: string;
  message: string | null;
  createdAt: string;
}

interface WallFeed {
  name: string;
  organizationName: string;
  logoUrl: string | null;
  imageUrl: string | null;
  goalAmountCents: number | null;
  raisedCents: number;
  donorCount: number;
  recentGifts: WallGift[];
}

const POLL_INTERVAL_MS = 6000;

export default function LiveDonationWall({
  slug,
  initial,
  previewMessage,
}: {
  slug: string;
  initial: WallFeed;
  /** Shown only to the owning church's own logged-in staff, previewing the wall before the campaign is published — see loadPublicCampaignData.ts's isPreview. */
  previewMessage?: string;
}) {
  const [feed, setFeed] = useState<WallFeed>(initial);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [flashGiftId, setFlashGiftId] = useState<string | null>(null);

  useEffect(() => {
    const donateUrl = typeof window !== "undefined" ? `${window.location.origin}/c/${slug}` : "";
    if (donateUrl) {
      QRCode.toDataURL(donateUrl, { width: 220, margin: 1 }).then(setQrDataUrl).catch(() => {});
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/public/campaigns/${slug}/feed`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: WallFeed = await res.json();
        setFeed((prev) => {
          const newestId = data.recentGifts[0]?.id;
          if (newestId && newestId !== prev.recentGifts[0]?.id) {
            setFlashGiftId(newestId);
            // Respect prefers-reduced-motion — the flash still updates the
            // number/list, just skips the animated highlight class.
            setTimeout(() => setFlashGiftId(null), 2500);
          }
          return data;
        });
      } catch {
        // Silent — next poll will retry. A live wall shouldn't error out
        // over a single dropped request.
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug]);

  const percent = feed.goalAmountCents ? Math.min(100, Math.round((feed.raisedCents / feed.goalAmountCents) * 100)) : null;

  return (
    <div className="min-h-screen bg-wgc-navy-950 text-white flex flex-col p-6 sm:p-10 lg:p-14">
      {previewMessage && (
        <div className="mb-6 rounded-xl bg-wgc-gold-500/10 border border-wgc-gold-500/30 text-wgc-gold-500 text-sm text-center py-2 px-4">
          <strong>Preview only.</strong> {previewMessage} Only your team can see this wall.
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          {feed.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={feed.logoUrl} alt={feed.organizationName} className="h-10 sm:h-14 w-auto" />
          )}
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{feed.name}</h1>
            <p className="text-sm sm:text-base text-white/50">{feed.organizationName}</p>
          </div>
        </div>
        {qrDataUrl && (
          <div className="hidden sm:flex flex-col items-center gap-2 bg-white p-3 rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Scan to give" className="w-24 h-24" />
            <span className="text-[10px] font-bold text-wgc-navy-950 uppercase tracking-widest">Scan to Give</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-8 flex-1 min-h-0">
        <div className="lg:col-span-3 flex flex-col justify-center">
          <p className="text-6xl sm:text-8xl font-black text-wgc-gold-500 tracking-tighter transition-all duration-500">
            {formatCents(feed.raisedCents)}
          </p>
          {feed.goalAmountCents != null && (
            <>
              <p className="text-lg sm:text-2xl text-white/70 mt-2">Raised of {formatCents(feed.goalAmountCents)} Goal</p>
              <div className="h-4 sm:h-6 w-full rounded-full bg-white/10 overflow-hidden mt-6">
                <div
                  className="h-full rounded-full bg-wgc-gold-500 transition-all duration-1000 ease-out"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
            </>
          )}
          <p className="text-base sm:text-xl text-white/50 mt-4">{feed.donorCount} {feed.donorCount === 1 ? "supporter" : "supporters"}</p>
        </div>

        <div className="lg:col-span-2 bg-white/5 rounded-3xl p-6 sm:p-8 flex flex-col min-h-0">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4">Recent Gifts</h2>
          <div className="space-y-3 overflow-y-auto flex-1">
            {feed.recentGifts.length === 0 && <p className="text-white/40 text-sm">Be the first to give!</p>}
            {feed.recentGifts.map((g) => (
              <div
                key={g.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-colors duration-1000 ${
                  g.id === flashGiftId ? "bg-wgc-gold-500/20" : "bg-white/0"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{g.donorName}</p>
                  {g.message && <p className="text-xs text-white/50 truncate">&quot;{g.message}&quot;</p>}
                </div>
                <p className="font-bold text-wgc-gold-500 shrink-0">{formatCents(g.amountCents)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
