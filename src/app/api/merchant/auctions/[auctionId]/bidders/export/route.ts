import { prisma } from "@/lib/prisma";
import { buildCsvExport, csvResponse } from "@/lib/csvExport";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";

/** Everyone who registered for this auction, as a spreadsheet. Contains names, emails and phones, so it needs the events permission. */
export async function GET(_req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canExportEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  const bidders = await prisma.auctionBidder.findMany({ where: { auctionId, churchId: auth.churchId }, orderBy: [{ bidderNumber: "asc" }, { createdAt: "asc" }] });
  const csv = buildCsvExport(bidders, [
    { header: "Bidder number", value: (b) => (b.bidderNumber == null ? "" : String(b.bidderNumber)) },
    { header: "Name", value: (b) => b.name },
    { header: "Email", value: (b) => b.email },
    { header: "Phone", value: (b) => b.phone ?? "" },
    { header: "Status", value: (b) => b.status },
    { header: "Email confirmed", value: (b) => (b.emailVerifiedAt ? "Yes" : "No") },
    { header: "Registered", value: (b) => b.createdAt.toISOString() },
  ]);
  const safe = auction.slug.replace(/[^a-z0-9-]/gi, "");
  return csvResponse(csv, `auction-${safe}-bidders.csv`);
}
