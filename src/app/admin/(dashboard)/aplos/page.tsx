import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import StateBadge from "@/components/merchant/StateBadge";

/**
 * Platform-wide Aplos sync triage — every organization's NEEDS_REVIEW and
 * FAILED sync records in one place, so WGC support can proactively reach
 * out. Read-only by design; see the API route's header comment for why no
 * action lives here.
 */
export default async function AdminAplosPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const records = await prisma.aplosSyncRecord.findMany({
    where: { status: { in: ["NEEDS_REVIEW", "FAILED"] } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      churchId: true,
      settlementId: true,
      status: true,
      attemptCount: true,
      blockedReason: true,
      lastErrorMessage: true,
      updatedAt: true,
    },
  });

  const churchIds = [...new Set(records.map((r) => r.churchId))];
  const churches = churchIds.length ? await prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }) : [];
  const churchNameById = new Map(churches.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aplos Sync Triage</h1>
        <p className="text-sm text-slate-500 mt-1">
          Settlements needing manual review or that failed to synchronize, across every organization. A NEEDS_REVIEW
          record can only be resolved by the organization verifying directly in their own Aplos account — this view
          is for proactive outreach, not action.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {records.length === 0 ? (
          <p className="text-sm text-slate-400 p-6">Nothing needs attention right now.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {records.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StateBadge state={r.status} />
                    <Link href={`/admin/merchants/${r.churchId}/aplos`} className="text-sm font-semibold text-slate-900 hover:underline">
                      {churchNameById.get(r.churchId) ?? "Unknown organization"}
                    </Link>
                    <span className="text-xs text-slate-500 font-mono">{r.settlementId || "—"}</span>
                  </div>
                  {(r.blockedReason || r.lastErrorMessage) && <p className="text-xs text-slate-500 max-w-2xl">{r.blockedReason || r.lastErrorMessage}</p>}
                </div>
                <p className="text-xs text-slate-400 shrink-0">{new Date(r.updatedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
