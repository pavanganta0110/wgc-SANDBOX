import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { loadEventStats } from "@/lib/eventRegistration/eventStats";
import { formatEventDate } from "@/lib/eventRegistration/timezone";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  DRAFT: "bg-slate-100 text-slate-700",
  INACTIVE: "bg-amber-50 text-amber-700",
};

export default async function EventsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");

  const events = await prisma.event.findMany({
    where: { churchId: auth.churchId, archivedAt: null },
    orderBy: { startsAt: "desc" },
    take: 200,
  });
  const stats = await loadEventStats(auth.churchId, events.map((e) => e.id));

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Events</h2>
          <p className="mt-1 text-sm text-gray-500">Registration pages for galas, tournaments, camps, classes and any other event — free or paid.</p>
        </div>
        {hasPermission(auth, "canManageEvents") && (
          <Link href="/merchant/events/new" className="mt-4 sm:mt-0 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            New Event
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">No events yet.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                {["Event", "Date", "Status", "Registrations", "Attendees", "Revenue"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => {
                const s = stats.get(e.id);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/merchant/events/${e.id}`} className="font-semibold text-indigo-600 hover:underline">{e.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatEventDate(e.startsAt, e.timezone)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? "bg-slate-100 text-slate-700"}`}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{s?.registrations ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{s?.attendees ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatCents(s?.revenueCents ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
