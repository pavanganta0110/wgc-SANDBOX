"use client";

import { useEffect, useState } from "react";

interface Item {
  href: string;
  name: string;
  section: string;
}
interface MenuResponse {
  items?: Item[];
  alwaysOn?: string[];
  saved?: boolean;
  allowed?: string[];
  newItems?: string[];
  error?: string;
}

const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";

export default function PartnerMenuPanel() {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/menu")
      .then((r) => r.json() as Promise<MenuResponse>)
      .then((d) => {
        if (cancelled) return;
        if (d.error) return setMessage({ text: d.error, error: true });
        setData(d);
        // New items start unticked: they show only once the partner adds them.
        setTicked((d.allowed ?? []).filter((href) => !(d.newItems ?? []).includes(href)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data?.items) return <p className="text-sm text-slate-500">{message?.text ?? "Loading…"}</p>;

  const alwaysOn = new Set(data.alwaysOn);
  const newItems = new Set(data.newItems);
  const sections = [...new Set(data.items.map((i) => i.section))];

  const toggle = (href: string) => setTicked((cur) => (cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href]));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/partner/menu", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed: ticked }) });
    const body = (await res.json()) as MenuResponse;
    setBusy(false);
    if (!res.ok || body.error) return setMessage({ text: body.error ?? "Could not save.", error: true });
    setData({ ...data, saved: true, newItems: [] });
    setMessage({ text: "Saved. Your organizations see this the next time they open the menu.", error: false });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {!data.saved && <p className="text-sm text-slate-600 rounded-lg bg-slate-100 px-4 py-3">Nothing saved yet, so every item shows. Untick what you do not want, then save.</p>}
      {newItems.size > 0 && <p className="text-sm text-amber-900 rounded-lg bg-amber-50 px-4 py-3">WGC added new items since you last saved. They stay hidden until you tick them.</p>}

      {sections.map((section) => (
        <fieldset key={section} className="rounded-xl border border-slate-200 bg-white p-4">
          <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">{section}</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {data.items!
              .filter((i) => i.section === section)
              .map((item) => (
                <label key={item.href} className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={alwaysOn.has(item.href) || ticked.includes(item.href)} disabled={alwaysOn.has(item.href)} onChange={() => toggle(item.href)} />
                  <span>{item.name}</span>
                  {newItems.has(item.href) && <span className="text-[10px] font-bold uppercase rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">New</span>}
                  {alwaysOn.has(item.href) && <span className="text-[11px] text-slate-400">always shown</span>}
                </label>
              ))}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-4">
        <button type="button" className={buttonClass} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save menu"}
        </button>
        {message && <span className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
