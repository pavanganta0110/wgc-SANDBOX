import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import ClientForm from "@/components/merchant/ClientForm";

export default async function EditClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  try {
    requirePermission(auth, "canManageClients");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/merchant/clients");
    throw err;
  }

  const { clientId } = await params;
  const client = await prisma.client.findFirst({ where: { id: clientId, churchId: auth.churchId } });
  if (!client) notFound();

  const linkedDonor = client.linkedDonorId
    ? await prisma.donor.findUnique({ where: { id: client.linkedDonorId }, select: { id: true, name: true, email: true, phone: true } })
    : null;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Client</h2>
      <ClientForm
        mode="edit"
        initial={{
          id: client.id,
          clientType: client.clientType as "INDIVIDUAL" | "ORGANIZATION",
          firstName: client.firstName || "",
          lastName: client.lastName || "",
          organizationName: client.organizationName || "",
          email: client.email || "",
          phone: client.phone || "",
          billingAddressLine1: client.billingAddressLine1 || "",
          billingAddressLine2: client.billingAddressLine2 || "",
          billingCity: client.billingCity || "",
          billingState: client.billingState || "",
          billingPostalCode: client.billingPostalCode || "",
          billingCountry: client.billingCountry || "",
          shippingAddressLine1: client.shippingAddressLine1 || "",
          shippingAddressLine2: client.shippingAddressLine2 || "",
          shippingCity: client.shippingCity || "",
          shippingState: client.shippingState || "",
          shippingPostalCode: client.shippingPostalCode || "",
          shippingCountry: client.shippingCountry || "",
          contactPersonName: client.contactPersonName || "",
          taxOrReferenceId: client.taxOrReferenceId || "",
          notes: client.notes || "",
          linkedDonorId: client.linkedDonorId,
          linkedDonor,
        }}
      />
    </div>
  );
}
