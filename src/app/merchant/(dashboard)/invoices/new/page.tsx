import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import InvoiceBuilderForm from "@/components/merchant/InvoiceBuilderForm";
import { emptyInvoiceForm } from "@/lib/invoices/invoiceFormDefaults";
import { findOrCreateClientForDonor } from "@/lib/clients/findOrCreateClientForDonor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  try {
    requirePermission(auth, "canCreateInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/merchant/invoices");
    throw err;
  }

  const sp = await searchParams;
  const initial = emptyInvoiceForm();

  if (sp.clientId) {
    const client = await prisma.client.findFirst({ where: { id: sp.clientId, churchId: auth.churchId } });
    if (client) {
      initial.client = { id: client.id, displayName: client.displayName, email: client.email, phone: client.phone, organizationName: client.organizationName, clientType: client.clientType };
    }
  } else if (sp.donorId) {
    // Started from a Donor's "Send Invoice" button — reuses (or creates)
    // the Client already linked to this donor rather than billing the
    // Donor record directly; see findOrCreateClientForDonor's doc comment
    // for why invoices never attach straight to a Donor.
    const client = await findOrCreateClientForDonor(sp.donorId, auth.churchId);
    if (client) {
      initial.client = { id: client.id, displayName: client.displayName, email: client.email, phone: client.phone, organizationName: client.organizationName, clientType: client.clientType };
    }
  }

  const settings = await prisma.invoiceSettings.findUnique({ where: { churchId: auth.churchId } });
  if (settings) {
    initial.clientMemo = settings.defaultMemo || "";
    initial.termsAndConditions = settings.defaultTerms || "";
    initial.paymentInstructions = settings.defaultPaymentInstructions || "";
    initial.allowCard = settings.defaultAllowCard;
    initial.allowAch = settings.defaultAllowAch;
    initial.allowApplePay = settings.defaultAllowApplePay;
    initial.allowGooglePay = settings.defaultAllowGooglePay;
    initial.allowPartialPayments = settings.defaultAllowPartialPayments;
    initial.feeCoveredBy = settings.defaultFeeCoveredBy as "MERCHANT" | "CLIENT";
    initial.templateName = settings.defaultTemplateName;
    initial.classification = settings.defaultClassification as typeof initial.classification;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + settings.defaultDueDays);
    initial.dueDate = dueDate.toISOString().slice(0, 10);
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">New Invoice</h2>
      <InvoiceBuilderForm mode="create" initial={initial} />
    </div>
  );
}
