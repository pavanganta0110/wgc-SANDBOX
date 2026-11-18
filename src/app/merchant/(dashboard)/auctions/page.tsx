import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import NewAuctionForm from "./NewAuctionForm";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  OPEN: "bg-green-50 text-green-700",
  CLOSED: "bg-amber-50 text-amber-700",
  SETTLED: "bg-indigo-50 text-indigo-700",
};

export default async function AuctionsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");

  const auctions = await prisma.auction.findMany({ where: { churchId: auth.churchId }, orderBy: { startsAt: "desc" }, take: 200 });
  const counts = await prisma.auctionItem.groupBy({ by: ["auctionId"], where: { auctionId: { in: auctions.map((a) => a.id) } }, _count: { _all: true } });
  const itemCount = new Map(counts.map((c) => [c.auctionId, c._count._all]));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium">Auctions</h2>
        <p className="mt-1 text-sm text-gray-500">Silent online auctions and live-room auctions. Winners are invoiced automatically and reminded until they pay.</p>
      </div>

      {hasPermission(auth, "canManageEvents") && <NewAuctionForm />}

      {auctions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">No auctions yet.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>{["Auction", "Format", "Closes", "Status", "Items"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auctions.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-sm font-medium"><Link href={`/merchant/auctions/${a.id}`} className="text-indigo-600 hover:underline">{a.title}</Link></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{a.format === "LIVE" ? "Live room" : "Silent online"}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{a.endsAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT</td>
                  <td className="px-4 py-3 text-sm"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] ?? STATUS_STYLES.DRAFT}`}>{a.status}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{itemCount.get(a.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
