import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { activatePayoutDestination } from "@/lib/organization/payoutDestinationActivation";

/**
 * Exception-path activation only — not a routine approval step. The normal
 * path (SUBMITTED -> PENDING_VERIFICATION -> UNDER_REVIEW -> APPROVED) is
 * fully automated via webhooks/reconciliation. This route exists because
 * there is no confirmed Finix API in this codebase to detect or trigger
 * "this instrument is now the active payout destination," so once an
 * account is APPROVED, WGC support confirms activation once out of band
 * (via the auto-created exception ticket) and calls this to finalize it.
 * An organization can go through this flow any number of times — every
 * previously active account is preserved as HISTORICAL, never deleted.
 *
 * Delegates the actual state transition to activatePayoutDestination(),
 * shared with the future automatic path so switching an already-verified
 * account still requires it to have gone through full review (status must
 * be APPROVED) — reactivating a HISTORICAL account is never a shortcut.
 */
export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const session = await getSession();
  if (!session || session.role !== "wgc_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await activatePayoutDestination(session.churchId, accountId, {
      userId: session.userId,
      email: session.email,
      role: session.role,
    });
    if (result.alreadyActive) {
      return NextResponse.json({ error: "This account is already active" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to activate payout account" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
