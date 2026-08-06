import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import StateBadge from "@/components/merchant/StateBadge";

/**
 * Read-only WGC support view of one organization's Aplos integration.
 * Deliberately has no retry/disconnect action — see the API route's header
 * comment for why. Server component (no client-side mutation needed).
 */
export default async function AdminMerchantAplosPage(props: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = await props.params;

  const [connection, records] = await Promise.all([
    prisma.aplosConnection.findUnique({
      where: { churchId },
      select: {
        status: true,
        automaticSyncEnabled: true,
        aplosOrganizationId: true,
        aplosOrganizationName: true,
        connectedAt: true,
        lastConnectionTestAt: true,
        lastSuccessfulSyncAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        disconnectedAt: true,
      },
    }),
    prisma.aplosSyncRecord.findMany({
      where: { churchId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        settlementId: true,
        status: true,
        attemptCount: true,
        syncedAt: true,
        blockedReason: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!connection) {
    return <p className="text-sm text-slate-500">This organization has not connected an Aplos account.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Connection</h3>
          <StateBadge state={connection.status} />
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-slate-500">Aplos organization</div>
          <div className="text-right font-medium text-slate-900">{connection.aplosOrganizationName || "—"}</div>
          <div className="text-slate-500">Automatic sync</div>
          <div className="text-right font-medium text-slate-900">{connection.automaticSyncEnabled ? "Enabled" : "Disabled"}</div>
          <div className="text-slate-500">Last successful sync</div>
          <div className="text-right font-medium text-slate-900">{connection.lastSuccessfulSyncAt ? new Date(connection.lastSuccessfulSyncAt).toLocaleString() : "Never"}</div>
          {connection.lastErrorMessage && (
            <>
              <div className="text-slate-500">Last error</div>
              <div className="text-right text-red-600 text-xs">{connection.lastErrorMessage}</div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Sync history</h3>
        {records.length === 0 ? (
          <p className="text-xs text-slate-400">No settlements have been synchronized to Aplos yet.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {records.map((r) => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StateBadge state={r.status} />
                    <span className="text-xs text-slate-500 font-mono">{r.settlementId || "—"}</span>
                  </div>
                  {(r.blockedReason || r.lastErrorMessage) && <p className="text-xs text-slate-500 max-w-xl">{r.blockedReason || r.lastErrorMessage}</p>}
                </div>
                <p className="text-xs text-slate-400 shrink-0">
                  {r.status === "SYNCED" && r.syncedAt ? `Synced ${new Date(r.syncedAt).toLocaleString()}` : new Date(r.updatedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
