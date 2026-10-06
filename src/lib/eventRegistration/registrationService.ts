import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { normalizeEmail } from "@/lib/donors/donorContact";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { cleanAddressInput, hasAnyAddressField, applyDonorAddressUpdate } from "@/lib/donors/donorAddress";
import { assertNonprofitApproved } from "@/lib/onboarding/nonprofitVerificationGuard";
import { parseCustomFields, validateCustomResponses, type CustomFieldResponses } from "@/lib/eventRegistration/customFields";
import { computeRegistrationTotals, type RegistrationTotals } from "@/lib/eventRegistration/pricing";
import { generateConfirmationCode, getDoorSaleState, getRegistrationState, REGISTRATION_CLOSED_MESSAGES } from "@/lib/eventRegistration/eventConfig";
import { sendRegistrationConfirmationEmail } from "@/lib/eventRegistration/eventEmails";
import { generateTicketToken } from "@/lib/eventRegistration/tickets";

/**
 * The one place a registration is created and confirmed. The public
 * register API is a thin wrapper around submitEventRegistration, and the
 * donate route calls finalizeEventRegistration after a payment is accepted
 * — so a free RSVP and a paid registration share the same validation,
 * persistence, donor linking and confirmation email.
 */

export interface RegistrationInput {
  clientKey: string;
  registrant: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: Record<string, unknown>;
  };
  attendees: { firstName: string; lastName: string; email?: string; phone?: string; customResponses?: unknown }[];
  groupName?: string;
  customResponses?: unknown;
  addOns?: { addOnId: string; quantity: number }[];
  donationCents?: number;
}

export type SubmitResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      duplicate: boolean;
      registrationId: string;
      confirmationCode: string;
      status: "CONFIRMED" | "PENDING";
      requiresPayment: boolean;
      totals: RegistrationTotals;
      givingLinkSlug: string | null;
    };

/** How a door sale is paid when staff take it themselves. CARD door sales go through the ordinary online flow and carry no method. */
export type DoorPaymentMethod = "CASH" | "CHECK" | "COMPLIMENTARY";

export interface DoorSaleOptions {
  /** The signed-in staff member selling — resolved from the merchant session by the caller, never from the request body. */
  userId: string;
  /** Omitted for a card sale (paid through the normal Finix flow, then auto-checked-in). */
  paymentMethod?: DoorPaymentMethod;
}

const NAME_MAX = 80;
const MAX_CLIENT_KEY = 100;

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, NAME_MAX) : "";
}

export async function submitEventRegistration(slug: string, input: RegistrationInput, now: Date = new Date(), door?: DoorSaleOptions): Promise<SubmitResult> {
  const fail = (status: number, error: string): SubmitResult => ({ ok: false, status, error });

  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || event.archivedAt) return fail(404, "This event could not be found.");

  if (door) {
    const doorState = getDoorSaleState(event, now);
    if (!doorState.open) return fail(409, doorState.message);
  } else {
    const state = getRegistrationState(event, now);
    if (!state.open) return fail(409, REGISTRATION_CLOSED_MESSAGES[state.reason]);
  }
  const offlineMethod = door?.paymentMethod ?? null;

  if (typeof input.clientKey !== "string" || !input.clientKey || input.clientKey.length > MAX_CLIENT_KEY) {
    return fail(400, "Your session expired. Please refresh the page and try again.");
  }

  // --- Registrant -----------------------------------------------------------
  const registrantFirstName = cleanName(input.registrant?.firstName);
  const registrantLastName = cleanName(input.registrant?.lastName);
  const registrantEmail = typeof input.registrant?.email === "string" ? input.registrant.email.trim() : "";
  if (!registrantFirstName || !registrantLastName) return fail(400, "Please enter your first and last name.");
  if (!isValidEmail(registrantEmail)) return fail(400, "Please enter a valid email address.");

  let registrantPhone: string | null = null;
  if (input.registrant?.phone && input.registrant.phone.trim()) {
    registrantPhone = normalizeUSPhone(input.registrant.phone);
    if (!registrantPhone) return fail(400, "Please enter a valid U.S. phone number.");
  } else if (event.registrantPhoneRequired) {
    return fail(400, "A phone number is required for this event.");
  }

  let cleanedAddress: ReturnType<typeof cleanAddressInput> | null = null;
  if (event.mailingAddressMode !== "HIDDEN" && input.registrant?.address && typeof input.registrant.address === "object") {
    const candidate = cleanAddressInput(input.registrant.address);
    if (hasAnyAddressField(candidate)) cleanedAddress = candidate;
  }
  if (event.mailingAddressMode === "REQUIRED") {
    if (!cleanedAddress?.addressLine1 || !cleanedAddress.city || !cleanedAddress.state || !cleanedAddress.postalCode) {
      return fail(400, "A complete mailing address is required.");
    }
  }

  // --- Attendees ------------------------------------------------------------
  const rawAttendees = Array.isArray(input.attendees) ? input.attendees : [];
  const maxAttendees = event.allowMultipleAttendees ? event.maxAttendeesPerRegistration : 1;
  if (rawAttendees.length < 1) return fail(400, "Add at least one attendee.");
  if (rawAttendees.length > maxAttendees) return fail(400, `You can register at most ${maxAttendees} attendee${maxAttendees === 1 ? "" : "s"} at a time.`);

  const fields = parseCustomFields(event.customFieldsJson);

  const attendees: {
    firstName: string;
    lastName: string;
    email: string | null;
    normalizedEmail: string | null;
    phone: string | null;
    customResponses: CustomFieldResponses;
  }[] = [];
  for (let i = 0; i < rawAttendees.length; i++) {
    const a = rawAttendees[i];
    const label = `Attendee ${i + 1}`;
    const firstName = cleanName(a?.firstName);
    const lastName = cleanName(a?.lastName);
    if (!firstName || !lastName) return fail(400, `${label}: first and last name are required.`);

    const email = typeof a?.email === "string" ? a.email.trim() : "";
    if (!email && event.attendeeEmailRequired) return fail(400, `${label}: an email address is required.`);
    if (email && !isValidEmail(email)) return fail(400, `${label}: please enter a valid email address.`);

    let phone: string | null = null;
    if (event.collectAttendeePhone && a?.phone && a.phone.trim()) {
      phone = normalizeUSPhone(a.phone);
      if (!phone) return fail(400, `${label}: please enter a valid U.S. phone number.`);
    }

    const responses = validateCustomResponses(fields, "ATTENDEE", a?.customResponses, label);
    if (!responses.ok) return fail(400, responses.error);

    attendees.push({
      firstName,
      lastName,
      email: email || null,
      normalizedEmail: email ? normalizeEmail(email) : null,
      phone,
      customResponses: responses.responses,
    });
  }

  // --- Group + registration-level answers -----------------------------------
  let groupName: string | null = null;
  if (event.allowGroups) {
    groupName = typeof input.groupName === "string" && input.groupName.trim() ? input.groupName.trim().slice(0, 120) : null;
    if (!groupName && event.groupRequired) return fail(400, `${event.groupLabel} is required.`);
  }
  const regResponses = validateCustomResponses(fields, "REGISTRATION", input.customResponses);
  if (!regResponses.ok) return fail(400, regResponses.error);

  // --- Pricing (always recomputed server-side) ------------------------------
  const activeAddOns = await prisma.eventAddOn.findMany({ where: { eventId: event.id, churchId: event.churchId, isActive: true } });
  const priced = computeRegistrationTotals({
    event,
    attendeeCount: attendees.length,
    addOns: activeAddOns,
    selections: (Array.isArray(input.addOns) ? input.addOns : []).map((s) => ({ addOnId: String(s?.addOnId ?? ""), quantity: Number(s?.quantity) })),
    donationCents: input.donationCents === undefined ? 0 : Number(input.donationCents),
  });
  if (!priced.ok) return fail(400, priced.error);
  const pricedTotals = priced.totals;
  // A comp ticket records what it would have cost as $0 — nothing is owed or collected.
  const totals: RegistrationTotals =
    offlineMethod === "COMPLIMENTARY"
      ? { ...pricedTotals, registrationAmountCents: 0, addOnsAmountCents: 0, donationAmountCents: 0, totalCents: 0, benefitValueCents: 0, contributionCents: 0, addOnLines: pricedTotals.addOnLines.map((l) => ({ ...l, unitPriceCents: 0, lineTotalCents: 0 })) }
      : pricedTotals;
  // Cash/check/comp are settled by staff on the spot: no Finix, no payment step.
  const requiresPayment = totals.totalCents > 0 && !offlineMethod;

  let givingLinkSlug: string | null = null;
  if (requiresPayment) {
    const link = event.givingLinkId ? await prisma.givingLink.findFirst({ where: { id: event.givingLinkId, churchId: event.churchId } }) : null;
    const church = await prisma.church.findUnique({ where: { id: event.churchId }, select: { finixMerchantId: true } });
    if (!link || !church?.finixMerchantId) return fail(409, "Online payment isn't available for this event right now.");
    try {
      await assertNonprofitApproved(event.churchId);
    } catch {
      return fail(409, "This organization is not currently approved to accept payments.");
    }
    givingLinkSlug = link.publicSlug;
  }

  // --- Idempotency: a retried submit reuses its registration ----------------
  const existing = await prisma.eventRegistration.findUnique({ where: { eventId_clientKey: { eventId: event.id, clientKey: input.clientKey } } });
  if (existing && existing.status === "CONFIRMED") {
    return {
      ok: true,
      duplicate: true,
      registrationId: existing.id,
      confirmationCode: existing.confirmationCode,
      status: "CONFIRMED",
      requiresPayment: false,
      totals,
      givingLinkSlug: null,
    };
  }
  if (existing && existing.status === "PENDING" && existing.paymentId) {
    return fail(409, "This registration already has a payment in progress.");
  }

  const registrationData = {
    registrantFirstName,
    registrantLastName,
    registrantEmail,
    registrantPhone,
    groupName,
    customResponsesJson: regResponses.responses as Prisma.InputJsonValue,
    attendeeCount: attendees.length,
    registrationAmountCents: totals.registrationAmountCents,
    addOnsAmountCents: totals.addOnsAmountCents,
    donationAmountCents: totals.donationAmountCents,
    totalCents: totals.totalCents,
    ...(door ? { soldAtDoor: true, soldByUserId: door.userId, paymentMethod: offlineMethod } : {}),
  };

  const registration = await prisma.$transaction(async (tx) => {
    let reg;
    if (existing) {
      // Rewrite the pending cart in place — the registrant edited their
      // answers and resubmitted before paying.
      await tx.eventAttendee.deleteMany({ where: { registrationId: existing.id, churchId: event.churchId } });
      await tx.eventRegistrationAddOn.deleteMany({ where: { registrationId: existing.id, churchId: event.churchId } });
      reg = await tx.eventRegistration.update({ where: { id: existing.id }, data: registrationData });
    } else {
      reg = await tx.eventRegistration.create({
        data: {
          churchId: event.churchId,
          eventId: event.id,
          clientKey: input.clientKey,
          confirmationCode: generateConfirmationCode(),
          status: "PENDING",
          ...registrationData,
        },
      });
    }
    await tx.eventAttendee.createMany({
      data: attendees.map((a) => ({
        churchId: event.churchId,
        eventId: event.id,
        registrationId: reg.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        normalizedEmail: a.normalizedEmail,
        phone: a.phone,
        customResponsesJson: a.customResponses as Prisma.InputJsonValue,
        ticketToken: generateTicketToken(),
      })),
    });
    if (totals.addOnLines.length > 0) {
      await tx.eventRegistrationAddOn.createMany({
        data: totals.addOnLines.map((l) => ({
          churchId: event.churchId,
          eventId: event.id,
          registrationId: reg.id,
          addOnId: l.addOnId,
          nameSnapshot: l.name,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
        })),
      });
    }
    return reg;
  });

  if (!requiresPayment) {
    // Free RSVP: no Finix, no Payment row — confirm right here.
    await finalizeEventRegistration(registration.id, {
      address: cleanedAddress,
      // Cash/check were taken in hand right now; stamp that as the payment time.
      ...(offlineMethod === "CASH" || offlineMethod === "CHECK" ? { paidAt: now } : {}),
    });
    return {
      ok: true,
      duplicate: false,
      registrationId: registration.id,
      confirmationCode: registration.confirmationCode,
      status: "CONFIRMED",
      requiresPayment: false,
      totals,
      givingLinkSlug: null,
    };
  }

  return {
    ok: true,
    duplicate: false,
    registrationId: registration.id,
    confirmationCode: registration.confirmationCode,
    status: "PENDING",
    requiresPayment: true,
    totals,
    givingLinkSlug,
  };
}

/**
 * Turns a registration into a real, counted one: links the registrant to a
 * Donor/contact, links attendees to existing donors by email, stamps the
 * payment (if any), and sends the confirmation. Idempotent — safe to call
 * twice (a webhook retry, a double-submit).
 */
export async function finalizeEventRegistration(
  registrationId: string,
  opts: {
    donorId?: string | null;
    paymentId?: string | null;
    paidAt?: Date | null;
    address?: ReturnType<typeof cleanAddressInput> | null;
  } = {}
): Promise<void> {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } });
  if (!registration) return;
  if (registration.status === "CONFIRMED") {
    // Already confirmed — only fill in payment details if they arrived late.
    if (opts.paymentId && !registration.paymentId) {
      await prisma.eventRegistration.update({ where: { id: registrationId }, data: { paymentId: opts.paymentId, paidAt: opts.paidAt ?? null } });
    }
    return;
  }
  if (registration.status === "CANCELED") return;

  let donorId = opts.donorId ?? null;
  if (!donorId) {
    const donor = await resolveOrCreateDonor({
      churchId: registration.churchId,
      name: `${registration.registrantFirstName} ${registration.registrantLastName}`.trim(),
      email: registration.registrantEmail,
      phone: registration.registrantPhone,
      contactSource: "EVENT",
    });
    donorId = donor.id;
  }

  if (opts.address && hasAnyAddressField(opts.address)) {
    try {
      await applyDonorAddressUpdate({
        donorId,
        churchId: registration.churchId,
        newAddress: opts.address,
        source: "ONLINE_DONATION_FORM",
        enteredByDonor: true,
        verifiedAs: "CONFIRMED_BY_DONOR",
      });
    } catch (err) {
      // A mailing-address save must never fail a registration.
      console.error("Failed to save registrant address:", err);
    }
  }

  // Link attendees to donors that ALREADY exist by email. Never creates
  // donor rows — a guest list shouldn't flood the donor list.
  const attendees = await prisma.eventAttendee.findMany({ where: { registrationId, churchId: registration.churchId, donorId: null } });
  const emails = [...new Set(attendees.map((a) => a.normalizedEmail).filter((e): e is string => !!e))];
  if (emails.length > 0) {
    const donors = await prisma.donor.findMany({
      where: { churchId: registration.churchId, archivedAt: null, normalizedEmail: { in: emails } },
      select: { id: true, normalizedEmail: true },
    });
    const byEmail = new Map(donors.map((d) => [d.normalizedEmail, d.id]));
    for (const a of attendees) {
      const match = a.normalizedEmail ? byEmail.get(a.normalizedEmail) : undefined;
      if (match) await prisma.eventAttendee.update({ where: { id: a.id }, data: { donorId: match } });
    }
  }

  // Claim the PENDING -> CONFIRMED transition atomically so two concurrent
  // finalizers can't both send the confirmation.
  const claimed = await prisma.eventRegistration.updateMany({
    where: { id: registrationId, status: "PENDING" },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      donorId,
      paymentId: opts.paymentId ?? registration.paymentId,
      paidAt: opts.paidAt ?? null,
    },
  });
  if (claimed.count === 0) return;

  // Sold at the door: the buyer is standing right here, so they're in.
  if (registration.soldAtDoor) {
    await prisma.eventAttendee.updateMany({
      where: { registrationId, churchId: registration.churchId, checkedIn: false },
      data: { checkedIn: true, checkedInAt: new Date(), checkedInByUserId: registration.soldByUserId },
    });
  }

  try {
    await sendRegistrationConfirmationEmail(registrationId);
  } catch (err) {
    console.error("Failed to send event confirmation email:", err);
  }
}
