"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteNewMember({ churchId }: { churchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onInvite = async () => {
    const email = prompt("Enter the new team member's email address:");
    if (!email) return;
    const role = prompt("Enter role (admin, fundraiser, or viewer):", "admin");
    if (!role) return;
    const reason = prompt("Enter reason for this invitation:");
    if (!reason) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/users/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      setSuccess(data.message || "Invitation sent");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={onInvite}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        Invite New Member
      </button>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {success && <div className="text-xs text-green-600">{success}</div>}
    </div>
  );
}
