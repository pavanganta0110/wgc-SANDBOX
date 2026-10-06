"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import { formatCents } from "@/lib/format";
import type { PublicEventData } from "@/lib/eventRegistration/loadPublicEvent";

/**
 * The payment step of a staff-run door card sale. The registration already
 * exists as a PENDING cart (created from the Check-in tab), so there is no
 * attendee/ticket form here: the buyer's details come prefilled and the
 * normal Finix payment fields are shown immediately. The charge goes through
 * the same /api/g/[slug]/donate route as any online registration, which
 * confirms the registration — and a door sale checks the buyer in.
 */
export default function DoorPayment({
  event,
  organization,
  checkout,
  light,
  closedMessage,
  eventId,
  registration,
}: {
  event: PublicEventData["event"];
  organization: PublicEventData["organization"];
  checkout: PublicEventData["checkout"];
  light: PublicEventData["light"];
  closedMessage: string | null;
  eventId: string;
  registration: {
    id: string;
    status: string;
    confirmationCode: string;
    totalCents: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    attendees: { firstName: string; lastName: string }[];
  };
}) {
  const [outcome, setOutcome] = useState<null | "paid" | "pending">(registration.status === "CONFIRMED" ? "paid" : null);
  const backHref = `/merchant/events/${eventId}`;
  const names = registration.attendees.map((a) => `${a.firstName} ${a.lastName}`.trim()).join(", ");

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: light.pageBackground }}>
      <div className="max-w-xl mx-auto mb-3 text-sm">
        <Link href={backHref} className="underline" style={{ color: light.bodyTextColor }}>← Back to check-in</Link>
      </div>
      <div className="max-w-xl mx-auto rounded-2xl shadow-sm border p-6 sm:p-8" style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: light.headingColor }}>{event.name}</h1>
        <p className="text-sm mb-4" style={{ color: light.bodyTextColor }}>Door sale · {event.dateLabel}</p>

        {outcome ? (
          <div role="status" className="text-center py-6">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" aria-hidden="true" />
            <h2 className="text-xl font-bold mb-1" style={{ color: light.headingColor }}>
              {outcome === "pending" ? "Payment received — bank transfer pending" : "Paid — checked in"}
            </h2>
            <p className="text-sm mb-1" style={{ color: light.bodyTextColor }}>{names}</p>
            <p className="text-sm mb-5" style={{ color: light.bodyTextColor }}>
              Code <span className="font-mono">{registration.confirmationCode}</span> · the ticket was emailed to {registration.email}
            </p>
            <Link href={backHref} className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold" style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}>
              Sell another ticket
            </Link>
          </div>
        ) : closedMessage ? (
          <p role="alert" className="text-sm text-red-600">{closedMessage}</p>
        ) : registration.status !== "PENDING" ? (
          <p role="alert" className="text-sm text-red-600">This sale is no longer open for payment. Start a new door sale from the Check-in tab.</p>
        ) : checkout && organization.finixMerchantId ? (
          <>
            <div className="rounded-xl border p-4 mb-5 text-sm" style={{ borderColor: light.borderColor, color: light.bodyTextColor }}>
              <p className="font-semibold" style={{ color: light.headingColor }}>{registration.firstName} {registration.lastName}</p>
              <p>{registration.attendees.length} {registration.attendees.length === 1 ? "ticket" : "tickets"}: {names}</p>
              <p className="mt-1 font-bold" style={{ color: light.headingColor }}>{formatCents(registration.totalCents)}</p>
            </div>
            <GivingLinkForm
              slug={checkout.givingLinkSlug}
              finixMerchantId={organization.finixMerchantId}
              churchName={organization.name}
              light={light}
              amountType="VARIABLE"
              fixedAmountCents={null}
              minAmountCents={100}
              maxAmountCents={null}
              suggestedAmountsCents={[]}
              allowCustomAmount
              recurringEnabled={false}
              allowedFrequencies={["MONTHLY"]}
              allowedPaymentMethods={checkout.allowedPaymentMethods}
              feeCoverEnabled={checkout.feeCoverEnabled}
              feeCoverDefaultOn={checkout.feeCoverDefaultOn}
              donorFieldSettings={checkout.donorFieldSettings}
              collectMailingAddress={false}
              pricing={checkout.pricing}
              thankYouMessage=""
              googlePayGatewayMerchantId={checkout.googlePayGatewayMerchantId}
              googlePayMerchantId={checkout.googlePayMerchantId}
              googlePayEnvironment={checkout.googlePayEnvironment}
              serverAvailability={checkout.serverAvailability}
              eventMode={{
                totalCents: registration.totalCents,
                phoneRequired: false,
                prefill: { firstName: registration.firstName, lastName: registration.lastName, email: registration.email, phone: registration.phone },
                // The cart already exists — charge it as-is.
                beforeCharge: async () => ({ registrationId: registration.id }),
              }}
              onResult={(r) => {
                if (r.step === "success" || r.step === "pending") setOutcome(r.step === "pending" ? "pending" : "paid");
              }}
            />
          </>
        ) : (
          <p role="alert" className="text-sm text-red-600">Online payment isn&apos;t available for this event right now.</p>
        )}
      </div>
    </div>
  );
}
