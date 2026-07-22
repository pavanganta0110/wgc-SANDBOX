"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmailComposer({
  users,
  churchId,
}: {
  users: { id: string; email: string; name: string | null }[];
  churchId: string;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("SUPPORT");
  const [internalReason, setInternalReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/support/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          message,
          type,
          internalReason,
          churchId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to send email");
      }

      setSuccess(true);
      setTo("");
      setSubject("");
      setMessage("");
      setInternalReason("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 shadow rounded-lg mb-8">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Admin Support Email Composer
      </h3>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      {success && (
        <div className="text-green-500 mb-4">Email sent successfully!</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">To</label>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          >
            <option value="" disabled>
              Select a user...
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name ? `${u.name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={4}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          >
            <option value="SUPPORT">Support</option>
            <option value="NOTICE">Notice</option>
            <option value="COMPLIANCE">Compliance</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Internal Reason (optional)
          </label>
          <input
            type="text"
            value={internalReason}
            onChange={(e) => setInternalReason(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            placeholder="e.g. Following up on ticket #1234"
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Email"}
          </button>
        </div>
      </form>
    </div>
  );
}
