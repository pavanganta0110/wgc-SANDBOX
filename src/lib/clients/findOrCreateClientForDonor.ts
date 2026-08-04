import { prisma } from "@/lib/prisma";
import type { Client, Donor } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";
import { computeClientDisplayName } from "@/lib/clients/clientDisplayName";

/**
 * Backs the Donor page's "Send Invoice" button — invoices bill a Client,
 * never a Donor directly (see the module-wide "Client is a separate
 * identity from Donor, never auto-merged" rule), so starting an invoice
 * from a donor needs a Client to attach it to. Reuses an existing Client
 * already linked to this donor (via Client.linkedDonorId) if one exists,
 * so repeated use never creates duplicates; only creates a new one the
 * first time. The created Client is a real, independent record from that
 * point on — editing it never writes back to the Donor, and vice versa.
 */
export async function findOrCreateClientForDonor(donorId: string, churchId: string): Promise<Client | null> {
  const existing = await prisma.client.findFirst({ where: { churchId, linkedDonorId: donorId, archivedAt: null } });
  if (existing) return existing;

  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) return null;

  return createClientFromDonor(donor, churchId);
}

async function createClientFromDonor(donor: Donor, churchId: string): Promise<Client> {
  const name = donor.name?.trim() || "";
  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ") || null;

  const displayName = computeClientDisplayName({
    clientType: "INDIVIDUAL",
    firstName: firstName || null,
    lastName,
    organizationName: donor.companyName,
  });

  return prisma.client.create({
    data: {
      churchId,
      clientType: "INDIVIDUAL",
      firstName: firstName || null,
      lastName,
      displayName,
      email: donor.email,
      normalizedEmail: normalizeEmail(donor.email),
      phone: donor.phone,
      normalizedPhone: normalizePhone(donor.phone),
      billingAddressLine1: donor.addressLine1,
      billingAddressLine2: donor.addressLine2,
      billingCity: donor.city,
      billingState: donor.state,
      billingPostalCode: donor.postalCode,
      billingCountry: donor.country,
      linkedDonorId: donor.id,
    },
  });
}
