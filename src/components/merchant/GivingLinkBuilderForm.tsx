"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown } from "lucide-react";
import { formatCents } from "@/lib/format";
import GivingLinkPreviewPanel from "@/components/merchant/GivingLinkPreviewPanel";
import {
  DONOR_FIELDS,
  DonorFieldKey,
  DonorFieldSettings,
  DEFAULT_DONOR_FIELD_SETTINGS,
  PaymentMethodKey,
  FrequencyKey,
  FREQUENCIES,
  ReceiptSettings,
  DEFAULT_RECEIPT_SETTINGS,
  BrandingSettings,
  DEFAULT_BRANDING_SETTINGS,
} from "@/lib/givingLinks/types";

const DONOR_FIELD_LABELS: Record<DonorFieldKey, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  phone: "Phone",
  street: "Street Address",
  apartment: "Apartment/Suite",
  city: "City",
  state: "State",
  postalCode: "Postal Code",
  country: "Country",
  donorNote: "Donor Note",
  anonymousDonation: "Anonymous Donation",
  companyName: "Company/Organization Name",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  CARD: "Credit/Debit Card",
  BANK: "Bank Account",
  APPLE_PAY: "Apple Pay",
  GOOGLE_PAY: "Google Pay",
};

const VALIDITY_PRESETS = [
  { key: "1h", label: "1 Hour", ms: 60 * 60 * 1000 },
  { key: "24h", label: "24 Hours", ms: 24 * 60 * 60 * 1000 },
  { key: "1w", label: "1 Week", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1 Month", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "3m", label: "3 Months", ms: 90 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1 Year", ms: 365 * 24 * 60 * 60 * 1000 },
  { key: "3y", label: "3 Years", ms: 3 * 365 * 24 * 60 * 60 * 1000 },
  { key: "none", label: "No Expiration", ms: null as number | null },
  { key: "custom", label: "Custom Date/Time", ms: null as number | null },
];

interface BuilderState {
  internalName: string;
  publicTitle: string;
  description: string;
  amountType: "FIXED" | "VARIABLE";
  fixedAmount: string;
  minAmount: string;
  maxAmount: string;
  suggestedAmounts: string;
  allowCustomAmount: boolean;
  linkType: "ONE_TIME" | "MULTI_USE";
  validityKey: string;
  customExpiresAt: string;
  maxSuccessfulUses: string;
  maxCollectedAmount: string;
  fundName: string;
  allowedPaymentMethods: PaymentMethodKey[];
  donorFieldSettings: DonorFieldSettings;
  feeCoverEnabled: boolean;
  feeCoverDefaultOn: boolean;
  recurringEnabled: boolean;
  allowedFrequencies: FrequencyKey[];
  receiptSettings: ReceiptSettings;
  statementDescriptor: string;
  internalNote: string;
  referenceNumber: string;
  successReturnUrl: string;
  failureReturnUrl: string;
  cancelReturnUrl: string;
  branding: BrandingSettings;
}

function defaultState(): BuilderState {
  return {
    internalName: "",
    publicTitle: "",
    description: "",
    amountType: "FIXED",
    fixedAmount: "",
    minAmount: "",
    maxAmount: "",
    suggestedAmounts: "25, 50, 100, 250",
    allowCustomAmount: true,
    linkType: "MULTI_USE",
    validityKey: "none",
    customExpiresAt: "",
    maxSuccessfulUses: "",
    maxCollectedAmount: "",
    fundName: "",
    allowedPaymentMethods: ["CARD"],
    donorFieldSettings: DEFAULT_DONOR_FIELD_SETTINGS,
    feeCoverEnabled: true,
    feeCoverDefaultOn: true,
    recurringEnabled: false,
    allowedFrequencies: ["MONTHLY"],
    receiptSettings: DEFAULT_RECEIPT_SETTINGS,
    statementDescriptor: "",
    internalNote: "",
    referenceNumber: "",
    successReturnUrl: "",
    failureReturnUrl: "",
    cancelReturnUrl: "",
    branding: DEFAULT_BRANDING_SETTINGS,
  };
}

function amountsToCents(input: string): number[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Math.round(parseFloat(s) * 100))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500 mb-1.5">{children}</label>;
}

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500";

export default function GivingLinkBuilderForm({
  mode,
  linkId,
  initial,
  churchName,
  pricing,
}: {
  mode: "create" | "edit";
  linkId?: string;
  initial?: Partial<BuilderState> & { publicSlug?: string };
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
}) {
  const router = useRouter();
  const [state, setState] = useState<BuilderState>({ ...defaultState(), ...(initial || {}) });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDonorField = (field: DonorFieldKey, visibility: "REQUIRED" | "OPTIONAL" | "HIDDEN") => {
    setState((prev) => ({
      ...prev,
      donorFieldSettings: { ...prev.donorFieldSettings, [field]: visibility },
    }));
  };

  const togglePaymentMethod = (method: PaymentMethodKey) => {
    setState((prev) => {
      const has = prev.allowedPaymentMethods.includes(method);
      return {
        ...prev,
        allowedPaymentMethods: has
          ? prev.allowedPaymentMethods.filter((m) => m !== method)
          : [...prev.allowedPaymentMethods, method],
      };
    });
  };

  const toggleFrequency = (freq: FrequencyKey) => {
    setState((prev) => {
      const has = prev.allowedFrequencies.includes(freq);
      return {
        ...prev,
        allowedFrequencies: has ? prev.allowedFrequencies.filter((f) => f !== freq) : [...prev.allowedFrequencies, freq],
      };
    });
  };

  const computeExpiresAt = (): string | null => {
    if (state.validityKey === "none") return null;
    if (state.validityKey === "custom") return state.customExpiresAt ? new Date(state.customExpiresAt).toISOString() : null;
    const preset = VALIDITY_PRESETS.find((p) => p.key === state.validityKey);
    if (!preset?.ms) return null;
    return new Date(Date.now() + preset.ms).toISOString();
  };

  const handleSubmit = async () => {
    if (!state.internalName.trim() || !state.publicTitle.trim()) {
      toast.error("Internal name and public title are required");
      return;
    }
    if (state.amountType === "FIXED" && (!state.fixedAmount || parseFloat(state.fixedAmount) < 1)) {
      toast.error("Fixed amount must be at least $1.00");
      return;
    }
    if (state.allowedPaymentMethods.length === 0) {
      toast.error("At least one payment method is required");
      return;
    }

    setSaving(true);

    const payload = {
      internalName: state.internalName.trim(),
      publicTitle: state.publicTitle.trim(),
      description: state.description.trim() || null,
      amountType: state.amountType,
      fixedAmountCents: state.amountType === "FIXED" ? Math.round(parseFloat(state.fixedAmount || "0") * 100) : undefined,
      minAmountCents: state.amountType === "VARIABLE" && state.minAmount ? Math.round(parseFloat(state.minAmount) * 100) : null,
      maxAmountCents: state.amountType === "VARIABLE" && state.maxAmount ? Math.round(parseFloat(state.maxAmount) * 100) : null,
      suggestedAmountsCents: amountsToCents(state.suggestedAmounts),
      allowCustomAmount: state.allowCustomAmount,
      linkType: state.linkType,
      maxSuccessfulUses: state.maxSuccessfulUses ? parseInt(state.maxSuccessfulUses, 10) : null,
      maxCollectedAmountCents: state.maxCollectedAmount ? Math.round(parseFloat(state.maxCollectedAmount) * 100) : null,
      expiresAt: computeExpiresAt(),
      fundName: state.fundName.trim() || null,
      recurringEnabled: state.recurringEnabled,
      allowedFrequencies: state.allowedFrequencies,
      allowedPaymentMethods: state.allowedPaymentMethods,
      donorFieldSettings: state.donorFieldSettings,
      feeCoverEnabled: state.feeCoverEnabled,
      feeCoverDefaultOn: state.feeCoverDefaultOn,
      receiptSettings: state.receiptSettings,
      statementDescriptor: state.statementDescriptor.trim() || null,
      internalNote: state.internalNote.trim() || null,
      referenceNumber: state.referenceNumber.trim() || null,
      successReturnUrl: state.successReturnUrl.trim() || null,
      failureReturnUrl: state.failureReturnUrl.trim() || null,
      cancelReturnUrl: state.cancelReturnUrl.trim() || null,
      brandingSettings: state.branding,
    };

    const res = await fetch(mode === "create" ? "/api/merchant/giving-links" : `/api/merchant/giving-links/${linkId}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Failed to save giving link");
      return;
    }

    const data = await res.json();
    toast.success(mode === "create" ? "Giving link created" : "Giving link updated");
    router.push(`/merchant/giving-links/${data.link.id}`);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left: configuration */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
        <Section title="Basic Link Information">
          <div>
            <FieldLabel>Internal Name *</FieldLabel>
            <input
              value={state.internalName}
              onChange={(e) => update("internalName", e.target.value)}
              placeholder="e.g. Building Fund Summer Campaign"
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">Not shown to donors.</p>
          </div>
          <div>
            <FieldLabel>Public Title *</FieldLabel>
            <input
              value={state.publicTitle}
              onChange={(e) => update("publicTitle", e.target.value)}
              placeholder="e.g. Support Our Building Fund"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Public Description</FieldLabel>
            <textarea
              value={state.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Amount Type</FieldLabel>
            <div className="flex rounded-xl border border-slate-200 p-1">
              <button
                onClick={() => update("amountType", "FIXED")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${state.amountType === "FIXED" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Fixed Amount
              </button>
              <button
                onClick={() => update("amountType", "VARIABLE")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${state.amountType === "VARIABLE" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Variable Amount
              </button>
            </div>
          </div>

          {state.amountType === "FIXED" ? (
            <div>
              <FieldLabel>Amount ($) *</FieldLabel>
              <input
                type="number"
                min="1"
                step="0.01"
                value={state.fixedAmount}
                onChange={(e) => update("fixedAmount", e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Minimum Amount ($)</FieldLabel>
                  <input type="number" min="1" step="0.01" value={state.minAmount} onChange={(e) => update("minAmount", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel>Maximum Amount ($)</FieldLabel>
                  <input type="number" min="1" step="0.01" value={state.maxAmount} onChange={(e) => update("maxAmount", e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <FieldLabel>Suggested Amounts ($, comma-separated)</FieldLabel>
                <input value={state.suggestedAmounts} onChange={(e) => update("suggestedAmounts", e.target.value)} className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={state.allowCustomAmount} onChange={(e) => update("allowCustomAmount", e.target.checked)} />
                Allow custom amount
              </label>
            </>
          )}

          <div>
            <FieldLabel>Link Type</FieldLabel>
            <div className="flex rounded-xl border border-slate-200 p-1">
              <button
                onClick={() => update("linkType", "ONE_TIME")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${state.linkType === "ONE_TIME" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                One-Time Link
              </button>
              <button
                onClick={() => update("linkType", "MULTI_USE")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${state.linkType === "MULTI_USE" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Multi-Use Link
              </button>
            </div>
          </div>

          <div>
            <FieldLabel>Link Validity</FieldLabel>
            <select value={state.validityKey} onChange={(e) => update("validityKey", e.target.value)} className={inputClass}>
              {VALIDITY_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          {state.validityKey === "custom" && (
            <div>
              <FieldLabel>Expiration Date/Time</FieldLabel>
              <input type="datetime-local" value={state.customExpiresAt} onChange={(e) => update("customExpiresAt", e.target.value)} className={inputClass} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Max Successful Donations</FieldLabel>
              <input type="number" min="1" value={state.maxSuccessfulUses} onChange={(e) => update("maxSuccessfulUses", e.target.value)} placeholder="Unlimited" className={inputClass} />
            </div>
            <div>
              <FieldLabel>Max Total Collected ($)</FieldLabel>
              <input type="number" min="1" value={state.maxCollectedAmount} onChange={(e) => update("maxCollectedAmount", e.target.value)} placeholder="Unlimited" className={inputClass} />
            </div>
          </div>

          <div>
            <FieldLabel>Fund / Designation</FieldLabel>
            <input value={state.fundName} onChange={(e) => update("fundName", e.target.value)} placeholder="General Fund, Building Fund, Missions…" className={inputClass} />
          </div>
        </Section>

        <Section title="Allowed Payment Methods">
          <div className="space-y-2">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodKey[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={state.allowedPaymentMethods.includes(m)} onChange={() => togglePaymentMethod(m)} />
                {PAYMENT_METHOD_LABELS[m]}
              </label>
            ))}
          </div>
        </Section>

        <Section title="Donor Details" defaultOpen={false}>
          <div className="space-y-2">
            {DONOR_FIELDS.map((field) => (
              <div key={field} className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700">{DONOR_FIELD_LABELS[field]}</span>
                <select
                  value={state.donorFieldSettings[field]}
                  onChange={(e) => toggleDonorField(field, e.target.value as "REQUIRED" | "OPTIONAL" | "HIDDEN")}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs outline-none"
                >
                  <option value="REQUIRED">Required</option>
                  <option value="OPTIONAL">Optional</option>
                  <option value="HIDDEN">Hidden</option>
                </select>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Additional Donation Options" defaultOpen={false}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={state.feeCoverEnabled} onChange={(e) => update("feeCoverEnabled", e.target.checked)} />
            Allow donor to cover processing fees
          </label>
          {state.feeCoverEnabled && (
            <label className="flex items-center gap-2 text-sm text-slate-700 ml-6">
              <input type="checkbox" checked={state.feeCoverDefaultOn} onChange={(e) => update("feeCoverDefaultOn", e.target.checked)} />
              Checked by default
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={state.recurringEnabled} onChange={(e) => update("recurringEnabled", e.target.checked)} />
            Allow recurring giving
          </label>
          {state.recurringEnabled && (
            <div className="ml-6 space-y-1.5">
              {FREQUENCIES.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={state.allowedFrequencies.includes(f)} onChange={() => toggleFrequency(f)} />
                  {f.charAt(0) + f.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section title="Advanced Settings" defaultOpen={false}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={state.receiptSettings.sendAutomatically}
              onChange={(e) => update("receiptSettings", { ...state.receiptSettings, sendAutomatically: e.target.checked })}
            />
            Send receipt automatically
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Receipt Sender Name</FieldLabel>
              <input
                value={state.receiptSettings.senderName}
                onChange={(e) => update("receiptSettings", { ...state.receiptSettings, senderName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Receipt Reply-To</FieldLabel>
              <input
                type="email"
                value={state.receiptSettings.replyTo}
                onChange={(e) => update("receiptSettings", { ...state.receiptSettings, replyTo: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Receipt Subject</FieldLabel>
            <input
              value={state.receiptSettings.subject}
              onChange={(e) => update("receiptSettings", { ...state.receiptSettings, subject: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Custom Receipt Message</FieldLabel>
            <textarea
              value={state.receiptSettings.customMessage}
              onChange={(e) => update("receiptSettings", { ...state.receiptSettings, customMessage: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={state.receiptSettings.includeTaxLanguage}
              onChange={(e) => update("receiptSettings", { ...state.receiptSettings, includeTaxLanguage: e.target.checked })}
            />
            Include tax-deductibility wording
          </label>

          <div>
            <FieldLabel>Card Statement Descriptor</FieldLabel>
            <input
              value={state.statementDescriptor}
              onChange={(e) => update("statementDescriptor", e.target.value.slice(0, 18))}
              maxLength={18}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Internal Note (admins only)</FieldLabel>
            <textarea value={state.internalNote} onChange={(e) => update("internalNote", e.target.value)} rows={2} className={inputClass} />
          </div>
          <div>
            <FieldLabel>Reference Number</FieldLabel>
            <input value={state.referenceNumber} onChange={(e) => update("referenceNumber", e.target.value)} className={inputClass} />
          </div>

          <div>
            <FieldLabel>Success Return URL</FieldLabel>
            <input value={state.successReturnUrl} onChange={(e) => update("successReturnUrl", e.target.value)} placeholder="https://yourchurch.org/thank-you" className={inputClass} />
          </div>
          <div>
            <FieldLabel>Failure Return URL</FieldLabel>
            <input value={state.failureReturnUrl} onChange={(e) => update("failureReturnUrl", e.target.value)} placeholder="https://yourchurch.org/try-again" className={inputClass} />
          </div>
          <div>
            <FieldLabel>Cancel Return URL</FieldLabel>
            <input value={state.cancelReturnUrl} onChange={(e) => update("cancelReturnUrl", e.target.value)} placeholder="https://yourchurch.org" className={inputClass} />
          </div>
        </Section>

        <Section title="Customization Options" defaultOpen={false}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Light Mode Branding</p>
          <div>
            <FieldLabel>Logo URL</FieldLabel>
            <input
              value={state.branding.light.logoUrl}
              onChange={(e) => update("branding", { ...state.branding, light: { ...state.branding.light, logoUrl: e.target.value } })}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Header Background" value={state.branding.light.headerBackground} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, headerBackground: v } })} />
            <ColorField label="Page Background" value={state.branding.light.pageBackground} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, pageBackground: v } })} />
            <ColorField label="Button Background" value={state.branding.light.buttonBackground} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, buttonBackground: v } })} />
            <ColorField label="Button Text" value={state.branding.light.buttonText} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, buttonText: v } })} />
            <ColorField label="Heading Color" value={state.branding.light.headingColor} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, headingColor: v } })} />
            <ColorField label="Body Text Color" value={state.branding.light.bodyTextColor} onChange={(v) => update("branding", { ...state.branding, light: { ...state.branding.light, bodyTextColor: v } })} />
          </div>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Dark Mode Branding</p>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Header Background" value={state.branding.dark.headerBackground} onChange={(v) => update("branding", { ...state.branding, dark: { ...state.branding.dark, headerBackground: v } })} />
            <ColorField label="Page Background" value={state.branding.dark.pageBackground} onChange={(v) => update("branding", { ...state.branding, dark: { ...state.branding.dark, pageBackground: v } })} />
            <ColorField label="Button Background" value={state.branding.dark.buttonBackground} onChange={(v) => update("branding", { ...state.branding, dark: { ...state.branding.dark, buttonBackground: v } })} />
            <ColorField label="Heading Color" value={state.branding.dark.headingColor} onChange={(v) => update("branding", { ...state.branding, dark: { ...state.branding.dark, headingColor: v } })} />
          </div>

          <div>
            <FieldLabel>Campaign Image URL</FieldLabel>
            <input
              value={state.branding.campaignImageUrl}
              onChange={(e) => update("branding", { ...state.branding, campaignImageUrl: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Custom Thank-You Message</FieldLabel>
            <textarea
              value={state.branding.thankYouMessage}
              onChange={(e) => update("branding", { ...state.branding, thankYouMessage: e.target.value })}
              rows={2}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Support Email</FieldLabel>
            <input
              type="email"
              value={state.branding.supportEmail}
              onChange={(e) => update("branding", { ...state.branding, supportEmail: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={state.branding.hideFooter} onChange={(e) => update("branding", { ...state.branding, hideFooter: e.target.checked })} />
              Hide WGC footer
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={state.branding.hideChurchAddress} onChange={(e) => update("branding", { ...state.branding, hideChurchAddress: e.target.checked })} />
              Hide church address
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={state.branding.hideContactInfo} onChange={(e) => update("branding", { ...state.branding, hideContactInfo: e.target.checked })} />
              Hide contact information
            </label>
          </div>
        </Section>
      </div>

      {/* Right: live preview — renders the actual public GivingLinkForm component in a safe preview mode, so this can never drift from the real giving page. */}
      <GivingLinkPreviewPanel
        churchName={churchName}
        light={state.branding.light}
        amountType={state.amountType}
        fixedAmountCents={state.fixedAmount ? Math.round(parseFloat(state.fixedAmount) * 100) : null}
        minAmountCents={state.minAmount ? Math.round(parseFloat(state.minAmount) * 100) : null}
        maxAmountCents={state.maxAmount ? Math.round(parseFloat(state.maxAmount) * 100) : null}
        suggestedAmountsCents={amountsToCents(state.suggestedAmounts)}
        allowCustomAmount={state.allowCustomAmount}
        recurringEnabled={state.recurringEnabled}
        allowedFrequencies={state.allowedFrequencies}
        allowedPaymentMethods={state.allowedPaymentMethods}
        feeCoverEnabled={state.feeCoverEnabled}
        feeCoverDefaultOn={state.feeCoverDefaultOn}
        donorFieldSettings={state.donorFieldSettings}
        pricing={pricing}
        thankYouMessage={state.receiptSettings.customMessage || "Thank you for your gift!"}
        campaignImageUrl={state.branding.campaignImageUrl || undefined}
        publicTitle={state.publicTitle}
        description={state.description}
        hideFooter={state.branding.hideFooter}
      />

      {/* Bottom actions */}
      <div className="lg:col-span-2 flex items-center justify-end gap-3 pt-2">
        <button
          onClick={() => router.push("/merchant/giving-links")}
          className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create Giving Link" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-lg border border-slate-200 shrink-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      </div>
    </div>
  );
}
