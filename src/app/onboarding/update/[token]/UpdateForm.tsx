'use client';

import { useState } from 'react';
import { formFieldForRequest, type FormFieldKey, type UpdateDataRequest } from '@/lib/finix/parseVerificationOutcomes';

// Finix underwriting requests come in two shapes (see the "Requested Items"
// list above this form): "Upload File" (handled by the file input(s)
// below) and "Update Data" — a correction to a field on the merchant's
// Finix Identity (business DBA, business type/ownership type, MCC,
// email). Previously this form only had a single, unlabeled file input,
// so a merchant asked for a data correction had no way to submit it
// (2026-09-04 finding), and a merchant asked for TWO different documents
// at once had no way to say which upload was for which requirement
// (2026-09-04 follow-up finding) — Finix ties each document request to
// its own file_type (e.g. "ENHANCED_DUE_DILIGENCE_DOCUMENT"), and a
// single generic slot can't distinguish them.
//
// These fields map to Finix's real Identity.entity fields, confirmed
// against this same codebase's own onboarding-creation payload
// (src/app/api/onboarding/route.ts) rather than guessed: doing_business_as,
// business_type, mcc, email. All optional/blank-skippable — a merchant only
// fills in whatever their specific requested items actually asked for.
const BUSINESS_TYPE_OPTIONS = [
  { value: "", label: "No change" },
  { value: "TAX_EXEMPT_ORGANIZATION", label: "Tax-Exempt Organization (churches/nonprofits)" },
  { value: "CORPORATION", label: "Corporation" },
];

interface FileUploadRequest {
  fileType: string;
  message: string | null;
}

// A file input field name carries its Finix file_type directly
// (`file__<fileType>`) so the upload route can tag each upload with the
// exact type Finix asked for, without a second paired field to keep in
// sync — see extractFileUploadRequests()/the route's handling of this
// prefix.
const FILE_FIELD_PREFIX = 'file__';

function readableFileType(fileType: string): string {
  return fileType.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// Small badge shown next to an input Finix specifically asked about, so a merchant can see which fields matter.
function RequestedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800 align-middle">Requested</span>;
}

export default function UpdateForm({ token, fileUploadRequests, dataRequests = [] }: { token: string; fileUploadRequests: FileUploadRequest[]; dataRequests?: UpdateDataRequest[] }) {
  const requested = new Set<FormFieldKey>(dataRequests.map((d) => formFieldForRequest(d)).filter((k): k is FormFieldKey => k !== null));
  // Finix asked about something this form has no input for: list it and let the merchant describe the correction.
  const unmapped = dataRequests.filter((d) => formFieldForRequest(d) === null);
  // Show ONLY the inputs Finix asked about. If Finix sent no update-data requests at all (older applications, or a
  // request shape we couldn't read), fall back to showing every input so the merchant is never left without a way to answer.
  const showAll = dataRequests.length === 0;
  const show = (k: FormFieldKey) => showAll || requested.has(k);
  const [note, setNote] = useState("");
  // Replacement payout bank account. Held only in this component's state and the submit request, cleared after sending.
  const [bankHolderName, setBankHolderName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountNumberConfirm, setBankAccountNumberConfirm] = useState("");
  // Keyed by fileType (or "" for the generic single-slot fallback when
  // Finix didn't give us any typed FILE_UPLOAD outcomes at all).
  const [files, setFiles] = useState<Record<string, File>>({});
  const [doingBusinessAs, setDoingBusinessAs] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [mcc, setMcc] = useState("");
  const [email, setEmail] = useState("");
  // Other corrections Finix commonly asks for. The SSN lives only in this component's state and the
  // submit request: it is never persisted client-side, and is cleared as soon as it has been sent.
  const [website, setWebsite] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [principalSsn, setPrincipalSsn] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [removeOwnership, setRemoveOwnership] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    const selected = e.target.files?.[0];
    if (!selected) {
      setFiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(selected.type)) {
      setErrorMsg("Invalid file type. Only JPG, PNG, and PDF are allowed.");
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setErrorMsg("File too large. Maximum size is 10MB.");
      return;
    }

    setFiles((prev) => ({ ...prev, [key]: selected }));
  };

  const hasAnyFieldUpdate = Boolean(
    doingBusinessAs.trim() ||
      businessType ||
      mcc.trim() ||
      email.trim() ||
      website.trim() ||
      businessPhone.trim() ||
      principalSsn.trim() ||
      addressLine1.trim() ||
      addressLine2.trim() ||
      city.trim() ||
      state.trim() ||
      postalCode.trim() ||
      removeOwnership ||
      note.trim() ||
      bankHolderName.trim() ||
      bankAccountType ||
      bankRoutingNumber.trim() ||
      bankAccountNumber.trim() ||
      bankAccountNumberConfirm.trim(),
  );
  const hasAnyFile = Object.keys(files).length > 0;
  const canSubmit = Boolean(hasAnyFile || hasAnyFieldUpdate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setErrorMsg("Please provide the requested file(s) or fill in at least one field above.");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("token", token);
      for (const [key, file] of Object.entries(files)) {
        formData.append(`${FILE_FIELD_PREFIX}${key}`, file);
      }
      if (doingBusinessAs.trim()) formData.append("doingBusinessAs", doingBusinessAs.trim());
      if (businessType) formData.append("businessType", businessType);
      if (mcc.trim()) formData.append("mcc", mcc.trim());
      if (email.trim()) formData.append("email", email.trim());
      if (website.trim()) formData.append("website", website.trim());
      if (businessPhone.trim()) formData.append("businessPhone", businessPhone.trim());
      if (principalSsn.trim()) formData.append("principalSsn", principalSsn.trim());
      if (addressLine1.trim()) formData.append("addressLine1", addressLine1.trim());
      if (addressLine2.trim()) formData.append("addressLine2", addressLine2.trim());
      if (city.trim()) formData.append("city", city.trim());
      if (state.trim()) formData.append("state", state.trim());
      if (postalCode.trim()) formData.append("postalCode", postalCode.trim());
      if (removeOwnership) formData.append("removeOwnership", "true");
      if (note.trim()) formData.append("note", note.trim());
      if (bankHolderName.trim()) formData.append("bankHolderName", bankHolderName.trim());
      if (bankAccountType) formData.append("bankAccountType", bankAccountType);
      if (bankRoutingNumber.trim()) formData.append("bankRoutingNumber", bankRoutingNumber.trim());
      if (bankAccountNumber.trim()) formData.append("bankAccountNumber", bankAccountNumber.trim());
      if (bankAccountNumberConfirm.trim()) formData.append("bankAccountNumberConfirm", bankAccountNumberConfirm.trim());

      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      setPrincipalSsn("");
      setBankAccountNumber("");
      setBankAccountNumberConfirm("");
      if (data.success) {
        setSuccess(true);
      } else {
        setErrorMsg(data.error || "Failed to submit information.");
      }
    } catch {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center p-6 bg-green-50 rounded-xl border border-green-100 mt-6">
        <h3 className="text-lg font-bold text-green-900 mb-2">Submitted Successfully</h3>
        <p className="text-green-800">
          Your information has been submitted securely. We will notify you once the review is completed.
        </p>
      </div>
    );
  }

  // Each real FILE_UPLOAD outcome gets its own labeled slot; if Finix
  // didn't give us any typed outcomes at all (e.g. an older application
  // whose stored data predates the Verification-parsing fix), fall back
  // to one generic, unlabeled slot — same behavior as before this fix.
  const uploadSlots: FileUploadRequest[] = fileUploadRequests.length > 0 ? fileUploadRequests : [{ fileType: "", message: null }];

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="mb-6 space-y-4">
        {show('dba') && (
        <div>
          <label htmlFor="dba-input" className="block text-sm font-bold text-gray-700 mb-1">
            Doing Business As (DBA)<RequestedBadge show={requested.has('dba')} />
          </label>
          <input
            id="dba-input"
            type="text"
            value={doingBusinessAs}
            onChange={(e) => setDoingBusinessAs(e.target.value)}
            placeholder="Leave blank if not requested"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        )}

        {show('businessType') && (
        <div>
          <label htmlFor="business-type-select" className="block text-sm font-bold text-gray-700 mb-1">
            Ownership Type<RequestedBadge show={requested.has('businessType')} />
          </label>
          <select
            id="business-type-select"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        )}

        {show('mcc') && (
        <div>
          <label htmlFor="mcc-input" className="block text-sm font-bold text-gray-700 mb-1">
            Business MCC<RequestedBadge show={requested.has('mcc')} />
          </label>
          <input
            id="mcc-input"
            type="text"
            inputMode="numeric"
            value={mcc}
            onChange={(e) => setMcc(e.target.value)}
            placeholder="Leave blank if not requested"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        )}

        {show('email') && (
        <div>
          <label htmlFor="email-input" className="block text-sm font-bold text-gray-700 mb-1">
            Business Email<RequestedBadge show={requested.has('email')} />
          </label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Leave blank if not requested"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        )}

        {(showAll || requested.has('website') || requested.has('businessPhone') || requested.has('ssn') || requested.has('address') || requested.has('ownership')) && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-gray-800">Corrections requested</h4>
            <p className="text-xs text-gray-600">Please update the items below as listed in the requested items above.</p>
          </div>

          {show('website') && (
          <div>
            <label htmlFor="website-input" className="block text-sm font-bold text-gray-700 mb-1">Website or social page<RequestedBadge show={requested.has('website')} /></label>
            <input id="website-input" type="url" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourchurch.org" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          )}

          {show('businessPhone') && (
          <div>
            <label htmlFor="phone-input" className="block text-sm font-bold text-gray-700 mb-1">Business phone number<RequestedBadge show={requested.has('businessPhone')} /></label>
            <input id="phone-input" type="tel" inputMode="tel" autoComplete="tel" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="(816) 555-0142" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          )}

          {show('ssn') && (
          <div>
            <label htmlFor="ssn-input" className="block text-sm font-bold text-gray-700 mb-1">Principal&apos;s Social Security Number<RequestedBadge show={requested.has('ssn')} /></label>
            <input
              id="ssn-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              data-ph-no-capture
              value={principalSsn}
              onChange={(e) => setPrincipalSsn(e.target.value)}
              placeholder="___-__-____"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Use the principal&apos;s own SSN, not the organization&apos;s EIN. It is sent securely to our payment processor and is never stored by WGC.</p>
          </div>
          )}

          {show('address') && (
          <fieldset className="space-y-3">
            <legend className="block text-sm font-bold text-gray-700 mb-1">Principal&apos;s residential address<RequestedBadge show={requested.has('address')} /></legend>
            <input aria-label="Street address" autoComplete="address-line1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Street address" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input aria-label="Apartment, suite or unit" autoComplete="address-line2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Apt, suite (optional)" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-6 gap-3">
              <input aria-label="City" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="col-span-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input aria-label="State (2 letters)" autoComplete="address-level1" maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="MO" className="col-span-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input aria-label="ZIP code" autoComplete="postal-code" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="ZIP" className="col-span-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </fieldset>
          )}

          {show('ownership') && (
          <label className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={removeOwnership} onChange={(e) => setRemoveOwnership(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="font-bold">We are a nonprofit and have no owners.</span><RequestedBadge show={requested.has('ownership')} /> Remove the ownership percentage from the principal.
              <span className="block text-xs text-gray-500 mt-0.5">If other people are listed as owners, reply to our email and we will remove them for you.</span>
            </span>
          </label>
          )}
        </div>
        )}

        {show('bank') && (
          <div className="rounded-xl border border-gray-200 p-4 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Payout bank account<RequestedBadge show={requested.has('bank')} /></h4>
              <p className="text-xs text-gray-600">Enter the account where deposits should go. The numbers are sent securely to our payment processor and are never stored by WGC (we keep only the last 4 digits).</p>
            </div>
            <div>
              <label htmlFor="bank-name-input" className="block text-sm font-bold text-gray-700 mb-1">Name on the bank account</label>
              <input id="bank-name-input" autoComplete="off" value={bankHolderName} onChange={(e) => setBankHolderName(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="bank-type-select" className="block text-sm font-bold text-gray-700 mb-1">Account type</label>
              <select id="bank-type-select" value={bankAccountType} onChange={(e) => setBankAccountType(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Choose…</option>
                <option value="CHECKING">Checking</option>
                <option value="SAVINGS">Savings</option>
              </select>
            </div>
            <div>
              <label htmlFor="bank-routing-input" className="block text-sm font-bold text-gray-700 mb-1">Routing number</label>
              <input id="bank-routing-input" inputMode="numeric" autoComplete="off" maxLength={9} data-ph-no-capture value={bankRoutingNumber} onChange={(e) => setBankRoutingNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 digits" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="bank-account-input" className="block text-sm font-bold text-gray-700 mb-1">Account number</label>
              <input id="bank-account-input" type="password" inputMode="numeric" autoComplete="off" spellCheck={false} data-ph-no-capture value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="bank-account-confirm-input" className="block text-sm font-bold text-gray-700 mb-1">Confirm account number</label>
              <input id="bank-account-confirm-input" type="password" inputMode="numeric" autoComplete="off" spellCheck={false} data-ph-no-capture value={bankAccountNumberConfirm} onChange={(e) => setBankAccountNumberConfirm(e.target.value.replace(/\D/g, ''))} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          {unmapped.length > 0 && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-xs text-orange-900">
              <p className="font-bold mb-1">Our processor also asked about:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {unmapped.map((d, i) => (
                  <li key={i}>
                    <span className="font-semibold">{d.fieldName.replace(/_/g, ' ')}</span>
                    {d.message ? <> &mdash; {d.message}</> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-1">There is no box for these, so please describe the correction in the note below.</p>
            </div>
          )}
          <div>
            <label htmlFor="note-input" className="block text-sm font-bold text-gray-700 mb-1">Anything else we should know?</label>
            <textarea id="note-input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe any correction that has no box above, or explain a request. Please don't include your SSN or bank numbers here." className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        {uploadSlots.map((slot) => (
          <div key={slot.fileType}>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              {slot.fileType ? `Upload: ${readableFileType(slot.fileType)}` : 'Upload Document (PDF, JPG, PNG)'}
            </label>
            {slot.message && (
              <p className="text-xs text-gray-600 mb-2">{slot.message}</p>
            )}
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600 justify-center">
                  <label htmlFor={`file-upload-${slot.fileType}`} className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a file</span>
                    <input
                      id={`file-upload-${slot.fileType}`}
                      name={`file-upload-${slot.fileType}`}
                      type="file"
                      className="sr-only"
                      onChange={handleFileChange(slot.fileType)}
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  PDF, PNG, JPG up to 10MB — leave blank if this document wasn&apos;t requested
                </p>
              </div>
            </div>
            {files[slot.fileType] && (
              <div className="mt-3 text-sm text-gray-700 bg-white p-3 rounded shadow-sm border flex items-center justify-between">
                <span className="truncate max-w-[200px] sm:max-w-xs">{files[slot.fileType].name}</span>
                <span className="text-gray-500 text-xs">{(files[slot.fileType].size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || uploading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
      >
        {uploading ? "Submitting Securely..." : "Submit Required Information"}
      </button>
    </form>
  );
}
