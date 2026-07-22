"use client";

import { useState } from "react";

export default function InquiryForm() {
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    role: "Software Partner (ISV)",
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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send inquiry");
      setStatus("success");
      setValues({ firstName: "", lastName: "", email: "", phone: "", company: "", role: "Software Partner (ISV)", message: "" });
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to send inquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <h3 className="text-2xl font-bold text-wgc-navy-900 mb-3">Inquiry received.</h3>
        <p className="text-wgc-navy-400 font-medium max-w-sm">
          Thanks for reaching out — our team will respond within one business day.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-8 text-xs font-bold uppercase tracking-widest text-wgc-gold-600 hover:text-wgc-gold-700"
        >
          Submit another inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div>
          <label htmlFor="first-name" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">First name</label>
          <div className="mt-1">
            <input
              type="text"
              name="first-name"
              id="first-name"
              required
              value={values.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
            />
          </div>
        </div>
        <div>
          <label htmlFor="last-name" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Last name</label>
          <div className="mt-1">
            <input
              type="text"
              name="last-name"
              id="last-name"
              required
              value={values.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div>
          <label htmlFor="email" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Email</label>
          <div className="mt-1">
            <input
              type="email"
              name="email"
              id="email"
              required
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
            />
          </div>
        </div>
        <div>
          <label htmlFor="phone" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Phone Number</label>
          <div className="mt-1">
            <input
              type="tel"
              name="phone"
              id="phone"
              value={values.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="company" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Organization</label>
        <div className="mt-1">
          <input
            type="text"
            name="company"
            id="company"
            value={values.company}
            onChange={(e) => updateField("company", e.target.value)}
            className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="role" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Organization Type</label>
        <div className="mt-1">
          <select
            id="role"
            name="role"
            value={values.role}
            onChange={(e) => updateField("role", e.target.value)}
            className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat"
          >
            <option>Church</option>
            <option>Nonprofit</option>
            <option>Software Partner (ISV)</option>
            <option>Financial Institution</option>
            <option>Ministry Network</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="message" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Platform Requirements</label>
        <div className="mt-1">
          <textarea
            id="message"
            name="message"
            rows={5}
            required
            value={values.message}
            onChange={(e) => updateField("message", e.target.value)}
            placeholder="Briefly describe your current donation needs..."
            className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900"
          />
        </div>
      </div>

      {status === "error" && (
        <p className="text-sm font-semibold text-red-600">{errorMessage}</p>
      )}

      <div className="pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-wgc-gold-500 text-wgc-navy-900 py-5 px-8 text-sm font-bold rounded-xl hover:bg-black hover:text-wgc-navy-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl uppercase tracking-[0.2em] disabled:opacity-50 disabled:hover:scale-100"
        >
          {submitting ? "Sending…" : "Dispatch Inquiry"}
        </button>
      </div>
    </form>
  );
}
