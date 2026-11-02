"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2, Download } from "lucide-react";
import toast from "react-hot-toast";
import { DOCUMENT_ACCEPT_ATTRIBUTE, DOCUMENT_TYPES_LABEL, MAX_DOCUMENT_BYTES } from "@/lib/transactions/documents";

interface DocumentRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedByEmail: string | null;
  createdAt: string;
  canRemove: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Supporting documents on a transaction (audit evidence): list, attach, download, remove. */
export default function TransactionDocuments({ transferId }: { transferId: string }) {
  const base = `/api/merchant/transactions/payments/${encodeURIComponent(transferId)}/documents`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [canAttach, setCanAttach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Bumped to re-fetch the list after an upload/removal or a retry.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    fetch(base)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((json) => {
        if (cancelled) return;
        setDocuments(json.documents);
        setCanAttach(Boolean(json.canAttach));
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  async function upload(file: File) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error("File must be under 10MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(base, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      toast.success("Document attached");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Remove "${doc.fileName}" from this payment?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${doc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not remove the document.");
      toast.success("Document removed");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {loadFailed ? (
        <p className="text-sm text-red-600">
          Documents couldn&apos;t be loaded.{" "}
          <button type="button" onClick={reload} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : documents === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-slate-500">No documents attached.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex items-start gap-2 min-w-0">
                <FileText className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-700 break-words">{doc.fileName}</p>
                  <p className="text-xs text-slate-400">
                    {formatSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString("en-US")}
                    {doc.uploadedByEmail ? ` · ${doc.uploadedByEmail}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={`${base}/${doc.id}`}
                  className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                  aria-label={`Download ${doc.fileName}`}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                {doc.canRemove && (
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    disabled={busy}
                    aria-label={`Remove ${doc.fileName}`}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAttach && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={DOCUMENT_ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Paperclip className="w-4 h-4" /> {busy ? "Working…" : "Attach document"}
          </button>
          <p className="mt-1 text-xs text-slate-400">{DOCUMENT_TYPES_LABEL}, up to 10MB. Stored privately; only your team can open it.</p>
        </div>
      )}
    </div>
  );
}
