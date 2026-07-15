"use client";

import { useEffect, useState } from "react";

interface DocumentMeta {
  id: string;
  documentType: string;
  category: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  version: number;
  uploadedAt: string;
  uploadedByUserId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  internalReviewNotes: string | null;
  organizationFacingMessage: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_BADGE: Record<string, string> = {
  UPLOADED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  VERIFIED_BY_WGC: "bg-green-100 text-green-800",
  NEEDS_REPLACEMENT: "bg-orange-100 text-orange-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function IrsLetterReviewModal({
  applicationId,
  organizationName,
  onClose,
}: {
  applicationId: string;
  organizationName: string;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<DocumentMeta | null | undefined>(undefined);
  const [internalReviewNotes, setInternalReviewNotes] = useState("");
  const [organizationFacingMessage, setOrganizationFacingMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [accessing, setAccessing] = useState<"view" | "download" | null>(null);

  const load = () => {
    fetch(`/api/admin/onboarding-applications/${applicationId}/irs-letter/review`)
      .then((res) => res.json())
      .then((data) => {
        setDocument(data.document ?? null);
        setInternalReviewNotes(data.document?.internalReviewNotes || "");
        setOrganizationFacingMessage(data.document?.organizationFacingMessage || "");
      })
      .catch(() => setDocument(null));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const access = async (intent: "view" | "download") => {
    setAccessing(intent);
    try {
      const res = await fetch(`/api/admin/onboarding-applications/${applicationId}/irs-letter/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "This document is not available.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert(err.message || "This document is not available.");
    } finally {
      setAccessing(null);
    }
  };

  const review = async (status: string) => {
    setSaving(status);
    try {
      const res = await fetch(`/api/admin/onboarding-applications/${applicationId}/irs-letter/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, internalReviewNotes, organizationFacingMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "We could not save this review. Please try again.");
      load();
    } catch (err: any) {
      alert(err.message || "We could not save this review. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">501(c)(3) IRS Determination Letter</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
            Close
          </button>
        </div>

        {document === undefined && <p className="text-sm text-gray-500">Loading…</p>}

        {document === null && <p className="text-sm text-gray-500">No document has been uploaded for this application yet.</p>}

        {document && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500">Organization</span><span className="font-medium">{organizationName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Application ID</span><span className="font-mono text-xs">{applicationId}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">File Name</span><span className="font-medium truncate max-w-[240px]" title={document.originalFilename}>{document.originalFilename}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">File Type</span><span className="font-medium">{document.mimeType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">File Size</span><span className="font-medium">{formatSize(document.sizeBytes)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Uploaded</span><span className="font-medium">{new Date(document.uploadedAt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="font-medium">v{document.version}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Review Status</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[document.status] || "bg-gray-100 text-gray-800"}`}>{document.status}</span>
              </div>
              {document.reviewedAt && <div className="flex justify-between"><span className="text-gray-500">Last Reviewed</span><span className="font-medium">{new Date(document.reviewedAt).toLocaleString()}</span></div>}
            </div>

            <div className="flex gap-2">
              <button onClick={() => access("view")} disabled={accessing !== null} className="flex-1 text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg disabled:opacity-50">
                {accessing === "view" ? "Generating link…" : "View"}
              </button>
              <button onClick={() => access("download")} disabled={accessing !== null} className="flex-1 text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg disabled:opacity-50">
                {accessing === "download" ? "Generating link…" : "Download"}
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Internal Review Note (WGC Admin only)</label>
              <textarea value={internalReviewNotes} onChange={(e) => setInternalReviewNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Organization-Facing Message</label>
              <textarea value={organizationFacingMessage} onChange={(e) => setOrganizationFacingMessage(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" placeholder="Shown to the organization if applicable" />
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button onClick={() => review("VERIFIED_BY_WGC")} disabled={saving !== null} className="flex-1 text-xs font-semibold bg-green-100 hover:bg-green-200 text-green-800 px-2 py-2 rounded disabled:opacity-50">
                {saving === "VERIFIED_BY_WGC" ? "Saving…" : "Verified by WGC"}
              </button>
              <button onClick={() => review("NEEDS_REPLACEMENT")} disabled={saving !== null} className="flex-1 text-xs font-semibold bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-2 rounded disabled:opacity-50">
                {saving === "NEEDS_REPLACEMENT" ? "Saving…" : "Needs Replacement"}
              </button>
              <button onClick={() => review("REJECTED")} disabled={saving !== null} className="flex-1 text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-800 px-2 py-2 rounded disabled:opacity-50">
                {saving === "REJECTED" ? "Saving…" : "Rejected"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
