"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicAuctionState } from "@/lib/auctions/publicState";
import { apiMessage, dollarsToCents, formatMoney, timeLeft } from "@/lib/auctions/clientFormat";

type Item = PublicAuctionState["items"][number];

/**
 * The public auction page. `embedded` is when it sits in a frame on an organization's own website (it reports its
 * height so the frame fits, with no scrollbar). `previewState` is the organizer's read-only preview: it shows exactly
 * what visitors see, from a snapshot, and never registers or bids.
 */
export default function AuctionClient({ slug, embedded = false, previewState = null }: { slug: string; embedded?: boolean; previewState?: PublicAuctionState | null }) {
  const [state, setState] = useState<PublicAuctionState | null>(previewState);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0); // server clock minus ours, so countdowns agree with the server

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${slug}/state`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as PublicAuctionState;
      setOffset(new Date(body.serverNow).getTime() - Date.now());
      setState(body);
    } catch {
      // keep showing the last good state
    }
  }, [slug]);

  useEffect(() => {
    if (previewState) return; // a preview is a snapshot: no polling
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load, previewState]);

  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // In a website frame, tell the page the height we need so its frame fits with no scrollbar.
    const el = rootRef.current;
    if (!embedded || !el || window.parent === window) return;
    let last = 0;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0 && height !== last) {
        last = height;
        window.parent.postMessage({ source: "wgc-auction", type: "WGC_AUCTION_HEIGHT", slug, height }, "*");
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embedded, slug, state]);

  if (!state) return <main className="min-h-screen flex items-center justify-center text-slate-500">Loading auction…</main>;
  const { auction, items, me } = state;
  const serverNow = now + offset;
  const open = auction.status === "OPEN" && serverNow >= new Date(auction.startsAt).getTime();

  return (
    <main ref={rootRef} className={`${embedded ? "" : "min-h-screen "}bg-slate-50`}>
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {auction.coverImageUrl && <img src={auction.coverImageUrl} alt="" className="w-full max-h-64 object-cover rounded-xl mb-4" />}
          <h1 className="text-2xl font-bold text-slate-900">{auction.title}</h1>
          {auction.description && <p className="mt-2 text-slate-600 whitespace-pre-line">{auction.description}</p>}
          <p className="mt-3 text-sm text-slate-500">
            {auction.status === "SETTLED" ? "This auction has ended." : serverNow < new Date(auction.startsAt).getTime() ? `Bidding opens ${new Date(auction.startsAt).toLocaleString()}` : `Bidding closes ${new Date(auction.endsAt).toLocaleString()}`}
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {auction.status !== "SETTLED" && <BidderPanel slug={slug} auction={auction} me={me} onChange={load} preview={Boolean(previewState)} />}
        <section className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <ItemCard key={item.id} slug={slug} item={item} now={serverNow} canBid={open && me?.status === "APPROVED"} onBid={load} />
          ))}
        </section>
        {items.length === 0 && <p className="text-center text-slate-500">No items yet.</p>}
      </div>
    </main>
  );
}

function BidderPanel({ slug, auction, me, onChange, preview }: { slug: string; auction: PublicAuctionState["auction"]; me: PublicAuctionState["me"]; onChange: () => Promise<void>; preview: boolean }) {
  const [step, setStep] = useState<"form" | "code">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    if (preview) { setMessage("This is a preview. Registration is turned off here."); return null; }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/auctions/${slug}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(apiMessage(json, "Something went wrong.")); return null; }
      return json;
    } finally { setBusy(false); }
  }

  if (me?.status === "APPROVED") {
    return <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900">You&apos;re signed in as <strong>{me.name}</strong>. Your bidder number is <strong>{me.bidderNumber}</strong>.</div>;
  }
  if (me?.status === "PENDING") {
    return <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900">Thanks, {me.name}. Your registration is waiting for approval. We&apos;ll email you as soon as you can bid.</div>;
  }
  if (me?.status === "DECLINED" || me?.status === "BLOCKED") {
    return <div className="rounded-xl bg-slate-100 border border-slate-200 p-4 text-slate-700">Your registration isn&apos;t approved for this auction. Reply to any email from the organization if you think that&apos;s a mistake.</div>;
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900">{step === "form" ? "Register to bid" : "Enter your code"}</h2>
      <p className="text-sm text-slate-500 mt-1">
        {step === "form"
          ? auction.registrationMode === "APPROVAL" ? "Register with your email. After you confirm it, the organizers will approve you." : "Register with your email. You can bid as soon as you confirm it."
          : `We sent a 6-digit code to ${email}.`}
        {" "}Already registered? Use the same email to sign back in.
      </p>
      {step === "form" ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); if (await post("register", { name, email, phone })) setStep("code"); }}>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={busy} className="sm:col-span-3 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Send me a code"}</button>
        </form>
      ) : (
        <form className="mt-4 flex gap-3" onSubmit={async (e) => { e.preventDefault(); if (await post("verify", { email, code })) await onChange(); }}>
          <input required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-40 rounded-lg border border-slate-300 px-3 py-2 tracking-widest" />
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Checking…" : "Confirm"}</button>
          <button type="button" onClick={() => setStep("form")} className="text-sm text-slate-500 underline">Back</button>
        </form>
      )}
      {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
    </div>
  );
}

function ItemCard({ slug, item, now, canBid, onBid }: { slug: string; item: Item; now: number; canBid: boolean; onBid: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const closed = item.status !== "OPEN" || new Date(item.endsAt).getTime() <= now;

  async function submit(cents: number | null) {
    if (cents == null) { setMessage({ ok: false, text: "Enter an amount like 125 or 125.50." }); return; }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/auctions/${slug}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, amountCents: cents }) });
      const json = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: `You bid ${formatMoney(cents)}. You're the high bidder!` } : { ok: false, text: apiMessage(json, "Your bid wasn't accepted.") });
      if (res.ok) setAmount("");
      await onBid();
    } finally { setBusy(false); }
  }

  return (
    <article className={`rounded-xl bg-white border p-4 ${item.youAreHighBidder ? "border-emerald-400 ring-1 ring-emerald-300" : "border-slate-200"}`}>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-44 object-cover rounded-lg mb-3" />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">Item {item.itemNumber}</p>
          <h3 className="font-semibold text-slate-900">{item.title}</h3>
        </div>
        <span className="text-sm font-medium text-slate-600 whitespace-nowrap">{item.status === "SOLD" ? "Sold" : item.status === "UNSOLD" ? "No bids" : timeLeft(item.endsAt, now)}</span>
      </div>
      {item.description && <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{item.description}</p>}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-500">{item.currentBidCents == null ? "Starting bid" : item.status === "SOLD" ? "Final bid" : "Current bid"}</p>
          <p className="text-2xl font-bold text-slate-900">{formatMoney(item.currentBidCents ?? item.startingBidCents)}</p>
        </div>
        <p className="text-xs text-slate-500 text-right">{item.bidCount} {item.bidCount === 1 ? "bid" : "bids"}{item.highBidderNumber ? ` · Bidder ${item.highBidderNumber}` : ""}</p>
      </div>
      {item.youAreHighBidder && !closed && <p className="mt-2 text-sm font-semibold text-emerald-700">You&apos;re the high bidder</p>}
      {item.youAreHighBidder && item.status === "SOLD" && <p className="mt-2 text-sm font-semibold text-emerald-700">You won this item. Watch your email for how to pay.</p>}

      {!closed && canBid && !item.youAreHighBidder && (
        <div className="mt-3 flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`${formatMoney(item.minimumNextBidCents)} or more`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={busy} onClick={() => void submit(dollarsToCents(amount))} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60">Bid</button>
          <button disabled={busy} onClick={() => void submit(item.minimumNextBidCents)} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-60">Bid {formatMoney(item.minimumNextBidCents)}</button>
        </div>
      )}
      {!closed && !canBid && <p className="mt-3 text-sm text-slate-500">Register above to bid.</p>}
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
    </article>
  );
}
