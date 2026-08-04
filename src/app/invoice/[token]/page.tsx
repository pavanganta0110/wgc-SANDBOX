import { prisma } from "@/lib/prisma";
import { hashInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import InvoicePublicView from "@/components/giving/InvoicePublicView";

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * Server shell only — a fast, non-mutating existence/status check for the
 * initial paint and error states. The actual data load (and the
 * view-tracking mutation it performs) happens client-side via
 * GET /api/invoice/[token], the same split used by /setup/[token]. Never
 * exposes an internal database ID in the rendered HTML or in any prop
 * passed to the client component beyond the token itself.
 */
export default async function InvoicePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashInvoicePublicToken(token);
  const record = await prisma.invoicePublicToken.findUnique({ where: { tokenHash } });

  if (!record) return <ErrorScreen title="Invalid link" message="This invoice link is invalid." />;
  if (record.status === "REVOKED") return <ErrorScreen title="Link no longer active" message="This invoice link has been revoked by the organization. Please contact them for an updated link." />;

  return <InvoicePublicView token={token} />;
}
