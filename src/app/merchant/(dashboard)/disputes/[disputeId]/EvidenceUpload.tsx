"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Upload, FileText, Trash2, Download, RotateCw, XCircle } from "lucide-react";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_FILES = 8;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB

type EvidenceItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedByEmail: string | null;
  submittedAt: Date | null;
  createdAt: Date;
};

type UploadTask = {
  clientId: string;
  file: File;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
};

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EvidenceUpload({
  disputeId,
  locked,
  evidence,
  submissionError,
  submissionRetryCount,
  canUpload,
  canDelete,
  canSubmit,
}: {
  disputeId: string;
  locked: boolean;
  evidence: EvidenceItem[];
  submissionError: string | null;
  submissionRetryCount: number;
  canUpload: boolean;
  canDelete: boolean;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalSize = evidence.reduce((sum, e) => sum + e.fileSize, 0);
  const remainingSlots = MAX_FILES - evidence.length;

  const startUpload = (file: File, clientId: string) => {
    setUploadTasks((prev) => prev.map((t) => (t.clientId === clientId ? { ...t, status: "uploading", progress: 0, error: undefined } : t)));

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/merchant/disputes/${disputeId}/evidence`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const progress = Math.round((e.loaded / e.total) * 100);
      setUploadTasks((prev) => prev.map((t) => (t.clientId === clientId ? { ...t, progress } : t)));
    };

    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error body, fall through to generic message
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadTasks((prev) => prev.filter((t) => t.clientId !== clientId));
        toast.success("Evidence uploaded");
        router.refresh();
      } else {
        const error = data?.error || "Upload failed";
        setUploadTasks((prev) => prev.map((t) => (t.clientId === clientId ? { ...t, status: "failed", error } : t)));
      }
    };

    xhr.onerror = () => {
      setUploadTasks((prev) =>
        prev.map((t) => (t.clientId === clientId ? { ...t, status: "failed", error: "Network error during upload" } : t))
      );
    };

    xhr.send(formData);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Only JPG, PNG, and PDF are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 1MB per file.");
      return;
    }
    if (evidence.length + uploadTasks.length >= MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} evidence files per dispute.`);
      return;
    }
    if (totalSize + file.size > MAX_TOTAL_SIZE) {
      toast.error("Combined evidence size cannot exceed 10MB.");
      return;
    }

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploadTasks((prev) => [...prev, { clientId, file, progress: 0, status: "uploading" }]);
    startUpload(file, clientId);
  };

  const handleRetryUpload = (task: UploadTask) => {
    startUpload(task.file, task.clientId);
  };

  const handleDismissFailedUpload = (clientId: string) => {
    setUploadTasks((prev) => prev.filter((t) => t.clientId !== clientId));
  };

  const handleDelete = async (evidenceId: string) => {
    if (!window.confirm("Remove this evidence file? This cannot be undone.")) return;
    setDeletingId(evidenceId);
    try {
      const res = await fetch(`/api/merchant/disputes/${disputeId}/evidence/${evidenceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to remove evidence");
      toast.success("Evidence removed");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove evidence");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmitResponse = async () => {
    if (evidence.length === 0) {
      toast.error("Upload at least one piece of evidence first.");
      return;
    }
    if (!window.confirm(`Submit ${evidence.length} evidence file${evidence.length === 1 ? "" : "s"} as your final response? This cannot be undone.`)) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/merchant/disputes/${disputeId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submission failed");
      toast.success(data.alreadySubmitted ? "Response already submitted" : "Response submitted");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (locked) {
    return (
      <div>
        {evidence.length > 0 && (
          <div className="space-y-2 mb-4">
            {evidence.map((item) => (
              <EvidenceRow key={item.id} disputeId={disputeId} item={item} locked />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Evidence Locked</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
        <span>
          {evidence.length} of {MAX_FILES} files uploaded
        </span>
        <span>
          {formatMB(totalSize)} of {formatMB(MAX_TOTAL_SIZE)} used
        </span>
      </div>

      {evidence.length === 0 && uploadTasks.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">No evidence uploaded yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {evidence.map((item) => (
            <EvidenceRow
              key={item.id}
              disputeId={disputeId}
              item={item}
              canDelete={canDelete}
              deleting={deletingId === item.id}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
          {uploadTasks.map((task) => (
            <div key={task.clientId} className="border border-slate-100 rounded-xl px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <p className="font-semibold text-slate-700 truncate">{task.file.name}</p>
                </div>
                {task.status === "failed" ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleRetryUpload(task)} className="p-1 text-blue-600 hover:text-blue-800" title="Retry upload">
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDismissFailedUpload(task.clientId)} className="p-1 text-slate-400 hover:text-slate-600" title="Dismiss">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 shrink-0">{task.progress}%</span>
                )}
              </div>
              {task.status === "uploading" ? (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${task.progress}%` }} />
                </div>
              ) : (
                <p className="mt-1 text-xs text-red-600">{task.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {submissionError && (
        <div className="mb-4 flex items-start justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-bold text-red-800">Submission Failed</p>
            <p className="text-xs text-red-700 mt-0.5">{submissionError}</p>
            {submissionRetryCount > 0 && (
              <p className="text-xs text-red-500 mt-0.5">
                {submissionRetryCount} attempt{submissionRetryCount === 1 ? "" : "s"} so far
              </p>
            )}
          </div>
          {canSubmit && (
            <button
              onClick={handleSubmitResponse}
              disabled={submitting}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Retrying…" : "Retry Submission"}
            </button>
          )}
        </div>
      )}

      {(canUpload || canSubmit) && (
        <div className="flex items-center gap-3">
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={handleFileSelected}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={remainingSlots <= 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Upload Evidence
              </button>
            </>
          )}
          {canSubmit && !submissionError && (
            <button
              onClick={handleSubmitResponse}
              disabled={submitting || evidence.length === 0}
              className="px-4 py-2 rounded-xl bg-[#eab308] text-[#010409] text-sm font-bold hover:bg-[#d4a106] disabled:opacity-50"
            >
              {submitting ? "Submitting Evidence…" : "Submit Response"}
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Up to {MAX_FILES} files, 1MB each (JPG, PNG, PDF). Submitting locks evidence from further changes.
      </p>
    </div>
  );
}

function EvidenceRow({
  disputeId,
  item,
  locked,
  canDelete,
  deleting,
  onDelete,
}: {
  disputeId: string;
  item: EvidenceItem;
  locked?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm border border-slate-100 rounded-xl px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-700 truncate">{item.fileName}</p>
          <p className="text-xs text-slate-400">
            {formatMB(item.fileSize)} · {item.uploadedByEmail || "—"} · {formatDateTime(item.createdAt)}
            {item.submittedAt && " · Submitted"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <a
          href={`/api/merchant/disputes/${disputeId}/evidence/${item.id}/download`}
          className="p-1.5 text-slate-400 hover:text-slate-700"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
        {!locked && canDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
