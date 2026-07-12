"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Upload, FileText } from "lucide-react";

interface Document {
  id: string;
  label: string | null;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PayoutAccountDocumentsUpload({ accountId }: { accountId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/organization/bank-account/${accountId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (label.trim()) formData.append("label", label.trim());
      const res = await fetch(`/api/merchant/organization/bank-account/${accountId}/documents`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload document");
      toast.success("Document uploaded");
      setLabel("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-red-100">
      <p className="text-xs font-semibold text-slate-600 mb-2">Upload Documents</p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
          placeholder="What is this document? (e.g. Voided Check)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          id={`payout-doc-upload-${accountId}`}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <label
          htmlFor={`payout-doc-upload-${accountId}`}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 whitespace-nowrap ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Choose File"}
        </label>
      </div>
      {!loading && documents.length > 0 && (
        <div className="space-y-1">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 text-xs text-slate-600">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              {doc.label ? `${doc.label} — ` : ""}
              {doc.fileName} ({formatSize(doc.fileSize)})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
