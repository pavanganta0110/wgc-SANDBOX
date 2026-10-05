import { prisma } from "@/lib/prisma";

/**
 * Powers the "Active Now" count on System Health — see
 * getActiveUsersNow() in overviewStats.ts. Called from the two
 * centralized auth entry points (requireMerchantSession(),
 * getAdminSession()) on every successful authenticated request, but
 * throttled at the database level so it's actually at most one write per
 * user every ACTIVITY_THROTTLE_MS: the WHERE clause only matches a row
 * whose lastActiveAt is null or already stale, so a user making 50
 * requests in a row still produces at most one UPDATE.
 *
 * Deliberately fire-and-forget and never allowed to throw back into an
 * auth check — activity tracking failing must never be the reason someone
 * can't log in or use the app. Callers should invoke this as
 * `void touchUserActivity(userId)`, never `await` it, so a slow write can
 * never add latency to the request that triggered it.
 */
const ACTIVITY_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes

export async function touchUserActivity(userId: string): Promise<void> {
  try {
    const staleBefore = new Date(Date.now() - ACTIVITY_THROTTLE_MS);
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: staleBefore } }] },
      data: { lastActiveAt: new Date() },
    });
  } catch (err) {
    console.error("[touchUserActivity] failed to record activity:", err);
  }
}
