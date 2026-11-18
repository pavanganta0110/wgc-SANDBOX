"use client";

import { useEffect, useState } from "react";
import type { PublicAuctionState } from "@/lib/auctions/publicState";
import { formatMoney, timeLeft } from "@/lib/auctions/clientFormat";
import QrImage from "@/lib/auctions/QrImage";

const WHITE = { color: "#ffffff" } as const; // the site's heading style would otherwise turn these dark

export default function WallClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PublicAuctionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    // The address people scan: this auction's public page, on whatever address this screen was opened from.
    const t = setTimeout(() => setJoinUrl(`${window.location.origin}/auction/${slug}`), 0);
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/auctions/${slug}/state`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const body = (await res.json()) as PublicAuctionState;
        setOffset(new Date(body.serverNow).getTime() - Date.now());
        setState(body);
      } catch { /* keep the last good screen */ }
    }
    void load();
    const poll = setInterval(load, 2000);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { alive = false; clearTimeout(t); clearInterval(poll); clearInterval(tick); };
  }, [slug]);

  if (!state) return <main className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-2xl">Loading…</main>;
  const t = now + offset;
  const { auction, items, recentBids, totalRaisedCents } = state;
  const isLive = auction.format === "LIVE";
  const current = items.find((i) => i.id === auction.currentItemId && i.status === "OPEN") ?? null;
  const open = items.filter((i) => i.status === "OPEN").sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const upcoming = items.filter((i) => i.status === "UPCOMING");
  const sold = items.filter((i) => i.status === "SOLD");
  const goal = auction.goalCents;
  const finished = auction.status === "SETTLED";

  const qr = joinUrl && !finished ? (
    <div className="rounded-2xl bg-white p-3 text-center text-slate-900">
      <QrImage url={joinUrl} size={150} />
      <p className="mt-1 text-sm font-bold leading-tight">Scan to register<br />and start bidding</p>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-amber-400 font-semibold tracking-widest text-sm">{isLive ? "LIVE AUCTION" : "AUCTION"}</p>
          <h1 className="text-4xl sm:text-5xl font-bold" style={WHITE}>{auction.title}</h1>
          <div className="mt-4">
            <p className="text-slate-400 text-sm">Raised so far</p>
            <p className="text-5xl sm:text-6xl font-extrabold text-emerald-400">{formatMoney(totalRaisedCents)}</p>
            {goal ? <p className="text-slate-400">of {formatMoney(goal)} goal</p> : null}
          </div>
        </div>
        {qr}
      </div>
      {goal ? <div className="mt-4 h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (totalRaisedCents / goal) * 100)}%` }} /></div> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          {isLive ? (
            current ? (
              <div className="rounded-3xl border-2 border-emerald-500 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold tracking-widest">ON THE BLOCK · ITEM {current.itemNumber}</span>
                  <span className="text-5xl font-extrabold text-amber-300 tabular-nums">{timeLeft(current.endsAt, t)}</span>
                </div>
                <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_1fr]">
                  {current.imageUrl && <img src={current.imageUrl} alt="" className="w-full max-h-80 rounded-2xl object-cover" />}
                  <div>
                    <h2 className="text-4xl font-bold" style={WHITE}>{current.title}</h2>
                    {(current.donatedBy || current.category) && <p className="mt-1 text-slate-400">{[current.category, current.donatedBy && `Donated by ${current.donatedBy}`].filter(Boolean).join(" · ")}</p>}
                    {current.description && <p className="mt-3 text-slate-300 text-lg whitespace-pre-line">{current.description}</p>}
                  </div>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-slate-400">{current.currentBidCents == null ? "Starting bid" : "Current bid"}</p>
                    <p className="text-7xl sm:text-8xl font-extrabold">{formatMoney(current.currentBidCents ?? current.startingBidCents)}</p>
                  </div>
                  <p className="text-2xl text-slate-300 text-right">{current.highBidderNumber ? <>Bidder <strong className="text-white">{current.highBidderNumber}</strong><br /></> : null}{current.bidCount} {current.bidCount === 1 ? "bid" : "bids"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center">
                <p className="text-4xl font-bold" style={WHITE}>{finished ? "The auction has ended. Thank you!" : upcoming.length > 0 ? "Next up…" : "That was the last item. Thank you!"}</p>
                {!finished && upcoming[0] && <p className="mt-3 text-3xl text-slate-300">Item {upcoming[0].itemNumber}: {upcoming[0].title}</p>}
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {open.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
                  <div className="flex justify-between text-slate-400"><span>Item {item.itemNumber}</span><span className="text-amber-300 font-semibold">{timeLeft(item.endsAt, t)}</span></div>
                  <h2 className="mt-1 text-2xl font-semibold" style={WHITE}>{item.title}</h2>
                  <p className="mt-3 text-5xl font-extrabold">{formatMoney(item.currentBidCents ?? item.startingBidCents)}</p>
                  <p className="mt-1 text-slate-400">{item.highBidderNumber ? `Bidder ${item.highBidderNumber} · ` : ""}{item.bidCount} {item.bidCount === 1 ? "bid" : "bids"}</p>
                </div>
              ))}
              {open.length === 0 && <p className="col-span-full text-3xl text-slate-400">{finished ? "The auction has ended. Thank you!" : "Waiting for the next item…"}</p>}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {isLive && upcoming.length > 0 && (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-slate-400 font-semibold mb-3">Coming up</h3>
              <ul className="space-y-2 text-lg">{upcoming.slice(0, 4).map((i) => <li key={i.id} className="flex justify-between gap-3"><span>#{i.itemNumber} {i.title}</span><span className="text-slate-400">{formatMoney(i.startingBidCents)}</span></li>)}</ul>
            </div>
          )}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <h3 className="text-slate-400 font-semibold mb-3">Latest bids</h3>
            <ul className="space-y-2">
              {recentBids.slice(0, 8).map((b, i) => (
                <li key={i} className="flex justify-between text-lg"><span>Item {b.itemNumber}{b.bidderNumber ? ` · Bidder ${b.bidderNumber}` : ""}</span><span className="font-semibold text-emerald-300">{formatMoney(b.amountCents)}</span></li>
              ))}
              {recentBids.length === 0 && <li className="text-slate-500">No bids yet.</li>}
            </ul>
          </div>
          {sold.length > 0 && (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="text-slate-400 font-semibold mb-3">Sold</h3>
              <ul className="space-y-1 text-slate-300">{sold.slice(-6).map((i) => <li key={i.id} className="flex justify-between gap-3"><span>#{i.itemNumber} {i.title}</span><span>{formatMoney(i.currentBidCents)}</span></li>)}</ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
