"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CreditCard, Send, ArrowLeft, CheckCircle2 } from "lucide-react";
import { formatCents } from "@/lib/format";

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

interface DonorOption {
  id: string;
  name: string;
  email: string | null;
}

interface PaymentMethodOption {
  finixPaymentInstrumentId: string;
  instrumentType: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  bankLast4: string | null;
  cardExpirationMonth: number | null;
  cardExpirationYear: number | null;
  state: string | null;
  enabled: boolean | null;
  accountHolderName: string | null;
}

type Flow = "choose" | "existing" | "setup-link";

export default function CreateSubscriptionWizard() {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>("choose");

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Create Subscription</h2>
      <p className="text-sm text-slate-500 mb-6">Set up a new recurring donation schedule for a donor.</p>

      {flow === "choose" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <button
            onClick={() => setFlow("existing")}
            className="text-left p-6 rounded-2xl border border-slate-200 bg-white hover:border-slate-900 hover:shadow-sm transition"
          >
            <CreditCard className="w-6 h-6 text-slate-700 mb-3" />
            <h3 className="font-bold text-slate-900 mb-1">Use Existing Payment Method</h3>
            <p className="text-sm text-slate-500">Create a recurring donation using an enabled payment method already saved for this donor.</p>
          </button>
          <button
            onClick={() => setFlow("setup-link")}
            className="text-left p-6 rounded-2xl border border-slate-200 bg-white hover:border-slate-900 hover:shadow-sm transition"
          >
            <Send className="w-6 h-6 text-slate-700 mb-3" />
            <h3 className="font-bold text-slate-900 mb-1">Send Setup Link to Donor</h3>
            <p className="text-sm text-slate-500">Send the donor a secure link where they can review the recurring terms, provide payment information, and consent.</p>
          </button>
        </div>
      )}

      {flow === "existing" && <ExistingPaymentMethodFlow onBack={() => setFlow("choose")} onDone={() => router.push("/merchant/subscriptions")} />}
      {flow === "setup-link" && <SetupLinkFlow onBack={() => setFlow("choose")} />}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-4">
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}

function ExistingPaymentMethodFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"donor" | "terms" | "review" | "result">("donor");
  const [search, setSearch] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [selectedDonor, setSelectedDonor] = useState<DonorOption | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[] | null>(null);
  const [paymentMethodsError, setPaymentMethodsError] = useState(false);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState("");

  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setDonors([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/merchant/donors?q=${encodeURIComponent(search)}&pageSize=10`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setDonors((data.rows || []).map((r: any) => ({ id: r.donor.id, name: r.donor.name || "—", email: r.donor.email })));
      } catch {
        toast.error("Donor search failed. Please try again.");
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const loadPaymentMethods = async (donorId: string) => {
    setPaymentMethods(null);
    setPaymentMethodsError(false);
    try {
      const res = await fetch(`/api/merchant/recurring-donors/${donorId}/payment-methods`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPaymentMethods(data.paymentMethods || []);
    } catch {
      setPaymentMethodsError(true);
      setPaymentMethods(null);
    }
  };

  const selectDonor = async (donor: DonorOption) => {
    setSelectedDonor(donor);
    setSelectedInstrumentId("");
    await loadPaymentMethods(donor.id);
  };

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const selectedMethod = paymentMethods?.find((m) => m.finixPaymentInstrumentId === selectedInstrumentId) || null;

  const canProceedToTerms = Boolean(selectedDonor && selectedInstrumentId);
  const canProceedToReview = amountCents >= 100 && frequency && startDate;

  const submit = async () => {
    if (!selectedDonor || !selectedMethod) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = `admin-create-${selectedDonor.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/merchant/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorId: selectedDonor.id,
          paymentInstrumentId: selectedMethod.finixPaymentInstrumentId,
          amountCents,
          billingInterval: frequency,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          internalNote: internalNote || undefined,
          consentConfirmed: true,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Subscription was not created.");
        setStep("result");
        setSubmitting(false);
        return;
      }
      setResult(data.subscription);
      setStep("result");
    } catch {
      setError("Subscription was not created due to a network error.");
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "result") {
    return (
      <div className="max-w-lg">
        <BackButton onClick={onBack} />
        {error ? (
          <div className="bg-white rounded-2xl border border-red-100 p-6">
            <h3 className="font-bold text-red-700 mb-2">Subscription was not created</h3>
            <p className="text-sm text-slate-600 mb-4">{error}</p>
            <div className="flex gap-2">
              <button onClick={() => setStep("review")} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">Retry</button>
              <button onClick={onDone} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Contact Support</button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-emerald-100 p-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-3" />
            <h3 className="font-bold text-slate-900 mb-2">Subscription Created</h3>
            <div className="space-y-1 text-sm text-slate-600 mb-4">
              <p>Donor: <strong>{result.donorName}</strong></p>
              <p>Amount: <strong>{formatCents(result.amountCents)}</strong> — {result.billingInterval}</p>
              <p>Start Date: {new Date(result.startDate).toLocaleDateString("en-US")}</p>
              <p>Payment Method: •••• {result.paymentMethodLastFour}</p>
              {result.nextBillingDate ? (
                <p>Next Billing Date: {new Date(result.nextBillingDate).toLocaleDateString("en-US")} (confirmed)</p>
              ) : (
                <p className="text-amber-600">Next billing date pending processor confirmation.</p>
              )}
            </div>
            <button onClick={onDone} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">Done</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <BackButton onClick={onBack} />

      {step === "donor" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h3 className="font-bold text-slate-900">Select Donor</h3>
          <input
            type="text"
            placeholder="Search donor name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          />
          {donors.length > 0 && (
            <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-56 overflow-y-auto">
              {donors.map((d) => (
                <button key={d.id} onClick={() => selectDonor(d)} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 ${selectedDonor?.id === d.id ? "bg-slate-50" : ""}`}>
                  <p className="font-semibold text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-400">{d.email || "No email"}</p>
                </button>
              ))}
            </div>
          )}

          {selectedDonor && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Payment Method for {selectedDonor.name}</p>
              {paymentMethodsError ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-red-600">Could not load payment methods.</p>
                  <button onClick={() => loadPaymentMethods(selectedDonor.id)} className="text-sm font-semibold text-blue-600 hover:underline">Retry</button>
                </div>
              ) : paymentMethods === null ? (
                <p className="text-sm text-slate-400">Loading payment methods…</p>
              ) : paymentMethods.length === 0 ? (
                <p className="text-sm text-amber-600">This donor has no saved payment method. Use "Send Setup Link to Donor" instead.</p>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.map((m) => {
                    const expired = m.cardExpirationMonth && m.cardExpirationYear ? new Date(m.cardExpirationYear, m.cardExpirationMonth, 1) < new Date() : false;
                    const disabled = m.enabled === false || expired || m.state === "DELETED";
                    return (
                      <label key={m.finixPaymentInstrumentId} className={`flex items-center gap-3 p-3 rounded-xl border ${disabled ? "border-slate-100 opacity-50" : "border-slate-200 cursor-pointer"} ${selectedInstrumentId === m.finixPaymentInstrumentId ? "border-slate-900" : ""}`}>
                        <input
                          type="radio"
                          name="instrument"
                          disabled={disabled}
                          checked={selectedInstrumentId === m.finixPaymentInstrumentId}
                          onChange={() => setSelectedInstrumentId(m.finixPaymentInstrumentId)}
                        />
                        <div className="text-sm">
                          <p className="font-semibold text-slate-800">{m.cardBrand || (m.bankLast4 ? "Bank Account" : "Unknown")} •••• {m.cardLast4 || m.bankLast4}</p>
                          <p className="text-xs text-slate-400">
                            {m.accountHolderName} {m.cardExpirationMonth ? `· Exp ${m.cardExpirationMonth}/${m.cardExpirationYear}` : ""}
                            {expired && " · Expired"} {m.enabled === false && " · Disabled"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button disabled={!canProceedToTerms} onClick={() => setStep("terms")} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            Continue
          </button>
        </div>
      )}

      {step === "terms" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h3 className="font-bold text-slate-900">Recurring Terms</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Recurring Amount ($)</label>
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" placeholder="25.00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">End Date (Optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Internal Note (Optional)</label>
            <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" rows={2} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("donor")} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Back</button>
            <button disabled={!canProceedToReview} onClick={() => setStep("review")} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              Review
            </button>
          </div>
        </div>
      )}

      {step === "review" && selectedDonor && selectedMethod && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h3 className="font-bold text-slate-900">Confirm Recurring Donation</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Donor</span><span className="font-semibold text-slate-800">{selectedDonor.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-800">{selectedDonor.email}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-800">{formatCents(amountCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-semibold text-slate-800">{FREQUENCIES.find((f) => f.value === frequency)?.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{new Date(startDate).toLocaleDateString("en-US")}</span></div>
            {endDate && <div className="flex justify-between"><span className="text-slate-500">End Date</span><span className="font-semibold text-slate-800">{new Date(endDate).toLocaleDateString("en-US")}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Payment Method</span><span className="font-semibold text-slate-800">{selectedMethod.cardBrand || "Bank"} •••• {selectedMethod.cardLast4 || selectedMethod.bankLast4}</span></div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 rounded-xl p-3">
            <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5" />
            I confirm that the donor authorized this recurring donation and agreed to the amount, frequency, start date, and cancellation terms.
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep("terms")} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Back</button>
            <button disabled={!consentConfirmed || submitting} onClick={submit} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              {submitting ? "Creating…" : "Create Subscription"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupLinkFlow({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [selectedDonor, setSelectedDonor] = useState<DonorOption | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim() || selectedDonor) {
      if (!search.trim()) setDonors([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/merchant/donors?q=${encodeURIComponent(search)}&pageSize=10`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setDonors((data.rows || []).map((r: any) => ({ id: r.donor.id, name: r.donor.name || "—", email: r.donor.email })));
      } catch {
        toast.error("Donor search failed. Please try again.");
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedDonor]);

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const canSubmit = amountCents >= 100 && frequency && startDate && (selectedDonor || (firstName && lastName && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/subscriptions/setup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorId: selectedDonor?.id,
          donorFirstName: selectedDonor ? undefined : firstName,
          donorLastName: selectedDonor ? undefined : lastName,
          donorEmail: selectedDonor ? undefined : email,
          donorPhone: phone || undefined,
          amountCents,
          billingInterval: frequency,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          message: message || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send setup link.");
        return;
      }
      setResult(data);
      toast.success("Setup link sent");
    } catch {
      setError("Failed to send setup link due to a network error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg">
        <BackButton onClick={onBack} />
        <div className="bg-white rounded-2xl border border-emerald-100 p-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-3" />
          <h3 className="font-bold text-slate-900 mb-2">Setup Link Sent</h3>
          <div className="space-y-1 text-sm text-slate-600 mb-4">
            <p>Donor: <strong>{result.link.donorEmail}</strong></p>
            <p>Expires: {new Date(result.link.expiresAt).toLocaleDateString("en-US")}</p>
            <p>Status: {result.link.status}</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(result.setupUrl).then(() => toast.success("Link copied"))}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
          >
            Copy Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <BackButton onClick={onBack} />
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Send Setup Link</h3>

        {!selectedDonor ? (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Search Existing Donor (Optional)</label>
            <input type="text" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none mb-2" />
            {donors.length > 0 && (
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-40 overflow-y-auto mb-3">
                {donors.map((d) => (
                  <button key={d.id} onClick={() => { setSelectedDonor(d); setDonors([]); setSearch(""); }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">
                    <p className="font-semibold text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-400">{d.email}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mb-3">Or enter a new donor's contact information:</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
              <input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
            </div>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none mt-3" />
            <input placeholder="Phone (Optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none mt-3" />
          </div>
        ) : (
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{selectedDonor.name}</p>
              <p className="text-xs text-slate-400">{selectedDonor.email}</p>
            </div>
            <button onClick={() => setSelectedDonor(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Change</button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Proposed Amount ($)</label>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" placeholder="25.00" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Frequency</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">End Date (Optional)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Message to Donor (Optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" rows={2} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={!canSubmit || submitting} onClick={submit} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? "Sending…" : "Send Setup Link"}
        </button>
      </div>
    </div>
  );
}
