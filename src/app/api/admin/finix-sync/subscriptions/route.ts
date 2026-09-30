import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Subscriptions sync is intentionally disabled until Finix confirms this
 * account has the Subscriptions feature enabled (per Finix docs, it may
 * require additional pricing/enablement). Flip
 * FINIX_SUBSCRIPTIONS_SYNC_ENABLED=true only after that's confirmed AND
 * src/lib/finix/sync/syncSubscriptions.ts is implemented against a real
 * Finix subscription response.
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (process.env.FINIX_SUBSCRIPTIONS_SYNC_ENABLED !== "true") {
    return NextResponse.json(
      {
        error:
          "Subscriptions sync is disabled. Confirm Finix Subscriptions enablement first, " +
          "then set FINIX_SUBSCRIPTIONS_SYNC_ENABLED=true.",
      },
      { status: 501 }
    );
  }

  return NextResponse.json(
    { error: "Subscriptions sync is not implemented yet — see src/lib/finix/sync/syncSubscriptions.ts" },
    { status: 501 }
  );
}
