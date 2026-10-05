'use client';

import { useState } from 'react';

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

export default function UpdateForm({ token, fileUploadRequests }: { token: string; fileUploadRequests: FileUploadRequest[] }) {
  // Keyed by fileType (or "" for the generic single-slot fallback when
  // Finix didn't give us any typed FILE_UPLOAD outcomes at all).
  const [files, setFiles] = useState<Record<string, File>>({});
  const [doingBusinessAs, setDoingBusinessAs] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [mcc, setMcc] = useState("");
  const [email, setEmail] = useState("");
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

  const hasAnyFieldUpdate = Boolean(doingBusinessAs.trim() || businessType || mcc.trim() || email.trim());
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

      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

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
        <div>
          <label htmlFor="dba-input" className="block text-sm font-bold text-gray-700 mb-1">
            Doing Business As (DBA)
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

        <div>
          <label htmlFor="business-type-select" className="block text-sm font-bold text-gray-700 mb-1">
            Ownership Type
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

        <div>
          <label htmlFor="mcc-input" className="block text-sm font-bold text-gray-700 mb-1">
            Business MCC
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

        <div>
          <label htmlFor="email-input" className="block text-sm font-bold text-gray-700 mb-1">
            Business Email
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
