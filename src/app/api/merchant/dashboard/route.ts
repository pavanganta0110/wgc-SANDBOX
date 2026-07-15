import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

/**
 * Basic dashboard summary for the logged-in church admin. Every query is
 * scoped to session.churchId — a church admin can never see another
 * church's data, this is not optional/toggleable.
 */
export async function GET() {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  if (!church) {
    return NextResponse.json({ error: "Church not found" }, { status: 404 });
  }

  const [grossVolumeAgg, recentTransfers, transactionCount, disputeCount] = await Promise.all([
    // Aggregate in DB — never load all transfers into memory
    prisma.finixTransfer.aggregate({
      where: { churchId: session.churchId, state: "SUCCEEDED" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.finixTransfer.findMany({
      where: { churchId: session.churchId },
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
    prisma.finixTransfer.count({ where: { churchId: session.churchId } }),
    prisma.finixDispute.count({ where: { churchId: session.churchId } }),
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
