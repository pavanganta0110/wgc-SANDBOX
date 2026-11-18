"use client";

import { useEffect, useState } from "react";
import type { PublicAuctionState } from "@/lib/auctions/publicState";
import { formatMoney, timeLeft } from "@/lib/auctions/clientFormat";

export default function WallClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PublicAuctionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
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
    const poll = setInterval(load, 2500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [slug]);

  if (!state) return <main className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-2xl">Loading…</main>;
  const t = now + offset;
  const { auction, items, recentBids, totalRaisedCents } = state;
  const live = items.filter((i) => i.status === "OPEN").sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const done = items.filter((i) => i.status !== "OPEN");
  const goal = auction.goalCents;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-amber-400 font-semibold tracking-widest text-sm">LIVE AUCTION</p>
          <h1 className="text-5xl font-bold" style={{ color: "#ffffff" }}>{auction.title}</h1>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-sm">Raised so far</p>
          <p className="text-6xl font-extrabold text-emerald-400">{formatMoney(totalRaisedCents)}</p>
          {goal ? <p className="text-slate-400">of {formatMoney(goal)} goal</p> : null}
        </div>
      </div>
      {goal ? <div className="mt-4 h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (totalRaisedCents / goal) * 100)}%` }} /></div> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="grid gap-4 sm:grid-cols-2">
          {live.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="flex justify-between text-slate-400"><span>Item {item.itemNumber}</span><span className="text-amber-300 font-semibold">{timeLeft(item.endsAt, t)}</span></div>
              <h2 className="mt-1 text-2xl font-semibold" style={{ color: "#ffffff" }}>{item.title}</h2>
              <p className="mt-3 text-5xl font-extrabold">{formatMoney(item.currentBidCents ?? item.startingBidCents)}</p>
              <p className="mt-1 text-slate-400">{item.highBidderNumber ? `Bidder ${item.highBidderNumber} · ` : ""}{item.bidCount} {item.bidCount === 1 ? "bid" : "bids"}</p>
            </div>
          ))}
          {live.length === 0 && <p className="col-span-full text-3xl text-slate-400">{auction.status === "SETTLED" ? "The auction has ended. Thank you!" : "Waiting for the next item…"}</p>}
        </section>
        <aside className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
          <h3 className="text-slate-400 font-semibold mb-3">Latest bids</h3>
          <ul className="space-y-2">
            {recentBids.slice(0, 10).map((b, i) => (
              <li key={i} className="flex justify-between text-lg"><span>Item {b.itemNumber}{b.bidderNumber ? ` · Bidder ${b.bidderNumber}` : ""}</span><span className="font-semibold text-emerald-300">{formatMoney(b.amountCents)}</span></li>
            ))}
          </ul>
          {done.length > 0 && <h3 className="text-slate-400 font-semibold mt-6 mb-3">Sold</h3>}
          <ul className="space-y-1 text-slate-300">
            {done.filter((i) => i.status === "SOLD").slice(-6).map((i) => <li key={i.id} className="flex justify-between"><span>Item {i.itemNumber} · {i.title}</span><span>{formatMoney(i.currentBidCents)}</span></li>)}
          </ul>
        </aside>
      </div>
    </main>
  );
}
