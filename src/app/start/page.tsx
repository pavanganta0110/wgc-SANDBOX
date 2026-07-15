"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, ArrowRight, ArrowLeft, UploadCloud } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

const MCC_OPTIONS = [
  { code: "5045", label: "5045 — Computers, Computer Peripheral Equipment, and Software" },
  { code: "8398", label: "8398 — Charitable and Social Service Organizations" },
  { code: "8661", label: "8661 — Religious Organizations" },
];

const normalizeWebsiteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export default function StartOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasBeneficialOwners, setHasBeneficialOwners] = useState<boolean | null>(null);
  const [attemptedNext, setAttemptedNext] = useState(false);

  const [formData, setFormData] = useState({
    // Basic / Organization
    organizationName: "",
    organizationType: "Church",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
    legalBusinessName: "",
    doingBusinessAs: "",
    businessTaxId: "",
    businessPhone: "",
    businessAddressLine1: "",
    businessAddressLine2: "",
    businessCity: "",
    businessState: "",
    businessPostalCode: "",
    businessCountry: "USA",
    businessDescription: "",
    mcc: "8398",
    defaultStatementDescriptor: "",
    incorporationYear: "",
    incorporationMonth: "",
    incorporationDay: "",

    // Processing
    annualCardVolume: "",
    annualAchVolume: "",
    averageCardTransferAmount: "",
    averageAchTransferAmount: "",
    maxTransactionAmount: "",
    achMaxTransactionAmount: "",
    ecommercePercentage: 100,
    cardPresentPercentage: 0,
    mailOrderTelephoneOrderPercentage: 0,
    businessToBusinessPercentage: 0,
    businessToConsumerPercentage: 100,
    otherVolumePercentage: 0,
    refundPolicy: "NO_REFUNDS",
    hasAcceptedCreditCardsPreviously: false,

    // Control Person
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    phone: "",
    dobYear: "",
    dobMonth: "",
    dobDay: "",
    ownershipPercentage: 100,
    personalAddressLine1: "",
    personalAddressLine2: "",
    personalCity: "",
    personalState: "",
    personalPostalCode: "",
    personalCountry: "USA",
    taxId: "",

    // Payout Bank
    accountHolderName: "",
    accountType: "BUSINESS_CHECKING",
    routingNumber: "",
    accountNumber: "",
    confirmAccountNumber: "",
    bankCountry: "USA",
    currency: "USD"
  });

  const [associatedOwners, setAssociatedOwners] = useState<any[]>([]);

  // WGC-only 501(c)(3) IRS determination letter — held in memory until the
  // main submission succeeds (no draft-save exists for this form; every
  // other field has the same limitation), then uploaded as a separate,
  // independent request that never affects the Finix submission above.
  const [irsLetterFile, setIrsLetterFile] = useState<File | null>(null);
  const [irsLetterError, setIrsLetterError] = useState<string | null>(null);
  const [irsLetterUploadPhase, setIrsLetterUploadPhase] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle");
  const [submittedApplicationId, setSubmittedApplicationId] = useState<string | null>(null);

  const IRS_LETTER_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
  const IRS_LETTER_MAX_SIZE = 10 * 1024 * 1024;

  const handleIrsLetterChange = (file: File | null) => {
    setIrsLetterError(null);
    if (!file) {
      setIrsLetterFile(null);
      return;
    }
    if (!IRS_LETTER_ALLOWED_TYPES.includes(file.type)) {
      setIrsLetterError("Upload a PDF, JPG, JPEG, or PNG file.");
      return;
    }
    if (file.size > IRS_LETTER_MAX_SIZE) {
      setIrsLetterError("The selected file exceeds the allowed size.");
      return;
    }
    setIrsLetterFile(file);
  };

  const uploadIrsLetterFile = async (applicationId: string): Promise<boolean> => {
    if (!irsLetterFile) return true;
    setIrsLetterUploadPhase("uploading");
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", irsLetterFile);
      const res = await fetch(`/api/onboarding/${applicationId}/irs-letter`, { method: "POST", body: uploadFormData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "We could not upload the document. Please try again.");
      setIrsLetterUploadPhase("uploaded");
      return true;
    } catch (err: any) {
      setIrsLetterError(err.message || "We could not upload the document. Please try again.");
      setIrsLetterUploadPhase("failed");
      return false;
    }
  };

  const [legal, setLegal] = useState({
    wgcTerms: false,
    wgcFees: false,
    wgcPrivacy: false,
    finixTerms: false,
    finixPrivacy: false,
  });

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateLegal = (field: string, value: boolean) => {
    setLegal((prev) => ({ ...prev, [field]: value }));
  };

  const addAssociatedOwner = () => {
    setAssociatedOwners(prev => [...prev, {
      firstName: "", lastName: "", title: "", email: "", phone: "",
      dobYear: "", dobMonth: "", dobDay: "", ownershipPercentage: 25,
      addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "USA", taxId: ""
    }]);
  };

  const updateAssociatedOwner = (index: number, field: string, value: any) => {
    const newOwners = [...associatedOwners];
    newOwners[index][field] = value;
    setAssociatedOwners(newOwners);
  };

  const removeAssociatedOwner = (index: number) => {
    setAssociatedOwners(prev => prev.filter((_, i) => i !== index));
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 6) {
      nextStep();
      return;
    }

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      toast.error("Account numbers do not match.");
      return;
    }

    const allLegalAccepted = Object.values(legal).every(Boolean);
    if (!allLegalAccepted) {
      toast.error("Please accept all terms and policies to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        website: normalizeWebsiteUrl(formData.website),
        annualCardVolume: Number(formData.annualCardVolume || 0),
        annualAchVolume: Number(formData.annualAchVolume || 0),
        averageCardTransferAmount: Number(formData.averageCardTransferAmount || 0),
        averageAchTransferAmount: Number(formData.averageAchTransferAmount || 0),
        maxTransactionAmount: Number(formData.maxTransactionAmount || 0),
        achMaxTransactionAmount: Number(formData.achMaxTransactionAmount || 0),
        ecommercePercentage: Number(formData.ecommercePercentage || 100),
        cardPresentPercentage: Number(formData.cardPresentPercentage || 0),
        mailOrderTelephoneOrderPercentage: Number(formData.mailOrderTelephoneOrderPercentage || 0),
        businessToBusinessPercentage: Number(formData.businessToBusinessPercentage || 0),
        businessToConsumerPercentage: Number(formData.businessToConsumerPercentage || 100),
        otherVolumePercentage: Number(formData.otherVolumePercentage || 0),
        incorporationYear: Number(formData.incorporationYear),
        incorporationMonth: Number(formData.incorporationMonth),
        incorporationDay: Number(formData.incorporationDay),
        dobYear: Number(formData.dobYear),
        dobMonth: Number(formData.dobMonth),
        dobDay: Number(formData.dobDay),
        ownershipPercentage: Number(formData.ownershipPercentage),
        associatedOwners: hasBeneficialOwners ? associatedOwners.map(o => ({
          ...o,
          dobYear: Number(o.dobYear),
          dobMonth: Number(o.dobMonth),
          dobDay: Number(o.dobDay),
          ownershipPercentage: Number(o.ownershipPercentage),
        })) : [],
        legal
      };

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        let errorMsg = data.step ? `Failed to submit: ${data.step}` : data.message || data.error || "Failed to submit onboarding application.";
        if (data.errorDetail) {
          errorMsg = `${errorMsg} — ${data.errorDetail}`;
        } else if (data.message) {
          errorMsg = `${errorMsg} — ${data.message}`;
        }
        if (data.prismaCode) errorMsg += ` | Prisma Code: ${data.prismaCode}`;
        if (data.prismaMessage) errorMsg += ` | Msg: ${data.prismaMessage}`;
        if (data.finixError) errorMsg += ` | Finix Error: ${data.finixError}`;
        throw new Error(errorMsg);
      }

      toast.success("Application started!");
      setSubmittedApplicationId(data.applicationId);

      if (irsLetterFile) {
        const uploaded = await uploadIrsLetterFile(data.applicationId);
        // Whether the optional WGC-only document upload succeeded or
        // failed, the Finix onboarding submission above already
        // succeeded and must not be rolled back — only block navigation
        // when it failed, so the retry UI (rendered below) has a chance
        // to show.
        if (!uploaded) {
          setIsSubmitting(false);
          return;
        }
      }

      router.push(`/onboarding/success?applicationId=${data.applicationId}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  const continueToSuccess = () => {
    if (submittedApplicationId) router.push(`/onboarding/success?applicationId=${submittedApplicationId}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-4xl w-full mx-auto py-16 px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Payment rails for churches and nonprofits</h1>
          <p className="text-slate-600 max-w-2xl mx-auto mb-6 text-base">
            WGC Payments helps churches and nonprofits accept digital donations through our secure onboarding and payment infrastructure.
          </p>
          <div className="max-w-2xl mx-auto space-y-4">
            <p className="text-slate-600 bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm block">
              The information you provide will be used to verify your identity securely via API. Additional information may be requested. Reviews are typically completed within 48 hours, often quicker.
            </p>
            <div className="text-left text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="font-semibold text-slate-700 mb-2">Our partners require us to collect the following information to set up your processing account:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Business information:</strong> Data about your organization, such as your legal business name.</li>
                <li><strong>Owner information:</strong> Data about your organization&apos;s control person, such as their legal name and details.</li>
                <li><strong>Processing information:</strong> Processing details, such as historical or estimated volumes.</li>
                <li><strong>Bank account information:</strong> Details about your payout bank account for settlements.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          {submittedApplicationId && irsLetterUploadPhase === "failed" ? (
            <div className="text-center py-8">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Your application was submitted</h2>
              <p className="text-slate-600 mb-4">
                We could not upload your IRS determination letter. Your onboarding application was still submitted successfully — you can retry the
                document upload now or continue and add it later.
              </p>
              {irsLetterError && <p className="text-sm text-red-600 mb-4">{irsLetterError}</p>}
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => uploadIrsLetterFile(submittedApplicationId).then((ok) => ok && router.push(`/onboarding/success?applicationId=${submittedApplicationId}`))}
                  disabled={irsLetterUploadPhase === ("uploading" as typeof irsLetterUploadPhase)}
                  className="px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg disabled:opacity-50"
                >
                  Retry Upload
                </button>
                <button type="button" onClick={continueToSuccess} className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
                  Continue Without Document
                </button>
              </div>
            </div>
          ) : (
          <>
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div key={s} className={`h-2 flex-grow rounded-full ${step >= s ? 'bg-[#eab308]' : 'bg-slate-100'}`} />
            ))}
          </div>

          <form onSubmit={handleSubmit} onInvalidCapture={() => setAttemptedNext(true)} className={`space-y-6 ${attemptedNext ? "show-errors" : ""}`}>
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">1. Organization Information</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div><label className="block text-sm font-semibold mb-2">Legal Business Name</label><input required value={formData.legalBusinessName} onChange={(e) => updateField("legalBusinessName", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Doing Business As (DBA)</label><input value={formData.doingBusinessAs} onChange={(e) => updateField("doingBusinessAs", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Organization Type</label>
                    <select required value={formData.organizationType} onChange={(e) => updateField("organizationType", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308] bg-white">
                      <option value="Church">Church</option>
                      <option value="Nonprofit">Nonprofit</option>
                    </select>
                  </div>
                  <div><label className="block text-sm font-semibold mb-2">Business Tax ID (EIN)</label><input required value={formData.businessTaxId} onChange={(e) => updateField("businessTaxId", e.target.value.replace(/\D/g, ""))} pattern="\d{9}" maxLength={9} title="Tax ID must be exactly 9 digits" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Primary Contact Name</label><input required value={formData.contactName} onChange={(e) => updateField("contactName", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Primary Contact Email</label><input required type="email" value={formData.contactEmail} onChange={(e) => updateField("contactEmail", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Business Phone</label><input required type="tel" value={formData.businessPhone} onChange={(e) => updateField("businessPhone", e.target.value.replace(/\D/g, ""))} pattern="\d{10}" maxLength={10} title="Phone number must be exactly 10 digits" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Website</label>
                    <input required type="text" value={formData.website} onChange={(e) => updateField("website", e.target.value)} onBlur={(e) => updateField("website", normalizeWebsiteUrl(e.target.value))} placeholder="yourorganization.org" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" />
                    <p className="text-xs text-slate-500 mt-1">No need to type https:// — we&apos;ll add it automatically.</p>
                  </div>
                  <div className="md:col-span-2"><label className="block text-sm font-semibold mb-2">Address Line 1</label><input required value={formData.businessAddressLine1} onChange={(e) => updateField("businessAddressLine1", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div><label className="block text-sm font-semibold mb-2">City</label><input required value={formData.businessCity} onChange={(e) => updateField("businessCity", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">State</label>
                    <select required value={formData.businessState} onChange={(e) => updateField("businessState", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308] bg-white">
                      <option value="">Select a state</option>
                      {US_STATES.map((abbr) => (
                        <option key={abbr} value={abbr}>{abbr}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className="block text-sm font-semibold mb-2">ZIP Code</label><input required value={formData.businessPostalCode} onChange={(e) => updateField("businessPostalCode", e.target.value.replace(/\D/g, ""))} pattern="\d{5}" maxLength={5} title="Must be a 5-digit ZIP code" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Merchant Category Code (MCC)</label>
                    <select
                      required
                      value={formData.mcc}
                      onChange={(e) => updateField("mcc", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308] bg-white"
                    >
                      {MCC_OPTIONS.map((opt) => (
                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Select the category that best describes your organization&apos;s primary activity.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold mb-2">Statement Descriptor (Bank statement text)</label>
                    <input required value={formData.defaultStatementDescriptor} onChange={(e) => updateField("defaultStatementDescriptor", e.target.value)} maxLength={20} placeholder="e.g. GRACE CHURCH DONATE" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" />
                    <p className="text-xs text-slate-500 mt-1">This is exactly what your donors will see on their bank/card statement for each transaction — max 20 characters, letters and numbers only. Choose something donors will recognize (e.g. your organization&apos;s name).</p>
                  </div>
                  <div><label className="block text-sm font-semibold mb-2">Incorporation Year</label><input required type="number" placeholder="YYYY" min="1800" max={new Date().getFullYear()} value={formData.incorporationYear} onChange={(e) => updateField("incorporationYear", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  <div className="flex gap-4">
                    <div className="w-1/2"><label className="block text-sm font-semibold mb-2">Month</label><input required type="number" placeholder="MM" min="1" max="12" value={formData.incorporationMonth} onChange={(e) => updateField("incorporationMonth", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                    <div className="w-1/2"><label className="block text-sm font-semibold mb-2">Day</label><input required type="number" placeholder="DD" min="1" max="31" value={formData.incorporationDay} onChange={(e) => updateField("incorporationDay", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" /></div>
                  </div>
                  <div className="md:col-span-2"><label className="block text-sm font-semibold mb-2">Organization Description</label><textarea required maxLength={250} value={formData.businessDescription} onChange={(e) => updateField("businessDescription", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]" rows={3} /></div>
                  <div className="md:col-span-2 pt-4 border-t border-slate-100">
                    <label className="block text-sm font-semibold mb-2">501(c)(3) IRS Determination Letter</label>
                    <p className="text-xs text-slate-500 mb-2">
                      Upload your organization&apos;s IRS determination letter, if available. This document is stored securely for WGC review and is
                      not sent to the payment processor.
                    </p>
                    {irsLetterFile ? (
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
                        <span className="text-sm text-slate-700 truncate">{irsLetterFile.name}</span>
                        <button type="button" onClick={() => handleIrsLetterChange(null)} className="text-sm font-semibold text-red-600 hover:underline ml-3 shrink-0">
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                            <p className="mb-1 text-sm text-slate-600"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-slate-500">PDF, PNG, or JPG (max. 10MB)</p>
                          </div>
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="application/pdf,image/jpeg,image/png"
                            onChange={(e) => handleIrsLetterChange(e.target.files?.[0] || null)}
                          />
                        </label>
                      </div>
                    )}
                    {irsLetterError && <p className="text-xs text-red-600 mt-1">{irsLetterError}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Optional. PDF, JPG, JPEG, or PNG, up to 10MB.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">2. Processing Information</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div><label className="block text-sm font-semibold mb-2">Expected Annual Card Volume ($)</label><input required type="number" value={formData.annualCardVolume} onChange={(e) => updateField("annualCardVolume", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Expected Annual ACH Volume ($)</label><input required type="number" value={formData.annualAchVolume} onChange={(e) => updateField("annualAchVolume", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Average Card Donation ($)</label><input required type="number" value={formData.averageCardTransferAmount} onChange={(e) => updateField("averageCardTransferAmount", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Average ACH Donation ($)</label><input required type="number" value={formData.averageAchTransferAmount} onChange={(e) => updateField("averageAchTransferAmount", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Max Card Transaction ($)</label><input required type="number" value={formData.maxTransactionAmount} onChange={(e) => updateField("maxTransactionAmount", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Max ACH Transaction ($)</label><input required type="number" value={formData.achMaxTransactionAmount} onChange={(e) => updateField("achMaxTransactionAmount", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Refund Policy</label>
                    <select required value={formData.refundPolicy} onChange={(e) => updateField("refundPolicy", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none bg-white">
                      <option value="NO_REFUNDS">No Refunds</option>
                      <option value="MERCHANDISE_EXCHANGE_ONLY">Exchange Only</option>
                      <option value="WITHIN_30_DAYS">Within 30 Days</option>
                      <option value="OTHER">Other / Unrestricted</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Accepted Cards Previously?</label>
                    <select required value={formData.hasAcceptedCreditCardsPreviously ? "yes" : "no"} onChange={(e) => updateField("hasAcceptedCreditCardsPreviously", e.target.value === "yes")} className="w-full px-4 py-3 rounded-xl border outline-none bg-white">
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">3. Control Person</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div><label className="block text-sm font-semibold mb-2">First Name</label><input required value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Last Name</label><input required value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Title</label><input required value={formData.title} onChange={(e) => updateField("title", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Email</label><input required type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Phone</label><input required type="tel" value={formData.phone} onChange={(e) => updateField("phone", e.target.value.replace(/\D/g, ""))} pattern="\d{10}" maxLength={10} title="Phone number must be exactly 10 digits" className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">SSN / Tax ID</label><input required type="password" value={formData.taxId} onChange={(e) => updateField("taxId", e.target.value.replace(/\D/g, ""))} pattern="\d{9}" maxLength={9} title="Tax ID must be exactly 9 digits" className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">DOB Year</label><input required type="number" placeholder="YYYY" min="1900" max={new Date().getFullYear() - 18} title="Must be at least 18 years old" value={formData.dobYear} onChange={(e) => updateField("dobYear", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div className="flex gap-4">
                    <div className="w-1/2"><label className="block text-sm font-semibold mb-2">Month</label><input required type="number" placeholder="MM" min="1" max="12" value={formData.dobMonth} onChange={(e) => updateField("dobMonth", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                    <div className="w-1/2"><label className="block text-sm font-semibold mb-2">Day</label><input required type="number" placeholder="DD" min="1" max="31" value={formData.dobDay} onChange={(e) => updateField("dobDay", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  </div>
                  <div><label className="block text-sm font-semibold mb-2">Ownership Percentage (%)</label><input required type="number" max="100" value={formData.ownershipPercentage} onChange={(e) => updateField("ownershipPercentage", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div className="md:col-span-2"><label className="block text-sm font-semibold mb-2">Personal Address Line 1</label><input required value={formData.personalAddressLine1} onChange={(e) => updateField("personalAddressLine1", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">City</label><input required value={formData.personalCity} onChange={(e) => updateField("personalCity", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">State</label>
                    <select required value={formData.personalState} onChange={(e) => updateField("personalState", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none bg-white">
                      <option value="">Select a state</option>
                      {US_STATES.map((abbr) => (
                        <option key={abbr} value={abbr}>{abbr}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className="block text-sm font-semibold mb-2">ZIP Code</label><input required value={formData.personalPostalCode} onChange={(e) => updateField("personalPostalCode", e.target.value.replace(/\D/g, ""))} pattern="\d{5}" maxLength={5} title="Must be a 5-digit ZIP code" className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">4. Beneficial Owners</h2>
                <div className="mb-6 p-6 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="font-semibold text-slate-900 mb-4">Does this organization have any beneficial owners with 25% or more ownership or control?</p>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setHasBeneficialOwners(true)} className={`px-6 py-2 rounded-lg font-bold border ${hasBeneficialOwners === true ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>Yes</button>
                    <button type="button" onClick={() => setHasBeneficialOwners(false)} className={`px-6 py-2 rounded-lg font-bold border ${hasBeneficialOwners === false ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>No</button>
                  </div>
                </div>

                {hasBeneficialOwners && (
                  <div className="space-y-8">
                    {associatedOwners.map((owner, index) => (
                      <div key={index} className="p-6 border border-slate-200 rounded-xl relative">
                        <button type="button" onClick={() => removeAssociatedOwner(index)} className="absolute top-4 right-4 text-red-500 text-sm font-semibold">Remove</button>
                        <h3 className="font-bold mb-4">Owner {index + 1}</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div><label className="block text-sm font-semibold mb-2">First Name</label><input required value={owner.firstName} onChange={(e) => updateAssociatedOwner(index, "firstName", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div><label className="block text-sm font-semibold mb-2">Last Name</label><input required value={owner.lastName} onChange={(e) => updateAssociatedOwner(index, "lastName", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div><label className="block text-sm font-semibold mb-2">Email</label><input required type="email" value={owner.email} onChange={(e) => updateAssociatedOwner(index, "email", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div><label className="block text-sm font-semibold mb-2">Ownership %</label><input required type="number" min="25" max="100" value={owner.ownershipPercentage} onChange={(e) => updateAssociatedOwner(index, "ownershipPercentage", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div><label className="block text-sm font-semibold mb-2">SSN / Tax ID</label><input required type="password" value={owner.taxId} onChange={(e) => updateAssociatedOwner(index, "taxId", e.target.value.replace(/\D/g, ""))} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div className="flex gap-2 mt-1">
                            <input required type="number" placeholder="YYYY" min="1900" max={new Date().getFullYear() - 18} title="Must be at least 18 years old" value={owner.dobYear} onChange={(e) => updateAssociatedOwner(index, "dobYear", e.target.value)} className="w-1/3 px-4 py-2 rounded-lg border outline-none" />
                            <input required type="number" placeholder="MM" min="1" max="12" value={owner.dobMonth} onChange={(e) => updateAssociatedOwner(index, "dobMonth", e.target.value)} className="w-1/3 px-4 py-2 rounded-lg border outline-none" />
                            <input required type="number" placeholder="DD" min="1" max="31" value={owner.dobDay} onChange={(e) => updateAssociatedOwner(index, "dobDay", e.target.value)} className="w-1/3 px-4 py-2 rounded-lg border outline-none" />
                          </div>
                          <div className="md:col-span-2"><label className="block text-sm font-semibold mb-2">Address Line 1</label><input required value={owner.addressLine1} onChange={(e) => updateAssociatedOwner(index, "addressLine1", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div><label className="block text-sm font-semibold mb-2">City</label><input required value={owner.city} onChange={(e) => updateAssociatedOwner(index, "city", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                          <div>
                            <label className="block text-sm font-semibold mb-2">State</label>
                            <select required value={owner.state} onChange={(e) => updateAssociatedOwner(index, "state", e.target.value)} className="w-full px-4 py-2 rounded-lg border outline-none bg-white">
                              <option value="">Select a state</option>
                              {US_STATES.map((abbr) => (
                                <option key={abbr} value={abbr}>{abbr}</option>
                              ))}
                            </select>
                          </div>
                          <div><label className="block text-sm font-semibold mb-2">ZIP</label><input required value={owner.postalCode} onChange={(e) => updateAssociatedOwner(index, "postalCode", e.target.value.replace(/\D/g, ""))} className="w-full px-4 py-2 rounded-lg border outline-none" /></div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addAssociatedOwner} className="px-6 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-semibold w-full hover:bg-slate-50 transition-colors">+ Add Another Owner</button>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">5. Payout Bank</h2>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 text-amber-800 text-sm font-medium">
                  You agree to use this bank account for legitimate business purposes, and not for personal, family, or household purposes.
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div><label className="block text-sm font-semibold mb-2">Account Holder Name</label><input required value={formData.accountHolderName} onChange={(e) => updateField("accountHolderName", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Account Type</label>
                    <select required value={formData.accountType} onChange={(e) => updateField("accountType", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none bg-white">
                      <option value="BUSINESS_CHECKING">Business Checking</option>
                      <option value="BUSINESS_SAVINGS">Business Savings</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className="block text-sm font-semibold mb-2">Routing Number (9 digits)</label><input required type="text" maxLength={9} value={formData.routingNumber} onChange={(e) => updateField("routingNumber", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Account Number</label><input required type="password" value={formData.accountNumber} onChange={(e) => updateField("accountNumber", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                  <div><label className="block text-sm font-semibold mb-2">Confirm Account Number</label><input required type="text" value={formData.confirmAccountNumber} onChange={(e) => updateField("confirmAccountNumber", e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none" /></div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-xl font-bold text-slate-900 mb-6">6. Legal & Consent</h2>
                
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 mb-4">Legal Agreements</p>
                  <p className="text-sm text-slate-600 mb-4">
                    By continuing, I confirm I am authorized to act on behalf of this organization and agree to the WGC Payments Terms of Service, WGC Fee Schedule, WGC Privacy Policy, Finix Terms of Service, and Finix Privacy Policy.
                  </p>
                  
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer pb-3 mb-1 border-b border-slate-100">
                      <input
                        type="checkbox"
                        checked={Object.values(legal).every(Boolean)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setLegal({
                            wgcTerms: checked,
                            wgcFees: checked,
                            wgcPrivacy: checked,
                            finixTerms: checked,
                            finixPrivacy: checked,
                          });
                        }}
                        className="mt-1 w-4 h-4 text-[#eab308] rounded"
                      />
                      <span className="text-sm font-semibold text-slate-900">Select all</span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" required checked={legal.wgcTerms} onChange={(e) => updateLegal("wgcTerms", e.target.checked)} className="mt-1 w-4 h-4 text-[#eab308] rounded" />
                      <span className="text-sm text-slate-700">WGC Payments <a href="/legal/terms" target="_blank" className="text-blue-600 hover:underline">Terms of Service</a></span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" required checked={legal.wgcFees} onChange={(e) => updateLegal("wgcFees", e.target.checked)} className="mt-1 w-4 h-4 text-[#eab308] rounded" />
                      <span className="text-sm text-slate-700">WGC Payments <a href="/legal/fees" target="_blank" className="text-blue-600 hover:underline">Fee Schedule</a></span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" required checked={legal.wgcPrivacy} onChange={(e) => updateLegal("wgcPrivacy", e.target.checked)} className="mt-1 w-4 h-4 text-[#eab308] rounded" />
                      <span className="text-sm text-slate-700">WGC Payments <a href="/legal/privacy" target="_blank" className="text-blue-600 hover:underline">Privacy Policy</a></span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" required checked={legal.finixTerms} onChange={(e) => updateLegal("finixTerms", e.target.checked)} className="mt-1 w-4 h-4 text-[#eab308] rounded" />
                      <span className="text-sm text-slate-700">Finix <a href={process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix.com/terms"} target="_blank" className="text-blue-600 hover:underline">Terms of Service</a></span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" required checked={legal.finixPrivacy} onChange={(e) => updateLegal("finixPrivacy", e.target.checked)} className="mt-1 w-4 h-4 text-[#eab308] rounded" />
                      <span className="text-sm text-slate-700">Finix <a href={process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/privacy"} target="_blank" className="text-blue-600 hover:underline">Privacy Policy</a></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-8 border-t border-slate-100 mt-8">
              {step > 1 ? (
                <button type="button" onClick={prevStep} disabled={isSubmitting} className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              ) : <div></div>}

              {step < 6 ? (
                <button type="submit" onClick={() => setAttemptedNext(true)} disabled={step === 4 && hasBeneficialOwners === null} className="px-8 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="submit" onClick={() => setAttemptedNext(true)} disabled={isSubmitting || !Object.values(legal).every(Boolean)} className="px-8 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Secure Onboarding"}
                </button>
              )}
            </div>
          </form>
          </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
