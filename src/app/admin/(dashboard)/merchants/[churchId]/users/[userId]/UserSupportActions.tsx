"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UserSupportActions({
  user,
  churchId,
}: {
  user: any;
  churchId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAction = async (actionType: string, extraData: any = {}) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/support/actions/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          churchId,
          actionType,
          ...extraData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setSuccess(data.message || "Action successful");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onDisable = () => {
    const reason = prompt("Enter reason for disabling this user:");
    if (reason) handleAction("DISABLE", { reason });
  };

  const onReactivate = () => {
    const reason = prompt("Enter reason for reactivating this user:");
    if (reason) handleAction("REACTIVATE", { reason });
  };

  const onCorrectProfile = () => {
    const name = prompt("Enter new name:", user.name || "");
    const email = prompt("Enter new email:", user.email || "");
    if (name && email) handleAction("CORRECT_PROFILE", { name, email });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border mt-6">
      <h3 className="text-lg font-bold mb-4 text-red-600">
        WGC Support Actions
      </h3>
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 text-sm text-green-600 bg-green-50 p-2 rounded">
          {success}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {user.setPasswordTokenHash && (
          <button
            onClick={() => handleAction("RESEND_INVITE")}
            disabled={loading}
            className="px-4 py-2 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 disabled:opacity-50 text-sm font-medium"
          >
            Resend Invitation
          </button>
        )}
        <button
          onClick={() => handleAction("RESEND_PASSWORD_RESET")}
          disabled={loading}
          className="px-4 py-2 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 disabled:opacity-50 text-sm font-medium"
        >
          Resend Password Reset
        </button>
        <button
          onClick={() => handleAction("REVOKE_SESSIONS")}
          disabled={loading}
          className="px-4 py-2 bg-orange-50 text-orange-700 rounded border border-orange-200 hover:bg-orange-100 disabled:opacity-50 text-sm font-medium"
        >
          Revoke Sessions
        </button>
        <button
          onClick={onCorrectProfile}
          disabled={loading}
          className="px-4 py-2 bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-sm font-medium"
        >
          Correct Profile
        </button>

        {user.disabledAt ? (
          <button
            onClick={onReactivate}
            disabled={loading}
            className="px-4 py-2 bg-green-50 text-green-700 rounded border border-green-200 hover:bg-green-100 disabled:opacity-50 text-sm font-medium"
          >
            Reactivate User
          </button>
        ) : (
          <button
            onClick={onDisable}
            disabled={loading}
            className="px-4 py-2 bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100 disabled:opacity-50 text-sm font-medium"
          >
            Disable User
          </button>
        )}
        <button
          onClick={() => handleAction("UNLOCK")}
          disabled={loading}
          className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded border border-yellow-200 hover:bg-yellow-100 disabled:opacity-50 text-sm font-medium"
        >
          Unlock User
        </button>
      </div>
    </div>
  );
}
