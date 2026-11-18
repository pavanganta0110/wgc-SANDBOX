"use client";

import { useCallback, useEffect, useState } from "react";
import { apiMessage, dollarsToCents, formatMoney, fromLocalInput, toLocalInput } from "@/lib/auctions/clientFormat";

interface Detail {
  auction: {
    id: string; title: string; description: string | null; status: string; format: string; startsAt: string; endsAt: string;
    registrationMode: string; paymentWindowHours: number; offerNextBidder: boolean; goalCents: number | null;
    autoExtendWindowMinutes: number; autoExtendMinutes: number; publicUrl: string; wallUrl: string;
  };
  items: { id: string; itemNumber: number; title: string; status: string; startingBidCents: number; minIncrementCents: number; fairMarketValueCents: number; currentBidCents: number | null; highBidderNumber: number | null; bidCount: number; winningBidCents: number | null }[];
  bidders: { id: string; name: string; email: string; phone: string | null; status: string; bidderNumber: number | null; verified: boolean }[];
  wins: { id: string; itemNumber: number | null; itemTitle: string; amountCents: number; status: string; bidderName: string; bidderNumber: number | null; bidderEmail: string; invoiceNumber: string | null; invoiceStatus: string | null; dueAt: string | null; wasOffered: boolean }[];
}

type Tab = "items" | "bidders" | "live" | "results" | "website" | "emails" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "items", label: "Items" }, { id: "bidders", label: "Bidders" }, { id: "live", label: "Live room" }, { id: "results", label: "Results & payments" }, { id: "website", label: "Preview & website" }, { id: "emails", label: "Emails" }, { id: "settings", label: "Settings" },
];

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const btn = "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60";
const ghost = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";

export default function AuctionManager({ auctionId, canManage }: { auctionId: string; canManage: boolean }) {
  const [data, setData] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/merchant/auctions/${auctionId}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    else setNotice({ ok: false, text: "Could not load this auction." });
  }, [auctionId]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);
  // The live room and the results change while you watch.
  useEffect(() => {
    if (tab !== "live" && tab !== "results" && tab !== "bidders") return;
    const t = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => clearInterval(t);
  }, [tab, load]);

  async function call(url: string, method: string, body?: unknown, success?: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice({ ok: false, text: apiMessage(json, "That didn't work.") }); return false; }
      if (success) setNotice({ ok: true, text: success });
      await load();
      return true;
    } finally { setBusy(false); }
  }

  if (!data) return <p className="text-sm text-slate-500">{notice?.text ?? "Loading…"}</p>;
  const { auction } = data;
  const base = `/api/merchant/auctions/${auctionId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">{auction.title}</h2>
          <p className="text-sm text-slate-500">{auction.format === "LIVE" ? "Live room auction" : "Silent online auction"} · {auction.status} · closes {new Date(auction.endsAt).toLocaleString()}</p>
          {auction.status !== "DRAFT" && (
            <p className="mt-2 text-sm">
              <a className="text-indigo-600 underline" href={auction.publicUrl} target="_blank" rel="noreferrer">Public page</a>{" · "}
              <a className="text-indigo-600 underline" href={auction.wallUrl} target="_blank" rel="noreferrer">Live wall (for the big screen)</a>{" · "}
              <button className="text-indigo-600 underline" onClick={() => { void navigator.clipboard.writeText(auction.publicUrl); setNotice({ ok: true, text: "Link copied." }); }}>Copy link</button>
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            {auction.status === "DRAFT" && <button disabled={busy} className={btn} onClick={() => void call(`${base}/publish`, "POST", {}, "Published. The link is live.")}>Publish</button>}
            {(auction.status === "OPEN" || auction.status === "SETTLED") && (
              <button
                disabled={busy}
                className={ghost}
                onClick={() => {
                  if (auction.status === "OPEN" && !confirm("End bidding on every item now and send each winner their invoice?")) return;
                  void call(`${base}/close`, "POST", {}, auction.status === "OPEN" ? "Closed. Winners are being invoiced." : "Checked for anything left to send.");
                }}
              >
                {auction.status === "OPEN" ? "End auction now" : "Re-run settlement"}
              </button>
            )}
          </div>
        )}
      </div>

      {notice && <p className={`text-sm ${notice.ok ? "text-emerald-700" : "text-red-600"}`}>{notice.text}</p>}

      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
        ))}
      </nav>

      {tab === "items" && <ItemsTab data={data} canManage={canManage} busy={busy} base={base} call={call} />}
      {tab === "bidders" && <BiddersTab data={data} canManage={canManage} busy={busy} base={base} call={call} />}
      {tab === "live" && <LiveTab data={data} canManage={canManage} busy={busy} base={base} call={call} />}
      {tab === "results" && <ResultsTab data={data} />}
      {tab === "website" && <WebsiteTab data={data} auctionId={auctionId} />}
      {tab === "emails" && <EmailsTab data={data} canManage={canManage} base={base} />}
      {tab === "settings" && <SettingsTab data={data} canManage={canManage} busy={busy} base={base} call={call} />}
    </div>
  );
}

type TabProps = { data: Detail; canManage: boolean; busy: boolean; base: string; call: (url: string, method: string, body?: unknown, success?: string) => Promise<boolean> };

function ItemsTab({ data, canManage, busy, base, call }: TabProps) {
  const [form, setForm] = useState({ title: "", description: "", imageUrl: "", start: "", raise: "5", fmv: "" });
  const [error, setError] = useState<string | null>(null);
  const finished = data.auction.status === "SETTLED";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const startingBidCents = dollarsToCents(form.start);
    const minIncrementCents = dollarsToCents(form.raise);
    const fairMarketValueCents = dollarsToCents(form.fmv || "");
    if (startingBidCents == null || minIncrementCents == null || fairMarketValueCents == null) return setError("Starting bid, minimum raise and fair market value must be dollar amounts (fair market value can be 0).");
    setError(null);
    const ok = await call(`${base}/items`, "POST", { title: form.title, description: form.description, imageUrl: form.imageUrl, startingBidCents, minIncrementCents, fairMarketValueCents }, "Item added.");
    if (ok) setForm({ title: "", description: "", imageUrl: "", start: "", raise: "5", fmv: "" });
  }

  return (
    <div className="space-y-5">
      {canManage && !finished && (
        <form onSubmit={add} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid gap-3 sm:grid-cols-6">
          <label className="sm:col-span-3 text-sm font-medium">Item title<input required className={`${field} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="sm:col-span-3 text-sm font-medium">Photo link (optional)<input className={`${field} mt-1`} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></label>
          <label className="sm:col-span-6 text-sm font-medium">Description<textarea rows={2} className={`${field} mt-1`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="sm:col-span-2 text-sm font-medium">Starting bid ($)<input required inputMode="decimal" className={`${field} mt-1`} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label className="sm:col-span-2 text-sm font-medium">Minimum raise ($)<input required inputMode="decimal" className={`${field} mt-1`} value={form.raise} onChange={(e) => setForm({ ...form, raise: e.target.value })} /></label>
          <label className="sm:col-span-2 text-sm font-medium">Fair market value ($)<input required inputMode="decimal" className={`${field} mt-1`} value={form.fmv} onChange={(e) => setForm({ ...form, fmv: e.target.value })} placeholder="What it's worth" /></label>
          {error && <p className="sm:col-span-6 text-sm text-red-600">{error}</p>}
          <div className="sm:col-span-6"><button disabled={busy} className={btn}>Add item</button> <span className="text-xs text-slate-500 ml-2">Fair market value decides how much of the winner&apos;s payment is a charitable gift on their receipt.</span></div>
        </form>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50"><tr>{["#", "Item", "Start", "Raise", "Value", "Current", "Bids", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">{i.itemNumber}</td><td className="px-3 py-2 font-medium">{i.title}</td>
                <td className="px-3 py-2">{formatMoney(i.startingBidCents)}</td><td className="px-3 py-2">{formatMoney(i.minIncrementCents)}</td><td className="px-3 py-2">{formatMoney(i.fairMarketValueCents)}</td>
                <td className="px-3 py-2">{formatMoney(i.status === "SOLD" ? i.winningBidCents : i.currentBidCents)}{i.highBidderNumber ? ` (#${i.highBidderNumber})` : ""}</td>
                <td className="px-3 py-2">{i.bidCount}</td><td className="px-3 py-2">{i.status}</td>
                <td className="px-3 py-2 text-right">{canManage && i.status === "OPEN" && <button disabled={busy} className={ghost} onClick={() => { if (confirm(i.bidCount === 0 ? "Remove this item?" : "This item has bids. Withdraw it?")) void call(`${base}/items/${i.id}`, "DELETE"); }}>{i.bidCount === 0 ? "Remove" : "Withdraw"}</button>}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No items yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BiddersTab({ data, canManage, busy, base, call }: TabProps) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const pending = data.bidders.filter((b) => b.status === "PENDING" && b.verified);
  const approved = data.bidders.filter((b) => b.status === "APPROVED").length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600"><strong>{data.bidders.length}</strong> registered · <strong>{approved}</strong> approved to bid</p>
        {data.bidders.length > 0 && <a className={ghost} href={`${base}/bidders/export`}>Download the list (CSV)</a>}
      </div>
      {pending.length > 0 && data.auction.registrationMode === "APPROVAL" && <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{pending.length} {pending.length === 1 ? "person is" : "people are"} waiting for your approval.</p>}
      {canManage && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await call(`${base}/bidders`, "POST", form, "Bidder added and approved.")) setForm({ name: "", email: "", phone: "" }); }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid gap-3 sm:grid-cols-4">
          <input required placeholder="Name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="email" placeholder="Email (their invoice goes here)" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Phone" className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <button disabled={busy} className={btn}>Add bidder at the event</button>
        </form>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50"><tr>{["Number", "Name", "Email", "Email confirmed", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.bidders.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2 font-semibold">{b.bidderNumber ?? "—"}</td><td className="px-3 py-2">{b.name}</td><td className="px-3 py-2">{b.email}</td>
                <td className="px-3 py-2">{b.verified ? "Yes" : "No"}</td><td className="px-3 py-2">{b.status}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  {canManage && b.status !== "APPROVED" && b.status !== "BLOCKED" && <button disabled={busy} className={ghost} onClick={() => void call(`${base}/bidders/${b.id}`, "POST", { action: "approve" }, "Approved. They've been emailed.")}>Approve</button>}
                  {canManage && b.status === "PENDING" && <button disabled={busy} className={ghost} onClick={() => void call(`${base}/bidders/${b.id}`, "POST", { action: "decline" }, "Declined.")}>Decline</button>}
                  {canManage && b.status !== "BLOCKED" && <button disabled={busy} className={ghost} onClick={() => { if (confirm(`Block ${b.name}? They'll be signed out and can't bid.`)) void call(`${base}/bidders/${b.id}`, "POST", { action: "block" }, "Blocked."); }}>Block</button>}
                </td>
              </tr>
            ))}
            {data.bidders.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nobody has registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveTab({ data, canManage, busy, base, call }: TabProps) {
  const open = data.items.filter((i) => i.status === "OPEN");
  const [itemId, setItemId] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const selected = open.find((i) => i.id === (itemId || open[0]?.id));
  if (data.auction.status !== "OPEN") return <p className="text-sm text-slate-500">The live room works while the auction is open. Publish it first, and it closes when you end it.</p>;
  if (!canManage) return <p className="text-sm text-slate-500">You don&apos;t have permission to enter bids.</p>;

  const minimum = selected ? (selected.currentBidCents == null ? selected.startingBidCents : selected.currentBidCents + selected.minIncrementCents) : 0;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const cents = dollarsToCents(amount);
          if (!selected || cents == null) return;
          if (await call(`${base}/room-bid`, "POST", { itemId: selected.id, bidderNumber: Number(number), amountCents: cents }, `Bid of ${formatMoney(cents)} entered for bidder ${number}.`)) { setAmount(""); setNumber(""); }
        }}
      >
        <h3 className="font-semibold">Enter the bid the auctioneer called</h3>
        <label className="block text-sm font-medium">Item
          <select className={`${field} mt-1`} value={selected?.id ?? ""} onChange={(e) => setItemId(e.target.value)}>
            {open.map((i) => <option key={i.id} value={i.id}>#{i.itemNumber} {i.title}</option>)}
          </select>
        </label>
        {selected && <p className="text-sm text-slate-600">Current bid: <strong>{formatMoney(selected.currentBidCents ?? selected.startingBidCents)}</strong>{selected.highBidderNumber ? ` (bidder ${selected.highBidderNumber})` : " (no bids yet)"} · next bid at least <strong>{formatMoney(minimum)}</strong></p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Bidder number<input required inputMode="numeric" className={`${field} mt-1`} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
          <label className="text-sm font-medium">Amount ($)<input required inputMode="decimal" className={`${field} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(minimum / 100)} /></label>
        </div>
        <button disabled={busy || !selected} className={btn}>Enter bid</button>
        <p className="text-xs text-slate-500">Online bidders can still bid from their phones. The highest bid wins wherever it came from.</p>
      </form>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-semibold mb-3">Open items</h3>
        <ul className="space-y-2 text-sm">
          {open.map((i) => <li key={i.id} className="flex justify-between"><span>#{i.itemNumber} {i.title}</span><span className="font-semibold">{formatMoney(i.currentBidCents ?? i.startingBidCents)}{i.highBidderNumber ? ` · #${i.highBidderNumber}` : ""}</span></li>)}
          {open.length === 0 && <li className="text-slate-500">Nothing open.</li>}
        </ul>
        <p className="mt-4 text-sm"><a className="text-indigo-600 underline" href={data.auction.wallUrl} target="_blank" rel="noreferrer">Open the live wall</a> on the big screen.</p>
      </div>
    </div>
  );
}

function ResultsTab({ data }: { data: Detail }) {
  const raised = data.wins.filter((w) => w.status === "PAID").reduce((s, w) => s + w.amountCents, 0);
  const owed = data.wins.filter((w) => w.status === "PENDING_PAYMENT").reduce((s, w) => s + w.amountCents, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Paid" value={formatMoney(raised)} /><Stat label="Waiting on payment" value={formatMoney(owed)} /><Stat label="Items sold" value={`${data.wins.length} of ${data.items.length}`} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50"><tr>{["Item", "Winner", "Amount", "Payment", "Invoice", "Due"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.wins.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2">#{w.itemNumber} {w.itemTitle}</td>
                <td className="px-3 py-2">{w.bidderName}{w.bidderNumber ? ` (#${w.bidderNumber})` : ""}<div className="text-xs text-slate-500">{w.bidderEmail}</div></td>
                <td className="px-3 py-2">{formatMoney(w.amountCents)}</td>
                <td className="px-3 py-2">{w.status === "PAID" ? "Paid" : w.status === "FORFEITED" ? "Not paid (no one next in line)" : "Waiting"}{w.wasOffered ? " · offered to next bidder" : ""}</td>
                <td className="px-3 py-2">{w.invoiceNumber ?? "—"}{w.invoiceStatus ? ` (${w.invoiceStatus})` : ""}</td>
                <td className="px-3 py-2">{w.dueAt ? new Date(w.dueAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {data.wins.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No winners yet. They appear when items close.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Winners are emailed a pay link automatically and reminded until they pay. An unpaid win moves to the next-highest bidder after the deadline when that&apos;s turned on in Settings.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>;
}

function SettingsTab({ data, canManage, busy, base, call }: TabProps) {
  const a = data.auction;
  const [f, setF] = useState({
    title: a.title, description: a.description ?? "", startsAt: toLocalInput(a.startsAt), endsAt: toLocalInput(a.endsAt), registrationMode: a.registrationMode,
    paymentWindowHours: String(a.paymentWindowHours), offerNextBidder: a.offerNextBidder, goal: a.goalCents ? String(a.goalCents / 100) : "",
    autoExtendWindowMinutes: String(a.autoExtendWindowMinutes), autoExtendMinutes: String(a.autoExtendMinutes),
  });
  const locked = a.status !== "DRAFT";
  return (
    <form
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid gap-4 sm:grid-cols-2 max-w-3xl"
      onSubmit={async (e) => {
        e.preventDefault();
        await call(base, "PATCH", {
          title: f.title, description: f.description, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), registrationMode: f.registrationMode, format: a.format,
          paymentWindowHours: Number(f.paymentWindowHours), offerNextBidder: f.offerNextBidder, goalCents: f.goal ? dollarsToCents(f.goal) : null,
          autoExtendWindowMinutes: Number(f.autoExtendWindowMinutes), autoExtendMinutes: Number(f.autoExtendMinutes),
        }, "Saved.");
      }}
    >
      <label className="sm:col-span-2 text-sm font-medium">Title<input disabled={locked} className={`${field} mt-1`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className="sm:col-span-2 text-sm font-medium">Description<textarea rows={3} className={`${field} mt-1`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="text-sm font-medium">Bidding opens<input disabled={locked} type="datetime-local" className={`${field} mt-1`} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
      <label className="text-sm font-medium">Bidding closes<input type="datetime-local" className={`${field} mt-1`} value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />{locked && <span className="text-xs text-slate-500">Once public, it can only move later.</span>}</label>
      <label className="text-sm font-medium">Who can bid
        <select className={`${field} mt-1`} value={f.registrationMode} onChange={(e) => setF({ ...f, registrationMode: e.target.value })}><option value="OPEN">Anyone who confirms their email</option><option value="APPROVAL">Only bidders I approve</option></select>
      </label>
      <label className="text-sm font-medium">Goal ($, optional)<input className={`${field} mt-1`} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} /></label>
      <label className="text-sm font-medium">Winners have (hours) to pay<input className={`${field} mt-1`} inputMode="numeric" value={f.paymentWindowHours} onChange={(e) => setF({ ...f, paymentWindowHours: e.target.value })} /></label>
      <label className="text-sm font-medium flex items-center gap-2 mt-6"><input type="checkbox" checked={f.offerNextBidder} onChange={(e) => setF({ ...f, offerNextBidder: e.target.checked })} />Offer the item to the next bidder if the winner doesn&apos;t pay</label>
      <label className="text-sm font-medium">Auto-extend: last (minutes)<input disabled={locked} className={`${field} mt-1`} inputMode="numeric" value={f.autoExtendWindowMinutes} onChange={(e) => setF({ ...f, autoExtendWindowMinutes: e.target.value })} /></label>
      <label className="text-sm font-medium">Auto-extend: add (minutes)<input disabled={locked} className={`${field} mt-1`} inputMode="numeric" value={f.autoExtendMinutes} onChange={(e) => setF({ ...f, autoExtendMinutes: e.target.value })} /></label>
      <p className="sm:col-span-2 text-xs text-slate-500">A bid in the last few minutes pushes that item&apos;s closing time out, so nobody wins by bidding in the last second. Set 0 to turn it off.</p>
      {canManage && a.status !== "SETTLED" && <div className="sm:col-span-2"><button disabled={busy} className={btn}>Save settings</button></div>}
    </form>
  );
}

function WebsiteTab({ data, auctionId }: { data: Detail; auctionId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const a = data.auction;
  const slug = new URL(a.publicUrl).pathname.split("/").pop() ?? "";
  const origin = new URL(a.publicUrl).origin;
  const script = `<div data-wgc-auction data-wgc-slug="${slug}"></div>\n<script async src="${origin}/embed/wgc-auction.js"></script>`;
  const iframe = `<iframe src="${origin}/embed/auction/${slug}" title="Auction" style="width:100%;height:900px;border:0" loading="lazy"></iframe>`;
  const public_ = a.status !== "DRAFT";

  function copy(label: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 2000); });
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">Live preview</h3>
        <p className="text-sm text-slate-500 mb-3">This is what visitors see, drawn from the auction as it is right now{a.status === "DRAFT" ? " (it is still a draft, so only you can see it)" : ""}. Change items or settings, then reopen this tab. Registering and bidding are turned off in the preview.</p>
        <iframe key={a.status + data.items.length} src={`/merchant/auction-preview/${auctionId}`} title="Auction preview" className="w-full rounded-xl border border-slate-200 bg-white" style={{ height: 720 }} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="font-semibold">Put the auction on your own website</h3>
        <p className="text-sm text-slate-500">People can register to bid, see every item and place bids right on your page. You see everyone who registered in the Bidders tab. Nobody pays on your site: winners get an invoice by email when the auction ends.</p>
        {!public_ && <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Publish the auction first. The code below only works once it is public.</p>}
        <div>
          <p className="text-sm font-medium mb-1">Paste this where the auction should appear (works on most website builders)</p>
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto whitespace-pre-wrap">{script}</pre>
          <button className={`${ghost} mt-2`} onClick={() => copy("script", script)}>{copied === "script" ? "Copied" : "Copy code"}</button>
        </div>
        <div>
          <p className="text-sm font-medium mb-1">Or, if your site only allows a frame</p>
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto whitespace-pre-wrap">{iframe}</pre>
          <button className={`${ghost} mt-2`} onClick={() => copy("iframe", iframe)}>{copied === "iframe" ? "Copied" : "Copy code"}</button>
        </div>
        <p className="text-xs text-slate-500">To allow only your own website to show it, turn on approved websites in your giving page embed settings.</p>
      </section>
    </div>
  );
}

interface KindInfo { kind: string; label: string; when: string; defaultSubject: string; fields: string[] }
type Wording = Record<string, { subject?: string; intro?: string } | undefined>;

function EmailsTab({ data, canManage, base }: { data: Detail; canManage: boolean; base: string }) {
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  const [wording, setWording] = useState<Wording>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`${base}/emails`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setKinds(j.kinds ?? []); setWording(j.settings ?? {}); } });
    return () => { alive = false; };
  }, [base]);

  function setField(kind: string, key: "subject" | "intro", value: string) {
    setWording((w) => ({ ...w, [kind]: { ...(w[kind] ?? {}), [key]: value } }));
  }

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch(`${base}/emails`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: wording }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? { ok: true, text: "Saved. Your wording is used from now on." } : { ok: false, text: apiMessage(json, "Could not save.") });
  }

  async function sendTest(kind: string) {
    setBusy(true);
    setNote(null);
    const res = await fetch(`${base}/emails/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, settings: wording }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? { ok: true, text: `A sample was sent to ${json.sentTo}.` } : { ok: false, text: apiMessage(json, "Could not send the sample.") });
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-semibold">Automatic emails</h3>
          <p className="text-sm text-slate-500">These go out on their own. You can change the subject and add your own message near the top. The details that matter (amounts, the pay button, the sign-in code) always stay as they are. Leave a box empty to use the standard wording.</p>
        </div>
        {kinds.map((k) => (
          <div key={k.kind} className="rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium text-sm">{k.label}</p><p className="text-xs text-slate-500">{k.when}</p></div>
              {canManage && <button disabled={busy} className={ghost} onClick={() => void sendTest(k.kind)}>Email me a sample</button>}
            </div>
            <label className="block text-xs font-medium text-slate-600">Subject
              <input disabled={!canManage} className={`${field} mt-1`} value={wording[k.kind]?.subject ?? ""} onChange={(e) => setField(k.kind, "subject", e.target.value)} placeholder={k.defaultSubject} />
            </label>
            <label className="block text-xs font-medium text-slate-600">Your message (shown at the top)
              <textarea disabled={!canManage} rows={3} className={`${field} mt-1`} value={wording[k.kind]?.intro ?? ""} onChange={(e) => setField(k.kind, "intro", e.target.value)} placeholder="Optional, for example: Thank you for supporting our students!" />
            </label>
            <p className="text-xs text-slate-500">You can use: {k.fields.map((f) => `{{${f}}}`).join("  ")}</p>
          </div>
        ))}
        {canManage && <button disabled={busy} className={btn} onClick={() => void save()}>Save wording</button>}
        {note && <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
      </section>

      <Announcement data={data} canManage={canManage} base={base} />
    </div>
  );
}

function Announcement({ data, canManage, base }: { data: Detail; canManage: boolean; base: string }) {
  const [audience, setAudience] = useState("ALL");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`${base}/announce?audience=${audience}`, { cache: "no-store" });
    if (res.ok) { const j = await res.json(); setCount(j.count); setWait(j.waitSeconds); }
  }, [base, audience]);
  useEffect(() => { const t = setTimeout(() => void refresh(), 0); return () => clearTimeout(t); }, [refresh]);

  async function send() {
    if (!confirm(`Send this message to ${count} ${count === 1 ? "person" : "people"} now? This can't be undone.`)) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`${base}/announce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience, subject, message }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setNote({ ok: true, text: `Sent to ${json.sent} ${json.sent === 1 ? "person" : "people"}${json.failed ? `; ${json.failed} could not be reached` : ""}.` }); setSubject(""); setMessage(""); void refresh(); }
    else setNote({ ok: false, text: apiMessage(json, "Could not send.") });
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
      <div>
        <h3 className="font-semibold">Message your bidders</h3>
        <p className="text-sm text-slate-500">Send one email to everyone who registered, for example &ldquo;bidding opens tonight&rdquo; or &ldquo;one hour left.&rdquo; Each email has a button to the auction, and replies go to your organization.</p>
      </div>
      {data.auction.status === "DRAFT" && <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Publish the auction before messaging bidders.</p>}
      <label className="block text-sm font-medium">Who gets it
        <select className={`${field} mt-1`} value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="ALL">Everyone who registered</option><option value="APPROVED">Only approved bidders</option><option value="WAITING">Only people waiting for approval</option>
        </select>
      </label>
      <p className="text-sm text-slate-600">{count === null ? "…" : `${count} ${count === 1 ? "person" : "people"} will get it.`}</p>
      <label className="block text-sm font-medium">Subject<input className={`${field} mt-1`} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="block text-sm font-medium">Message<textarea rows={4} className={`${field} mt-1`} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      {canManage && <button disabled={busy || !count || !subject.trim() || !message.trim() || wait > 0 || data.auction.status === "DRAFT"} className={btn} onClick={() => void send()}>{busy ? "Sending…" : "Send message"}</button>}
      {wait > 0 && <p className="text-xs text-slate-500">A message was just sent. You can send another in about {Math.ceil(wait / 60)} minute(s).</p>}
      {note && <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </section>
  );
}
