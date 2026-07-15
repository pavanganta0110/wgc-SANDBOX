"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/support/ticketCategories";

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

export default function NewTicketForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category");
  const validInitialCategory = TICKET_CATEGORIES.some((c) => c.value === initialCategory) ? initialCategory! : "OTHER";

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(validInitialCategory);
  const [priority, setPriority] = useState("NORMAL");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, priority, description, contactEmail: contactEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ticket");
      toast.success("Support ticket created");
      router.push(`/merchant/support/tickets/${data.ticket.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
        <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of your issue" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
        <textarea className={inputClass} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened, including any relevant IDs" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Contact Email (optional)</label>
        <input type="email" className={inputClass} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Defaults to your account email" />
      </div>
      <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit Ticket"}
      </button>
    </div>
  );
}
