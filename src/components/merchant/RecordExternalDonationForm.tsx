"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  EXTERNAL_PAYMENT_METHODS,
  EXTERNAL_PAYMENT_METHOD_LABELS,
  DIGITAL_PROVIDER_METHODS,
  type ExternalPaymentMethod,
} from "@/lib/donations/externalDonationTypes";
import DonorPicker from "@/components/merchant/DonorPicker";

type DonorMode = "existing" | "new" | "anonymous" | "unmatched";
interface DonorHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RecordExternalDonationForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState("");
  const [donationDate, setDonationDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<ExternalPaymentMethod>("CASH");
  const [otherPaymentMethodName, setOtherPaymentMethodName] = useState("");

  const [donorMode, setDonorMode] = useState<DonorMode>("existing");
  const [selectedDonor, setSelectedDonor] = useState<DonorHit | null>(null);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorPhone, setDonorPhone] = useState("");

  const [includeInAnnualStatement, setIncludeInAnnualStatement] = useState(true);
  const [sendReceipt, setSendReceipt] = useState(false);

  // Optional/common
  const [fundName, setFundName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [givingPageLabel, setGivingPageLabel] = useState("");
  const [donationPurpose, setDonationPurpose] = useState("");
  const [internalNote, setInternalNote] = useState("");

  // Digital provider (Cash App / Zelle / Venmo / PayPal)
  const [externalTransactionId, setExternalTransactionId] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [providerFee, setProviderFee] = useState("");
  const [accountOrDestinationLabel, setAccountOrDestinationLabel] = useState("");

  // Check
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [bankName, setBankName] = useState("");

  // External card terminal
  const [terminalOrProviderName, setTerminalOrProviderName] = useState("");
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [cardType, setCardType] = useState("");

  // Bank transfer
  const [transferReference, setTransferReference] = useState("");
  const [bankOrAccountLabel, setBankOrAccountLabel] = useState("");

  const isDigitalProvider = DIGITAL_PROVIDER_METHODS.has(paymentMethod);
  const isCheck = paymentMethod === "CHECK";
  const isTerminal = paymentMethod === "EXTERNAL_CARD_TERMINAL";
  const isBankTransfer = paymentMethod === "BANK_TRANSFER";
  const isCash = paymentMethod === "CASH";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const donationAmountCents = Math.round((parseFloat(amount) || 0) * 100);
    if (donationAmountCents < 1) {
      toast.error("Enter a donation amount");
      return;
    }
    if (paymentMethod === "OTHER" && !otherPaymentMethodName.trim()) {
      toast.error("Enter a payment method name");
      return;
    }
    if (donorMode === "new" && !donorName.trim() && !donorEmail.trim() && !donorPhone.trim()) {
      toast.error("Enter a donor name, email, or phone — or choose Anonymous / Unmatched");
      return;
    }
    if (donorMode === "existing" && !selectedDonor) {
      toast.error("Search for and select an existing donor, or switch to Add a new donor");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        donationAmountCents,
        donationDate,
        paymentMethod,
        otherPaymentMethodName: paymentMethod === "OTHER" ? otherPaymentMethodName : undefined,
        donorMode,
        donorId: donorMode === "existing" ? selectedDonor?.id : undefined,
        donorName: donorMode === "new" ? donorName : undefined,
        donorEmail: donorMode === "new" ? donorEmail : undefined,
        donorPhone: donorMode === "new" ? donorPhone : undefined,
        fundName: fundName || undefined,
        campaign: campaign || undefined,
        givingPageLabel: givingPageLabel || undefined,
        donationPurpose: donationPurpose || undefined,
        internalNote: internalNote || undefined,
        includeInAnnualStatement,
        sendReceipt: sendReceipt && (donorMode === "new" ? Boolean(donorEmail) : donorMode === "existing" ? Boolean(selectedDonor?.email) : false),
      };

      if (isDigitalProvider) {
        Object.assign(body, {
          externalTransactionId: externalTransactionId || undefined,
          confirmationNumber: confirmationNumber || undefined,
          providerFeeCents: providerFee ? Math.round(parseFloat(providerFee) * 100) : undefined,
          accountOrDestinationLabel: accountOrDestinationLabel || undefined,
        });
      } else if (isCheck) {
        Object.assign(body, {
          checkNumber: checkNumber || undefined,
          checkDate: checkDate || undefined,
          bankName: bankName || undefined,
        });
      } else if (isTerminal) {
        Object.assign(body, {
          terminalOrProviderName: terminalOrProviderName || undefined,
          externalTransactionId: externalTransactionId || undefined,
          lastFourDigits: lastFourDigits || undefined,
          cardType: cardType || undefined,
          providerFeeCents: providerFee ? Math.round(parseFloat(providerFee) * 100) : undefined,
        });
      } else if (isBankTransfer) {
        Object.assign(body, {
          externalTransactionId: transferReference || undefined,
          accountOrDestinationLabel: bankOrAccountLabel || undefined,
        });
      }

      const res = await fetch("/api/merchant/donations/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not save this donation");
        return;
      }
      if (json.possibleDuplicate) {
        toast("Saved — heads up, this looks similar to another recent donation. Check the list to confirm it isn't a duplicate.", { icon: "⚠️" });
      } else {
        toast.success("Donation recorded");
      }
      router.push("/merchant/donations/external");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Donation</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Donation amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Donation date</label>
            <input
              type="date"
              required
              value={donationDate}
              onChange={(e) => setDonationDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as ExternalPaymentMethod)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {EXTERNAL_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {EXTERNAL_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        {paymentMethod === "OTHER" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment method name</label>
            <input
              required
              value={otherPaymentMethodName}
              onChange={(e) => setOtherPaymentMethodName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g. GiveButter, church kiosk"
            />
          </div>
        )}
      </section>

      {isCash && (
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash details</h3>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Internal note</label>
            <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
          </div>
        </section>
      )}

      {isCheck && (
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Check number</label>
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Check date</label>
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bank name (optional)</label>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <p className="text-xs text-slate-400">Routing and account numbers are never stored.</p>
        </section>
      )}

      {isDigitalProvider && (
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{EXTERNAL_PAYMENT_METHOD_LABELS[paymentMethod]} details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">External transaction ID</label>
              <input value={externalTransactionId} onChange={(e) => setExternalTransactionId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirmation number</label>
              <input value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Provider fee (optional)</label>
              <input type="number" step="0.01" value={providerFee} onChange={(e) => setProviderFee(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Payment account label (optional)</label>
              <input value={accountOrDestinationLabel} onChange={(e) => setAccountOrDestinationLabel(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Church CashApp" />
            </div>
          </div>
          <p className="text-xs text-slate-400">Never enter the donor's private login credentials.</p>
        </section>
      )}

      {isTerminal && (
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">External card terminal details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Terminal or provider name</label>
              <input value={terminalOrProviderName} onChange={(e) => setTerminalOrProviderName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">External transaction ID</label>
              <input value={externalTransactionId} onChange={(e) => setExternalTransactionId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last four digits (optional)</label>
              <input maxLength={4} value={lastFourDigits} onChange={(e) => setLastFourDigits(e.target.value.replace(/\D/g, ""))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Card type (optional)</label>
              <input value={cardType} onChange={(e) => setCardType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Visa, Mastercard..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Provider fee (optional)</label>
              <input type="number" step="0.01" value={providerFee} onChange={(e) => setProviderFee(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
          </div>
          <p className="text-xs text-slate-400">Never store the full card number, expiration date, CVV, or magnetic-stripe data.</p>
        </section>
      )}

      {isBankTransfer && (
        <section className="space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank transfer details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Transfer reference number</label>
              <input value={transferReference} onChange={(e) => setTransferReference(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bank or account label (optional)</label>
              <input value={bankOrAccountLabel} onChange={(e) => setBankOrAccountLabel(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-slate-400">Never store full bank account or routing information.</p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Donor</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["existing", "new", "anonymous", "unmatched"] as DonorMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="donorMode"
                checked={donorMode === mode}
                onChange={() => {
                  setDonorMode(mode);
                  if (mode !== "existing") setSelectedDonor(null);
                }}
              />
              {mode === "existing" ? "Select existing donor" : mode === "new" ? "Add a new donor" : mode === "anonymous" ? "Anonymous" : "I don't know yet"}
            </label>
          ))}
        </div>
        {donorMode === "existing" && <DonorPicker selected={selectedDonor} onSelect={setSelectedDonor} onClear={() => setSelectedDonor(null)} />}
        {donorMode === "new" && (
          <div className="grid grid-cols-3 gap-4">
            <input placeholder="Donor name" value={donorName} onChange={(e) => setDonorName(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Donor email (optional)" value={donorEmail} onChange={(e) => setDonorEmail(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Donor phone (optional)" value={donorPhone} onChange={(e) => setDonorPhone(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
        )}
        {donorMode === "unmatched" && (
          <p className="text-xs text-slate-500">This donation will show up under Unmatched External Donations until it's connected to a donor.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Optional details</h2>
        <div className="grid grid-cols-2 gap-4">
          <input placeholder="Fund" value={fundName} onChange={(e) => setFundName(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Giving page" value={givingPageLabel} onChange={(e) => setGivingPageLabel(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Donation purpose" value={donationPurpose} onChange={(e) => setDonationPurpose(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {!isCash && (
          <textarea placeholder="Internal note (never shown to the donor)" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
        )}
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeInAnnualStatement} onChange={(e) => setIncludeInAnnualStatement(e.target.checked)} />
          Include in annual statement
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendReceipt}
            onChange={(e) => setSendReceipt(e.target.checked)}
            disabled={!(donorMode === "new" ? donorEmail : donorMode === "existing" ? selectedDonor?.email : false)}
          />
          Send receipt now {!(donorMode === "new" ? donorEmail : donorMode === "existing" ? selectedDonor?.email : false) ? "(requires a donor email)" : ""}
        </label>
      </section>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={submitting} className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {submitting ? "Saving..." : "Record External Donation"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">
          Cancel
        </button>
      </div>
    </form>
  );
}
