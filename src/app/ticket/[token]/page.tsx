import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseTicketPayload } from "@/lib/eventRegistration/tickets";
import { formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your ticket", robots: { index: false, follow: false } };

/** The attendee's ticket: a big QR to hold up at the door. The token in the URL is the credential. */
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = parseTicketPayload(raw);
  if (!token) notFound();

  const attendee = await prisma.eventAttendee.findUnique({ where: { ticketToken: token } });
  if (!attendee) notFound();
  const [registration, event, church] = await Promise.all([
    prisma.eventRegistration.findFirst({ where: { id: attendee.registrationId, churchId: attendee.churchId } }),
    prisma.event.findFirst({ where: { id: attendee.eventId, churchId: attendee.churchId } }),
    prisma.church.findUnique({ where: { id: attendee.churchId }, select: { name: true } }),
  ]);
  if (!registration || !event) notFound();

  const valid = registration.status === "CONFIRMED";
  const where = [event.locationName, event.locationAddress].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-lg border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80">{event.hostName?.trim() || church?.name}</p>
          <h1 className="text-xl font-bold mt-1">{event.name}</h1>
          <p className="text-sm mt-2 opacity-90">{formatEventDate(event.startsAt, event.timezone)} · {formatEventTime(event.startsAt, event.timezone)}</p>
          {where && <p className="text-sm opacity-90">{where}</p>}
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-lg font-semibold text-slate-900">{attendee.firstName} {attendee.lastName}</p>
          {valid ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/ticket/${token}/qr`} alt={`Ticket QR code for ${attendee.firstName} ${attendee.lastName}`} width={280} height={280} className="mx-auto mt-4 rounded-xl border border-slate-200" />
              <p className="mt-4 text-sm text-slate-500">Show this code at the entrance to check in.</p>
              {attendee.checkedIn && <p className="mt-3 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Checked in</p>}
              <p className="mt-4 text-xs text-slate-400">Confirmation code <span className="font-mono">{registration.confirmationCode}</span></p>
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">This ticket isn&apos;t valid — the registration was {registration.status === "CANCELED" ? "canceled" : "not completed"}.</p>
          )}
        </div>
      </div>
    </main>
  );
}
