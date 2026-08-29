"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";

interface DonationOption {
  id: string;
  donationAmountCents: number;
  donationDate: string;
  paymentMethod: string;
  pledgeId: string | null;
}

/**
 * Lets a merchant switch a pledge from PROMISED toward FULFILLED by linking
 * one of the donor's existing recorded external donations as evidence —
 * the pledge's status/fulfilledAmountCents is then recomputed automatically
 * (see computePledgeFulfillment) from whatever's linked, same as an online
 * "Give now" payment does. There's no separate manual status override —
 * this is the one path that changes a pledge's status.
 */
export default function LinkPledgeFulfillmentButton({ pledgeId }: { pledgeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donations, setDonations] = useState<DonationOption[] | null>(null);
  const [selectedId, setSelectedId] = useState("");

  async function openPicker() {
    setOpen(true);
    setError(null);
    if (donations) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/pledges/${pledgeId}/fulfillments`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load donations");
        setLoading(false);
        return;
      }
      setDonations(data.donations.filter((d: DonationOption) => !d.pledgeId));
      setLoading(false);
    } catch {
      setError("Could not load donations");
      setLoading(false);
    }
  }

  async function handleLink() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/pledges/${pledgeId}/fulfillments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalDonationId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not link donation");
        setSubmitting(false);
        return;
      }
      setOpen(false);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Could not link donation");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={openPicker} className="text-xs font-semibold text-indigo-600 hover:underline">
        Link Donation
      </button>
    );
  }

  return (
    <div className="text-xs">
      {error && <p className="text-red-600 mb-1">{error}</p>}
      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : donations && donations.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-slate-300 px-1.5 py-1 text-xs max-w-[180px]"
          >
            <option value="">— Select donation —</option>
            {donations.map((d) => (
              <option key={d.id} value={d.id}>
                {formatCents(d.donationAmountCents)} · {formatDateCDT(d.donationDate)}
              </option>
            ))}
          </select>
          <button
            onClick={handleLink}
            disabled={!selectedId || submitting}
            className="text-indigo-600 font-semibold hover:underline disabled:opacity-50"
          >
            {submitting ? "Linking…" : "Link"}
          </button>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <p className="text-slate-400">
          No unlinked external donations for this donor.{" "}
          <button onClick={() => setOpen(false)} className="text-indigo-600 hover:underline">
            Close
          </button>
        </p>
      )}
    </div>
  );
}
