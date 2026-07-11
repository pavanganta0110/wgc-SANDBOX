import { formatCents } from "@/lib/format";
import type { DisputeDisplayStatus } from "@/lib/finix/disputeStatus";

export default function DisputeFinancialImpactCard({
  originalAmountCents,
  disputedAmountCents,
  displayStatus,
}: {
  originalAmountCents: number | null;
  disputedAmountCents: number | null;
  displayStatus: DisputeDisplayStatus;
}) {
  const isWon = displayStatus === "WON";
  const isLost = displayStatus === "LOST";
  const isResolved = isWon || isLost || displayStatus === "ACCEPTED" || displayStatus === "CLOSED";

  // While unresolved, the disputed amount is both the church's current
  // exposure and its potential loss if the dispute is lost. Once resolved,
  // exposure/potential-loss collapse into a single resolution outcome.
  const currentExposureCents = isResolved ? 0 : (disputedAmountCents ?? 0);
  const potentialLossCents = isResolved ? 0 : (disputedAmountCents ?? 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4">Financial Impact</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Original Payment</p>
          <p className="text-lg font-bold text-slate-900">{formatCents(originalAmountCents ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Disputed Amount</p>
          <p className="text-lg font-bold text-slate-900">{formatCents(disputedAmountCents ?? 0)}</p>
        </div>
        {!isResolved && (
          <>
            <div>
              <p className="text-xs text-slate-500 mb-1">Current Exposure</p>
              <p className="text-lg font-bold text-amber-700">{formatCents(currentExposureCents)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Potential Loss</p>
              <p className="text-lg font-bold text-red-700">{formatCents(potentialLossCents)}</p>
            </div>
          </>
        )}
      </div>

      {isWon && (
        <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
          <span className="text-sm font-bold text-green-800">Funds Restored</span>
        </div>
      )}
      {isLost && (
        <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <span className="text-sm font-bold text-red-800">Funds Permanently Deducted</span>
        </div>
      )}
    </div>
  );
}
