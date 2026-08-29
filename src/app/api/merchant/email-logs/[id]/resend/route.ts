import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { sendExternalDonationReceiptEmail } from "@/lib/donations/sendExternalDonationReceiptEmail";
import { sendYearEndStatementEmail } from "@/lib/donors/generateStatement";
import { sendInvoiceEmail } from "@/lib/invoices/invoiceEmails";
import { ensureInvoicePublicToken, InvoicePublicTokenAlreadyExistsError, regenerateInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { sendWgcEmail } from "@/lib/email";
import { generateSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { formatCents } from "@/lib/format";

const SETUP_LINK_EXPIRY_DAYS = 14;

/**
 * Single unified resend gate (canResendEmails) for every email category,
 * rather than each category's own existing, inconsistent permission — see
 * the Email Logs plan for the reasoning. Reads the OrgEmailLog row
 * (church-scoped) purely to learn which original sender to re-invoke;
 * every delegated sender below writes its own new OrgEmailLog row via the
 * `log` block already wired into it, so this route itself never writes to
 * the log table.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canResendEmails");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { id } = await params;
  const log = await prisma.orgEmailLog.findFirst({ where: { id, churchId: auth.churchId } });
  if (!log) return toSafeErrorResponse("Email not found", 404);
  if (!log.relatedEntityType || !log.relatedEntityId) {
    return toSafeErrorResponse("This email cannot be resent (no related record).", 400);
  }

  try {
    switch (log.category) {
      case "DONATION_RECEIPT":
        await sendDonationReceipt(log.relatedEntityId, auth.churchId, auth.userId);
        break;

      case "EXTERNAL_DONATION_RECEIPT":
        await sendExternalDonationReceiptEmail(log.relatedEntityId, auth.churchId, auth.userId);
        break;

      case "ANNUAL_STATEMENT":
        await sendYearEndStatementEmail(log.relatedEntityId, auth.churchId, auth.email);
        break;

      case "INVOICE": {
        const invoice = await prisma.invoice.findFirst({ where: { id: log.relatedEntityId, churchId: auth.churchId } });
        if (!invoice) return toSafeErrorResponse("Invoice not found", 404);
        let token: string;
        try {
          token = await ensureInvoicePublicToken(invoice.id, auth.churchId);
        } catch (err) {
          if (err instanceof InvoicePublicTokenAlreadyExistsError) {
            token = await regenerateInvoicePublicToken(invoice.id, auth.churchId);
          } else {
            throw err;
          }
        }
        const result = await sendInvoiceEmail(invoice.id, token);
        if (!result.success) return toSafeErrorResponse(result.error || "Failed to resend invoice email", 502);
        break;
      }

      case "SUBSCRIPTION_SETUP_LINK": {
        const link = await prisma.subscriptionSetupLink.findFirst({ where: { id: log.relatedEntityId, churchId: auth.churchId } });
        if (!link) return toSafeErrorResponse("Setup link not found", 404);
        if (link.status === "COMPLETED") return toSafeErrorResponse("This setup link has already been completed", 400);
        if (link.status === "REVOKED") return toSafeErrorResponse("This setup link has been revoked", 400);

        const church = await prisma.church.findUnique({ where: { id: auth.churchId } });
        if (!church) return toSafeErrorResponse("Organization not found", 404);

        const { token, tokenHash } = generateSetupLinkToken();
        const expiresAt = new Date(Date.now() + SETUP_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
        const setupUrl = `${appUrl}/setup/${token}`;

        const emailResult = await sendWgcEmail({
          to: link.donorEmail,
          subject: `Set up your recurring donation to ${church.name}`,
          title: "Set Up Your Recurring Donation",
          badgeText: "Action Requested",
          badgeColor: "#C99A2E",
          bodyHtml: `
            <p>${church.name} has invited you to set up a recurring donation:</p>
            <p><strong>${formatCents(link.amountCents)} — ${frequencyLabel(link.billingInterval)}</strong></p>
            <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Review and Set Up</a></p>
            <p style="font-size:12px;color:#64748b;">This link expires on ${expiresAt.toLocaleDateString("en-US")} and can only be used once.</p>
          `,
          log: {
            churchId: auth.churchId,
            donorId: link.donorId,
            category: "SUBSCRIPTION_SETUP_LINK",
            relatedEntityType: "SubscriptionSetupLink",
            relatedEntityId: link.id,
            createdByUserId: auth.userId,
            isResend: true,
          },
        });

        await prisma.subscriptionSetupLink.update({
          where: { id: link.id },
          data: {
            tokenHash,
            expiresAt,
            status: emailResult.success ? "SENT" : "FAILED",
            sentAt: emailResult.success ? new Date() : link.sentAt,
            failureReason: emailResult.success ? null : "Email delivery failed",
          },
        });

        if (!emailResult.success) return toSafeErrorResponse("Failed to resend the setup link email.", 502);
        break;
      }

      case "RECURRING_CONFIRMATION":
        return toSafeErrorResponse("Recurring confirmations cannot be resent (no receipt content to regenerate).", 400);

      default:
        return toSafeErrorResponse("Unsupported email category.", 400);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return toSafeErrorResponse(err?.message || "Failed to resend email", 400);
  }
}
