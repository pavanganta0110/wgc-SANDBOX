import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import InvoiceBuilderForm, { type InvoiceFormValues } from "@/components/merchant/InvoiceBuilderForm";
import { canEditFinancials, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  try {
    requirePermission(auth, "canEditInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/merchant/invoices");
    throw err;
  }

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) notFound();

  if (auth.role === "fundraiser" && invoice.createdByUserId !== auth.userId) {
    redirect(`/merchant/invoices/${invoiceId}`);
  }

  const hasSuccessfulPayment = (await prisma.invoicePayment.count({ where: { invoiceId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } })) > 0;
  if (!canEditFinancials(invoice.status as InvoiceStatus, hasSuccessfulPayment)) {
    redirect(`/merchant/invoices/${invoiceId}`);
  }

  const [client, lineItems] = await Promise.all([
    prisma.client.findUnique({ where: { id: invoice.clientId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" } }),
  ]);

  const initial: InvoiceFormValues = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    client: client ? { id: client.id, displayName: client.displayName, email: client.email, phone: client.phone, organizationName: client.organizationName, clientType: client.clientType } : null,
    title: invoice.title || "",
    poReference: invoice.poReference || "",
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    internalNotes: invoice.internalNotes || "",
    clientMemo: invoice.clientMemo || "",
    paymentInstructions: invoice.paymentInstructions || "",
    termsAndConditions: invoice.termsAndConditions || "",
    lineItems: lineItems.length
      ? lineItems.map((li) => ({
          description: li.description,
          detailedDescription: li.detailedDescription || "",
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          discountType: li.discountType as "FIXED" | "PERCENTAGE",
          discountValue: li.discountValue,
          taxRateBasisPoints: li.taxRateBasisPoints,
          productCode: li.productCode || "",
        }))
      : [{ description: "", detailedDescription: "", quantity: 1, unitPriceCents: 0, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null, productCode: "" }],
    discountCents: invoice.discountCents,
    serviceFeeCents: invoice.serviceFeeCents,
    allowCard: invoice.allowCard,
    allowAch: invoice.allowAch,
    allowApplePay: invoice.allowApplePay,
    allowGooglePay: invoice.allowGooglePay,
    allowPartialPayments: invoice.allowPartialPayments,
    minimumPartialPaymentCents: invoice.minimumPartialPaymentCents,
    feeCoveredBy: invoice.feeCoveredBy as "MERCHANT" | "CLIENT",
    autoCloseWhenPaid: invoice.autoCloseWhenPaid,
    templateName: invoice.templateName,
    accentColor: invoice.accentColor || "",
    classification: invoice.classification as InvoiceFormValues["classification"],
    goodsServicesValueCents: invoice.goodsServicesValueCents,
    charitablePortionCents: invoice.charitablePortionCents,
    noGoodsOrServicesConfirmed: invoice.noGoodsOrServicesConfirmed,
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Invoice {invoice.invoiceNumber}</h2>
      <InvoiceBuilderForm mode="edit" initial={initial} />
    </div>
  );
}
