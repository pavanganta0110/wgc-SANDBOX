"use client";

import { useCallback, useEffect, useState } from "react";

interface PartnerUserRow {
  id: string;
  email: string;
  name: string | null;
  invitePending: boolean;
  disabledAt: string | null;
  lastLoginAt: string | null;
}
interface PartnerRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactEmail: string | null;
  suppressMerchantEmails: boolean;
  onboardingCode: string;
  pricePerMerchantCents: number | null;
  cardBrand: string | null;
  cardLast4: string | null;
  users: PartnerUserRow[];
  churches: { id: string; name: string; partnerReference: string | null }[];
}
interface ChurchHit {
  id: string;
  name: string;
  linked: boolean;
}

interface ApiData {
  error?: string;
  message?: string;
  partners?: PartnerRow[];
  churches?: ChurchHit[];
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: ApiData }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const inputClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";

export default function PartnersPanel() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void call("/api/admin/partners", "GET").then(({ ok, data }) => {
      if (cancelled) return;
      if (ok) setPartners(data.partners ?? []);
      else setMessage({ text: data.error || "Couldn't load partners.", error: true });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const report = (ok: boolean, data: ApiData, success: string) => setMessage({ text: ok ? success : data.error || "Something went wrong.", error: !ok });

  async function createPartner(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await call("/api/admin/partners", "POST", { name: newName, contactEmail: newEmail });
    report(ok, data, "Partner created.");
    if (ok) {
      setNewName("");
      setNewEmail("");
      await load();
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <form onSubmit={createPartner} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="partner-name">
            Partner name
          </label>
          <input id="partner-name" required value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="partner-contact">
            Contact email (optional)
          </label>
          <input id="partner-contact" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputClass} />
        </div>
        <button type="submit" className={buttonClass}>
          Create partner
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-slate-500">No partners yet.</p>
      ) : (
        partners.map((p) => <PartnerCard key={p.id} partner={p} onChanged={load} report={report} />)
      )}
    </div>
  );
}

function PartnerCard({ partner, onChanged, report }: { partner: PartnerRow; onChanged: () => Promise<void>; report: (ok: boolean, data: ApiData, success: string) => void }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChurchHit[]>([]);
  const [reference, setReference] = useState("");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await call(`/api/admin/partners/${partner.id}/invite`, "POST", { email: inviteEmail, name: inviteName });
    report(ok, data, data.message || "Invitation sent.");
    if (ok) {
      setInviteEmail("");
      setInviteName("");
    }
    await onChanged();
  }

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) return setHits([]);
    const { ok, data } = await call(`/api/admin/partners/church-search?q=${encodeURIComponent(value.trim())}`, "GET");
    setHits(ok ? (data.churches ?? []) : []);
  }

  async function link(churchId: string) {
    const { ok, data } = await call(`/api/admin/partners/${partner.id}/churches`, "POST", { churchId, reference });
    report(ok, data, "Organization linked.");
    if (ok) {
      setQuery("");
      setHits([]);
      setReference("");
      await onChanged();
    }
  }

  async function unlink(churchId: string) {
    const { ok, data } = await call(`/api/admin/partners/${partner.id}/churches`, "DELETE", { churchId });
    report(ok, data, "Organization unlinked.");
    await onChanged();
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900">{partner.name}</h3>
        <p className="text-xs text-slate-500">
          {partner.slug} · {partner.status}
          {partner.contactEmail ? ` · ${partner.contactEmail}` : ""}
        </p>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Get Started link (give this to the partner)</h4>
        <code className="block break-all rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
          {`${typeof window === "undefined" ? "" : window.location.origin}/start?partner=${partner.onboardingCode}&embed=1&ref=<partner's id for the organization>`}
        </code>
        <p className="text-xs text-slate-500 mt-1">
          Optional extras: <code>org</code>, <code>name</code>, <code>email</code>, <code>phone</code>, <code>website</code> to prefill. The code only tags the application with this partner.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Billing</h4>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const raw = new FormData(e.currentTarget).get("price");
            const dollars = typeof raw === "string" ? raw.trim() : "";
            const cents = dollars === "" ? null : Math.round(Number(dollars) * 100);
            if (cents !== null && !Number.isFinite(cents)) return report(false, { error: "Enter the price in dollars, for example 25 or 25.50." }, "");
            const { ok, data } = await call(`/api/admin/partners/${partner.id}`, "PATCH", { pricePerMerchantCents: cents });
            report(ok, data, cents === null ? "Billing stopped for new invoices." : "Price saved. It applies from the next invoice.");
            await onChanged();
          }}
        >
          <label className="text-xs font-semibold text-slate-600">
            Price per approved merchant per month ($)
            <input
              name="price"
              defaultValue={partner.pricePerMerchantCents ? (partner.pricePerMerchantCents / 100).toString() : ""}
              placeholder="empty = not billed (new partners start at 10)"
              inputMode="decimal"
              className={`${inputClass} block w-48 mt-1`}
            />
          </label>
          <button type="submit" className={buttonClass}>
            Save price
          </button>
          <span className="text-xs text-slate-500">{partner.cardLast4 ? `Card on file: ${partner.cardBrand} ending ${partner.cardLast4}` : "No card on file yet."}</span>
        </form>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={partner.suppressMerchantEmails}
          onChange={async (e) => {
            const { ok, data } = await call(`/api/admin/partners/${partner.id}`, "PATCH", { suppressMerchantEmails: e.target.checked });
            report(ok, data, "Saved.");
            await onChanged();
          }}
        />
        <span>
          Don&apos;t email this partner&apos;s organizations about onboarding (submitted, more information, approved, dashboard access). Use when the partner shows the status in its own
          screens. WGC admins are still emailed.
        </span>
      </label>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Partner staff</h4>
        {partner.users.length === 0 ? (
          <p className="text-sm text-slate-500">No one invited yet.</p>
        ) : (
          <ul className="text-sm text-slate-700 space-y-1">
            {partner.users.map((u) => (
              <li key={u.id}>
                {u.name ? `${u.name} · ` : ""}
                {u.email} — {u.disabledAt ? "disabled" : u.invitePending ? "invite pending" : u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "active"}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={invite} className="flex flex-wrap gap-2 mt-3">
          <input aria-label="Staff name" placeholder="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={inputClass} />
          <input aria-label="Staff email" type="email" required placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} />
          <button type="submit" className={buttonClass}>
            Send invitation
          </button>
        </form>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Linked organizations</h4>
        {partner.churches.length === 0 ? (
          <p className="text-sm text-slate-500">None linked yet.</p>
        ) : (
          <ul className="text-sm text-slate-700 space-y-1">
            {partner.churches.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span>
                  {c.name}
                  {c.partnerReference ? ` · ref ${c.partnerReference}` : ""}
                </span>
                <button type="button" onClick={() => unlink(c.id)} className="text-xs font-semibold text-red-600">
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <input aria-label="Search organizations" placeholder="Search organization by name" value={query} onChange={(e) => void search(e.target.value)} className={inputClass} />
          <input aria-label="Partner reference" placeholder="Partner's reference (e.g. CRM location ID)" value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputClass} w-72`} />
        </div>
        {hits.length > 0 && (
          <ul className="mt-2 text-sm space-y-1">
            {hits.map((h) => (
              <li key={h.id} className="flex items-center gap-3">
                <span>{h.name}</span>
                {h.linked ? (
                  <span className="text-xs text-slate-400">already linked</span>
                ) : (
                  <button type="button" onClick={() => link(h.id)} className="text-xs font-semibold text-blue-700">
                    Link
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
