"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FileText, Upload } from "lucide-react";

interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  uploadStatus: string;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPanel({ canUpload }: { canUpload: boolean }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/merchant/organization/documents");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDocuments(data.documents);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/merchant/organization/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload document");
      toast.success("Document uploaded");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      {canUpload && (
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            id="org-document-upload"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <label
            htmlFor="org-document-upload"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload Document"}
          </label>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 flex items-center gap-2">
          Failed to load documents.
          <button onClick={load} className="font-semibold text-blue-600 hover:underline">Retry</button>
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No documents on file yet.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{doc.fileName}</div>
                  <div className="text-xs text-slate-500">{formatSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
