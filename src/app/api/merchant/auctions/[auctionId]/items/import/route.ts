import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { parseItemCsv } from "@/lib/auctions/itemImport";

/**
 * Adds many items from a CSV. With `dryRun` it only checks the file and reports problems by row number; without it,
 * it adds every item or none (a file with any problem adds nothing).
 */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "SETTLED") return validationError("This auction is finished.", 409);

  const body = await req.json().catch(() => ({}));
  if (typeof body.csv !== "string" || body.csv.length > 1_500_000) return validationError("Choose a CSV file.");
  const { rows, errors } = parseItemCsv(body.csv);
  if (errors.length > 0) return NextResponse.json({ ok: false, count: rows.length, errors: errors.slice(0, 50) });
  if (body.dryRun) return NextResponse.json({ ok: true, count: rows.length, errors: [] });

  const top = await prisma.auctionItem.aggregate({ where: { auctionId }, _max: { itemNumber: true } });
  const first = (top._max.itemNumber ?? 0) + 1;
  try {
    await prisma.auctionItem.createMany({
      data: rows.map((row, index) => ({
        ...row, churchId: auth.churchId, auctionId, itemNumber: first + index, sortOrder: first + index, endsAt: auction.endsAt,
        status: auction.format === "LIVE" ? "UPCOMING" : "OPEN",
      })),
    });
  } catch (err) {
    // Someone added an item at the same moment and took a number: nothing was added, so it is safe to try again.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return validationError("Items were being added at the same time. Please try the import again.", 409);
    throw err;
  }
  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.items_imported", entityType: "auction", entityId: auction.id, metadata: { count: rows.length }, req });
  return NextResponse.json({ ok: true, count: rows.length, errors: [] });
}
