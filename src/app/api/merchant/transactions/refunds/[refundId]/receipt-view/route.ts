import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildRefundScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { formatCents } from "@/lib/format";
import { loadRefundReceiptData } from "@/lib/giving/sendRefundReceipt";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A printable refund receipt page. Anyone who can see the refund can view it
 * (a fundraiser only their own); emailing it to the donor is a separate, owner/admin action.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ refundId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { refundId } = await params;
  const viewScope = await resolveViewScope(auth);
  const refundScope = await buildRefundScope(auth, viewScope);
  const refund = await prisma.finixRefundOrReversal.findFirst({
    where: { AND: [{ finixReversalId: refundId }, refundScope] },
    select: { finixReversalId: true },
  });
  if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });

  let d;
  try {
    d = await loadRefundReceiptData(refund.finixReversalId, auth.churchId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Receipt unavailable" }, { status: 400 });
  }

  const status = d.state === "SUCCEEDED" ? "Refunded" : "Refund in progress";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Refund receipt ${esc(d.reference)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;background:#f8fafc}
.logo{max-height:64px;max-width:220px;margin-bottom:12px;display:block}
.card{max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px}
h1{font-size:20px;margin:0 0 4px}.muted{color:#64748b;font-size:13px}
.amount{font-size:34px;font-weight:700;margin:20px 0 4px}
.badge{display:inline-block;background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}td{padding:8px 0;border-top:1px solid #f1f5f9}td:last-child{text-align:right;font-weight:600}
.note{margin-top:20px;font-size:12px;color:#64748b}
@media print{body{background:#fff}.card{border:0;margin:0}}
</style></head><body><div class="card">
${d.logoUrl ? `<img class="logo" src="${esc(d.logoUrl)}" alt="${esc(d.orgName)}">` : ""}
<h1>${esc(d.orgName)}</h1>
${[d.contact.address, d.contact.email, d.contact.phone, d.contact.website].filter(Boolean).map((c) => `<div class="muted">${esc(String(c))}</div>`).join("")}
${d.contact.taxId ? `<div class="muted">Tax ID: ${esc(d.contact.taxId)}</div>` : ""}
<p class="muted" style="margin-top:16px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Refund receipt</p>
${d.settings.header ? `<p style="font-size:14px">${esc(d.settings.header)}</p>` : ""}
<div class="amount">${esc(formatCents(d.refundCents))}</div><span class="badge">${status}</span>
<table>
<tr><td>Refund date</td><td>${esc(d.refundDate)}</td></tr>
<tr><td>Refunded to</td><td>${esc(d.method)}</td></tr>
${d.originalCents != null ? `<tr><td>Original payment</td><td>${esc(formatCents(d.originalCents))}</td></tr>` : ""}
<tr><td>Name</td><td>${esc(d.donorName === "there" ? "—" : d.donorName)}</td></tr>
<tr><td>Refund reference</td><td>${esc(d.reference)}</td></tr>
</table>
<p class="note">It can take 5 to 10 business days for a refund to appear on a card or bank statement. Questions? Contact ${esc(d.orgName)}.</p>
${d.settings.footer ? `<p class="note">${esc(d.settings.footer)}</p>` : ""}
</div></body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
