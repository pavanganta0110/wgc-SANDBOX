"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown, Upload, X, AlertCircle, Plus, ArrowUp, ArrowDown } from "lucide-react";
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
  fundSelectionEnabled: boolean;
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
    fundSelectionEnabled: false,
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

interface FundRow {
  fundId: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  displayOrder: number;
}

interface CatalogFund {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
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
  churchLogoUrl,
  pricing,
  ownerOptions,
  initialOwnerUserId,
  canAssignOwner,
  initialFundAssignments,
}: {
  mode: "create" | "edit";
  linkId?: string;
  initial?: Partial<BuilderState> & { publicSlug?: string };
  churchName: string;
  churchLogoUrl?: string | null;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
  /** Active same-church team members eligible to own a giving link. Omit to hide the ownership section entirely. */
  ownerOptions?: { id: string; email: string; role: string }[];
  initialOwnerUserId?: string;
  /** FUNDRAISER never gets this — they're always forced to themselves server-side regardless. */
  canAssignOwner?: boolean;
  /** Existing fund assignments (edit mode only) — includes archived funds so an admin can see and knowingly remove a stale assignment. */
  initialFundAssignments?: FundRow[];
}) {
  const router = useRouter();
  const [state, setState] = useState<BuilderState>({ ...defaultState(), ...(initial || {}) });
  const [ownerUserId, setOwnerUserId] = useState<string>(initialOwnerUserId || "");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMetadata, setLogoMetadata] = useState<{ fileName: string; fileSize: string } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const [funds, setFunds] = useState<FundRow[]>(
    [...(initialFundAssignments || [])].sort((a, b) => a.displayOrder - b.displayOrder)
  );
  const [fundCatalog, setFundCatalog] = useState<CatalogFund[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundDescription, setNewFundDescription] = useState("");
  const [savingNewFund, setSavingNewFund] = useState(false);

  const loadFundCatalog = async () => {
    if (fundCatalog !== null || loadingCatalog) return;
    setLoadingCatalog(true);
    try {
      const res = await fetch("/api/merchant/funds");
      if (res.ok) {
        const data = await res.json();
        setFundCatalog(data.funds || []);
      }
    } finally {
      setLoadingCatalog(false);
    }
  };

  const addFundToLink = (fund: CatalogFund) => {
    setFunds((prev) => {
      if (prev.some((f) => f.fundId === fund.id)) return prev;
      const row: FundRow = {
        fundId: fund.id,
        name: fund.name,
        description: fund.description || "",
        isActive: fund.isActive,
        isDefault: prev.length === 0,
        displayOrder: prev.length,
      };
      return [...prev, row];
    });
  };

  const handleCreateFund = async () => {
    const name = newFundName.trim();
    if (!name) {
      toast.error("Fund name is required");
      return;
    }
    setSavingNewFund(true);
    try {
      const res = await fetch("/api/merchant/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: newFundDescription.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Failed to create fund");
        return;
      }
      addFundToLink(data.fund);
      setFundCatalog((prev) => (prev ? [...prev, data.fund] : [data.fund]));
      setNewFundName("");
      setNewFundDescription("");
    } finally {
      setSavingNewFund(false);
    }
  };

  const removeFundFromLink = (fundId: string) => {
    setFunds((prev) => {
      const next = prev.filter((f) => f.fundId !== fundId).map((f, i) => ({ ...f, displayOrder: i }));
      if (!next.some((f) => f.isDefault) && next.length > 0) next[0].isDefault = true;
      return next;
    });
  };

  const setDefaultFund = (fundId: string) => {
    setFunds((prev) => prev.map((f) => ({ ...f, isDefault: f.fundId === fundId })));
  };

  const moveFund = (fundId: string, direction: -1 | 1) => {
    setFunds((prev) => {
      const idx = prev.findIndex((f) => f.fundId === fundId);
      const swapIdx = idx + direction;
      if (idx === -1 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((f, i) => ({ ...f, displayOrder: i }));
    });
  };

  const toggleArchiveFund = async (fundId: string) => {
    const row = funds.find((f) => f.fundId === fundId);
    if (!row) return;
    const nextActive = !row.isActive;
    try {
      const res = await fetch(`/api/merchant/funds/${fundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || "Failed to update fund");
        return;
      }
      setFunds((prev) => prev.map((f) => (f.fundId === fundId ? { ...f, isActive: nextActive } : f)));
      setFundCatalog((prev) => (prev ? prev.map((f) => (f.id === fundId ? { ...f, isActive: nextActive } : f)) : prev));
    } catch {
      toast.error("Failed to update fund");
    }
  };

  const unassignedCatalogFunds = (fundCatalog || []).filter((f) => !funds.some((r) => r.fundId === f.id));

  useEffect(() => {
    if (state.fundSelectionEnabled) loadFundCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fundSelectionEnabled]);

  const getFileNameFromUrl = (url: string) => {
    if (!url) return "";
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    return last.startsWith("FI") ? `logo_${last.substring(0, 8)}.png` : last;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleUploadFile(e.target.files[0]);
    }
  };

  const handleUploadFile = async (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported.");
      return;
    }
    const MAX_LOGO_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_LOGO_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setUploadingLogo(true);
    const toastId = toast.loading("Uploading logo...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/merchant/giving-links/logo-upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to upload logo");
      }

      const data = await res.json();
      
      update("branding", {
        ...state.branding,
        light: { ...state.branding.light, logoUrl: data.logoUrl }
      });

      const formattedSize = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${(file.size / 1024).toFixed(0)} KB`;
      
      setLogoMetadata({
        fileName: file.name,
        fileSize: formattedSize,
      });

      toast.success("Logo uploaded successfully", { id: toastId });
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast.error(err.message || "Logo upload failed", { id: toastId });
    } finally {
      setUploadingLogo(false);
    }
  };

  const isValid = 
    state.internalName.trim() !== "" && 
    state.publicTitle.trim() !== "" && 
    (state.amountType !== "FIXED" || (state.fixedAmount !== "" && parseFloat(state.fixedAmount) >= 1)) && 
    state.allowedPaymentMethods.length > 0;

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
    if (state.fundSelectionEnabled && funds.length === 0) {
      toast.error("Add at least one fund or turn off fund selection");
      return;
    }

    setSaving(true);
    setSaveStatus("saving");
    setSaveError(null);

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
      fundSelectionEnabled: state.fundSelectionEnabled,
      fundAssignments: state.fundSelectionEnabled
        ? funds.map((f) => ({ fundId: f.fundId, isDefault: f.isDefault, displayOrder: f.displayOrder }))
        : [],
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
      ...(canAssignOwner && ownerUserId ? { ownerUserId } : {}),
    };

    try {
      const res = await fetch(mode === "create" ? "/api/merchant/giving-links" : `/api/merchant/giving-links/${linkId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data?.error || "Failed to save giving link";
        setSaveError(errMsg);
        setSaveStatus("error");
        toast.error(errMsg);
        setSaving(false);
        return;
      }

      const data = await res.json();
      setSaveStatus("success");
      toast.success(mode === "create" ? "Giving link created" : "Giving link updated");
      setTimeout(() => {
        router.push(`/merchant/giving-links/${data.link.id}`);
      }, 1000);
    } catch (err: any) {
      console.error("Save error:", err);
      const errMsg = err.message || "An unexpected error occurred";
      setSaveError(errMsg);
      setSaveStatus("error");
      toast.error(errMsg);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-240px)] sm:h-[calc(100vh-220px)] lg:h-[calc(100vh-190px)] min-h-0 relative">
      {/* Responsive Columns Wrapper */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start flex-grow h-auto lg:h-0 lg:min-h-0 pb-6 overflow-y-auto lg:overflow-y-hidden">
        
        {/* Left: configuration */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 lg:h-full lg:overflow-y-auto pb-32 p-1">
          {ownerOptions && ownerOptions.length > 0 && (
            <Section title="Ownership" defaultOpen={mode === "create"}>
              <div>
                <FieldLabel>Owner</FieldLabel>
                {canAssignOwner ? (
                  <>
                    <select
                      value={ownerUserId}
                      onChange={(e) => setOwnerUserId(e.target.value)}
                      className={inputClass}
                    >
                      {ownerOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.email} ({o.role})
                        </option>
                      ))}
                    </select>
                    {mode === "edit" && (
                      <p className="text-xs text-amber-600 mt-1.5">
                        Changing the owner only affects future donations through this link — historical transactions and their attribution remain unchanged.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">{ownerOptions.find((o) => o.id === ownerUserId)?.email || "You"}</p>
                )}
              </div>
            </Section>
          )}
          <Section title="Basic Link Information">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.branding.showPoweredByWgc !== false}
                  onChange={(e) => update("branding", { 
                    ...state.branding, 
                    showPoweredByWgc: e.target.checked,
                    hideFooter: !e.target.checked
                  })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show “Powered by WGC”
              </label>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Display a small ‘Powered by WGC’ link on your giving page or embedded form. You can turn this off for a fully white-labeled experience.
              </p>
            </div>
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

            <div className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-sm font-bold text-slate-900">Gift Designations</h5>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-500">Enable fund selection</span>
                  <input
                    type="checkbox"
                    checked={state.fundSelectionEnabled}
                    onChange={(e) => update("fundSelectionEnabled", e.target.checked)}
                    className="w-4 h-4"
                  />
                </label>
              </div>

              {state.fundSelectionEnabled && (
                <div className="space-y-3 mt-3">
                  {funds.length === 0 && (
                    <p className="text-xs text-slate-400">No funds added yet. Add one below.</p>
                  )}
                  {funds.map((f, i) => (
                    <div key={f.fundId} className="border border-slate-200 rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveFund(f.fundId, -1)}
                            disabled={i === 0}
                            className="text-slate-400 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFund(f.fundId, 1)}
                            disabled={i === funds.length - 1}
                            className="text-slate-400 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 flex-1">{f.name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {f.isActive ? "Active" : "Inactive"}
                        </span>
                        {f.isDefault && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Default</span>
                        )}
                      </div>
                      {f.description && <p className="text-xs text-slate-400">{f.description}</p>}
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="defaultFund"
                            checked={f.isDefault}
                            onChange={() => setDefaultFund(f.fundId)}
                          />
                          Default
                        </label>
                        <button type="button" onClick={() => toggleArchiveFund(f.fundId)} className="text-slate-500 hover:underline">
                          {f.isActive ? "Archive" : "Reactivate"}
                        </button>
                        <button type="button" onClick={() => removeFundFromLink(f.fundId)} className="text-red-500 hover:underline">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {unassignedCatalogFunds.length > 0 && (
                    <div>
                      <FieldLabel>Add Existing Fund</FieldLabel>
                      <select
                        value=""
                        onChange={(e) => {
                          const fund = unassignedCatalogFunds.find((f) => f.id === e.target.value);
                          if (fund) addFundToLink(fund);
                        }}
                        className={inputClass}
                      >
                        <option value="">Select a fund...</option>
                        {unassignedCatalogFunds.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}{!f.isActive ? " (Inactive)" : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <FieldLabel>Add Fund</FieldLabel>
                    <input
                      value={newFundName}
                      onChange={(e) => setNewFundName(e.target.value)}
                      placeholder="e.g. Building Fund"
                      className={inputClass}
                    />
                    <input
                      value={newFundDescription}
                      onChange={(e) => setNewFundDescription(e.target.value)}
                      placeholder="Optional short description"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={handleCreateFund}
                      disabled={savingNewFund}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Fund
                    </button>
                  </div>
                </div>
              )}
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
                onChange={(e) => update("receiptSettings", { ...state.receiptSettings, replyTo: e.target.value })}
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
              <FieldLabel>Organization Logo</FieldLabel>
              {state.branding.light.logoUrl ? (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg border border-slate-200 bg-white flex items-center justify-center p-1 overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={state.branding.light.logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {logoMetadata?.fileName || getFileNameFromUrl(state.branding.light.logoUrl)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {logoMetadata?.fileSize || "Saved logo"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => document.getElementById("logo-file-input")?.click()}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        Replace Logo
                      </button>
                      <span className="text-slate-300 text-[10px]">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          update("branding", { ...state.branding, light: { ...state.branding.light, logoUrl: "" } });
                          setLogoMetadata(null);
                        }}
                        className="text-[10px] font-bold text-red-600 hover:text-red-700"
                      >
                        Remove Logo
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("logo-file-input")?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    isDragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-slate-700">
                    {uploadingLogo ? "Uploading logo..." : "Upload Logo"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Upload a logo from your computer.
                  </p>
                  <p className="text-[9px] text-slate-400">
                    PNG, JPG, JPEG, WEBP up to 5MB
                  </p>
                </div>
              )}
              <input
                id="logo-file-input"
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
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

        {/* Right: live preview */}
        <div className="lg:h-full lg:overflow-y-auto pb-32">
          <GivingLinkPreviewPanel
            churchName={churchName}
            light={state.branding.light}
            churchLogoUrl={churchLogoUrl}
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
            showPoweredByWgc={state.branding.showPoweredByWgc}
            fundSelectionEnabled={state.fundSelectionEnabled}
            assignedFunds={funds
              .filter((f) => f.isActive)
              .map((f) => ({ fundId: f.fundId, name: f.name, description: f.description || null, isDefault: f.isDefault, displayOrder: f.displayOrder }))}
          />
        </div>
      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 py-4 px-6 md:px-10 flex items-center justify-between z-40 -mx-6 md:-mx-10 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] shrink-0 mt-auto">
        <div className="flex items-center gap-2 text-sm min-w-0 flex-grow">
          {saveStatus === "saving" && (
            <span className="text-slate-500 flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
              Saving…
            </span>
          )}
          {saveStatus === "success" && (
            <span className="text-green-600 font-semibold flex items-center gap-1.5">
              Saved successfully
            </span>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-2 text-red-600 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-red-700 font-medium truncate max-w-[200px] md:max-w-xs">{saveError || "Failed to save"}</span>
              <button
                type="button"
                onClick={handleSubmit}
                className="font-bold text-blue-600 hover:underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => router.push("/merchant/giving-links")}
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !isValid}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry Save" : mode === "create" ? "Create Giving Link" : "Save Changes"}
          </button>
        </div>
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
