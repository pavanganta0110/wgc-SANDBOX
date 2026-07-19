import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";

/**
 * Basic dashboard summary for the logged-in church admin. Every query is
 * scoped to auth.churchId — a church admin can never see another
 * church's data, this is not optional/toggleable.
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });

  if (!church) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  const [grossVolumeAgg, recentTransfers, transactionCount, disputeCount] = await Promise.all([
    // Aggregate in DB — never load all transfers into memory
    prisma.finixTransfer.aggregate({
      where: { churchId: auth.churchId, state: "SUCCEEDED" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.finixTransfer.findMany({
      where: { churchId: auth.churchId },
      orderBy: { createdAtFinix: "desc" },
      take: 10,
      select: {
        finixTransferId: true,
        type: true,
        state: true,
        amountCents: true,
        currency: true,
        createdAtFinix: true,
      },
    }),
    prisma.finixTransfer.count({ where: { churchId: auth.churchId } }),
    prisma.finixDispute.count({ where: { churchId: auth.churchId } }),
  ]);

  const grossVolumeCents = grossVolumeAgg._sum.amountCents ?? 0;
  const succeededCount = grossVolumeAgg._count._all;

  return NextResponse.json({
    church: { name: church.name, status: church.status },
    stats: {
      grossVolumeCents,
      transactionCount,
      succeededCount,
      disputeCount,
    },
    recentTransactions: recentTransfers,
  });
}
