"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, FileText } from "lucide-react";
import type { ComplianceStatus } from "@/lib/finix/sync/complianceForms";

interface ComplianceFormData {
  id: string;
  type: string;
  state: string;
  dueAt: string | null;
  validUntil: string | null;
  unsignedFileId: string | null;
  signedFileId: string | null;
  signeeName: string | null;
  signeeTitle: string | null;
  signedAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function ComplianceAttestationForm({
  form,
  status,
}: {
  form: ComplianceFormData | null;
  status: ComplianceStatus;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(status.isComplete);

  if (!form) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-sm text-slate-500">
          No compliance form is on file yet. This is issued automatically shortly after your account is
          approved — check back soon.
        </p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h3 className="text-sm font-bold text-green-800">Compliance Attestation Complete</h3>
        </div>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-slate-500">Signed by</dt>
          <dd className="text-slate-900 font-medium">{form.signeeName} ({form.signeeTitle})</dd>
          <dt className="text-slate-500">Signed on</dt>
          <dd className="text-slate-900 font-medium">{formatDate(form.signedAt)}</dd>
          <dt className="text-slate-500">Valid until</dt>
          <dd className="text-slate-900 font-medium">{formatDate(form.validUntil)}</dd>
        </dl>
        {form.signedFileId && (
          <a
            href={`/api/files/${form.signedFileId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <FileText className="w-4 h-4" />
            View signed PDF
          </a>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !title.trim()) {
      toast.error("Name and title are required");
      return;
    }
    if (!accepted) {
      toast.error("You must accept the attestation to continue");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/compliance/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), title: title.trim(), isAccepted: accepted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit attestation");
      toast.success("Compliance attestation submitted");
      setCompleted(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit attestation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <dl className="grid grid-cols-2 gap-y-3 text-sm mb-6">
        <dt className="text-slate-500">Form type</dt>
        <dd className="text-slate-900 font-medium">{form.type.replace(/_/g, " ")}</dd>
        <dt className="text-slate-500">Status</dt>
        <dd className={`font-medium ${status.isOverdue ? "text-red-600" : "text-amber-600"}`}>{form.state}</dd>
        <dt className="text-slate-500">Due</dt>
        <dd className="text-slate-900 font-medium">{formatDate(form.dueAt)}</dd>
      </dl>

      {form.unsignedFileId && (
        <a
          href={`/api/files/${form.unsignedFileId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 mb-6 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          <FileText className="w-4 h-4" />
          Review the SAQ before signing
        </a>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Job title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
            placeholder="Executive Director"
          />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5"
          />
          I have reviewed the PCI Self-Assessment Questionnaire above and attest, on behalf of this organization,
          that its answers are accurate.
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Sign & Submit Attestation"}
        </button>
      </form>
    </div>
  );
}
