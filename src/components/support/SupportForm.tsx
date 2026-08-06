"use client";

import { useState } from "react";

const SUPPORT_CATEGORIES = [
  "Subscription and billing",
  "Account access",
  "Payment issue",
  "Settlement or deposit",
  "Refund",
  "Technical issue",
  "Cancellation request",
  "Other",
];

export default function SupportForm({ initialCategory }: { initialCategory?: string }) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    organizationName: "",
    merchantId: "",
    category: initialCategory && SUPPORT_CATEGORIES.includes(initialCategory) ? initialCategory : "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send your message.");
      setStatus("success");
      setValues({ fullName: "", email: "", organizationName: "", merchantId: "", category: "", subject: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">Message sent.</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">Our support team will respond within one business day.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-6 text-xs font-bold uppercase tracking-widest text-[#eab308] hover:text-amber-600"
        >
          Send another message
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="support-full-name" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Full name
          </label>
          <input
            id="support-full-name"
            required
            value={values.fullName}
            onChange={(e) => updateField("fullName", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="support-email" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Email address
          </label>
          <input
            id="support-email"
            type="email"
            required
            value={values.email}
            onChange={(e) => updateField("email", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="support-org" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Organization name
          </label>
          <input
            id="support-org"
            value={values.organizationName}
            onChange={(e) => updateField("organizationName", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="support-merchant-id" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Merchant ID <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="support-merchant-id"
            value={values.merchantId}
            onChange={(e) => updateField("merchantId", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="support-category" className="block text-xs font-semibold text-slate-600 mb-1.5">
          Support category
        </label>
        <select
          id="support-category"
          required
          value={values.category}
          onChange={(e) => updateField("category", e.target.value)}
          className={`${inputClass} bg-white`}
        >
          <option value="" disabled>
            Select a category
          </option>
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="support-subject" className="block text-xs font-semibold text-slate-600 mb-1.5">
          Subject
        </label>
        <input
          id="support-subject"
          required
          value={values.subject}
          onChange={(e) => updateField("subject", e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="support-message" className="block text-xs font-semibold text-slate-600 mb-1.5">
          Message
        </label>
        <textarea
          id="support-message"
          required
          rows={5}
          value={values.message}
          onChange={(e) => updateField("message", e.target.value)}
          className={inputClass}
        />
      </div>

      {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
