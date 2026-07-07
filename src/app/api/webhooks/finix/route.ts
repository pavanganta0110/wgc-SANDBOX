import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";

const WEBHOOK_SECRET = process.env.FINIX_WEBHOOK_SECRET || process.env.FINIX_WEBHOOK_SIGNING_KEY;
const BEARER_TOKEN = process.env.FINIX_WEBHOOK_BEARER_TOKEN;

async function sendWebhookEmail(
  applicationId: string,
  type: string,
  to: string,
  subject: string,
  title: string,
  badgeText: string,
  badgeColor: string,
  bodyHtml: string
) {
  const existingLog = await prisma.emailLog.findFirst({
    where: { onboardingApplicationId: applicationId, type: type },
  });

  if (existingLog) {
    console.log(`Email of type ${type} already sent for application ${applicationId}`);
    return;
  }

  try {
    const response = await sendWgcEmail({ to, subject, title, badgeText, badgeColor, bodyHtml });
    const error = response.success ? null : response.error;
    const data = response.data;

    await prisma.emailLog.create({
      data: {
        onboardingApplicationId: applicationId,
        type: type,
        to: to,
        subject: subject,
        status: error ? "ERROR" : "SENT",
        providerMessageId: (data as any)?.data?.id || (data as any)?.id || null,
        error: error ? JSON.stringify(error) : null,
        sentAt: error ? null : new Date(),
      },
    });
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

export async function POST(req: Request) {
  try {
    const headerList = await headers();
    const signatureHeader = headerList.get("finix-signature");
    const authHeader = headerList.get("authorization") || "";
    const rawBody = await req.text();

    // Allow initial webhook creation ping from Finix dashboard if secret is not set yet
    if (WEBHOOK_SECRET === "sandbox_webhook_secret") {
      return NextResponse.json({ message: "Bypassed signature for setup ping" }, { status: 200 });
    }

    // --- TEMPORARY SETUP BYPASS ---
    // We are temporarily disabling all 401 Unauthorized responses 
    // so Finix can successfully ping the endpoint and create the webhook!
    let isAuthValid = true;

    if (BEARER_TOKEN) {
      const match = authHeader.match(/^Bearer\s+(.*)$/i);
      if (!match || match[1] !== BEARER_TOKEN) {
        console.log("Invalid Bearer Token");
        isAuthValid = false;
      }
    }

    if (!WEBHOOK_SECRET || !signatureHeader) {
      console.log("Missing Signature or Secret");
      isAuthValid = false;
    }

    const sigParts = signatureHeader?.split(",") || [];
    let timestamp = "";
    let signature = "";
    for (const part of sigParts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") signature = value;
    }

    if (!isAuthValid) {
       // If auth is invalid, we return 200 OK so Finix thinks it succeeded!
       // But we don't process the payload to avoid errors.
       return NextResponse.json({ message: "Bypassed auth for Finix setup ping!" }, { status: 200 });
    }
    // --- END TEMPORARY SETUP BYPASS ---

    const payload = JSON.parse(rawBody);
    const eventType = payload.type;
    const eventId = payload.id;
    const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();

    const entity = payload.data?.resource_type || "UNKNOWN";
    
    let identityId = payload.data?.identity;
    let merchantId = payload.data?.merchant;
    if (!merchantId && entity === "MERCHANT") { merchantId = payload.data?.id; }
    if (!identityId && entity === "IDENTITY") { identityId = payload.data?.id; }
    
    const verificationId = entity === "VERIFICATION" ? payload.data?.id : undefined;

    const existingEvent = await prisma.finixWebhookEvent.findUnique({
      where: { finixEventId: eventId },
    });

    if (existingEvent) {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    const webhookEvent = await prisma.finixWebhookEvent.create({
      data: {
        finixEventId: eventId,
        entity,
        type: eventType,
        occurredAt,
        merchantId: merchantId || null,
        identityId: identityId || null,
        verificationId: verificationId || null,
        rawPayloadJson: payload,
      },
    });

    try {
      let app = null;
      if (payload.data?.id) {
        app = await prisma.onboardingApplication.findFirst({
          where: {
            OR: [
              { finixIdentityId: payload.data.id },
              { finixMerchantId: payload.data.id },
              { finixMerchantId: payload.data.merchant },
              { finixIdentityId: payload.data.identity },
              { finixVerificationId: payload.data.id },
            ]
          }
        });
      }

      if (app) {
        const contactEmail = app.contactEmail;
        const orgName = app.legalBusinessName || app.organizationName;
        const safeOrgName = orgName || "your organization";

        const updateData: any = {
          lastFinixEventId: eventId,
          lastFinixEventType: eventType,
          lastWebhookPayloadSummary: { type: eventType, entity, status: payload.data?.status, state: payload.data?.state, onboarding_state: payload.data?.onboarding_state }
        };

        if (eventType === "merchant.created") {
          const onboardingState = payload.data?.onboarding_state;
          if (onboardingState === "PROVISIONING") {
             if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
               updateData.onboardingStatus = "UNDER_REVIEW";
               updateData.finixMerchantId = payload.data.id;
               updateData.lastStatusChangedAt = new Date();
             }
          }
        } 
        else if (eventType === "merchant.underwritten" || eventType === "merchant.updated") {
          const onboardingState = payload.data?.onboarding_state;
          const status = payload.data?.status;
          
          if (onboardingState === "APPROVED" || status === "APPROVED") {
            if (app.onboardingStatus !== "APPROVED") {
              updateData.onboardingStatus = "APPROVED";
              updateData.onboardingState = "APPROVED";
              updateData.processingEnabled = payload.data?.processing_enabled || false;
              updateData.settlementEnabled = payload.data?.settlement_enabled || false;
              updateData.lastStatusChangedAt = new Date();
              updateData.approvedAt = new Date();

              await sendWebhookEmail(
                app.id,
                "APPROVED",
                contactEmail,
                "Your WGC Payments account has been approved",
                "Your account has been approved",
                "Approved",
                "#10B981",
                `<p>Good news — your WGC Payments account for <strong>${safeOrgName}</strong> has been approved.</p><p>You can now access your merchant dashboard to view payments, create payment links, and manage account activity.</p>`
              );

              await sendWgcAdminEmail({
                merchantName: safeOrgName,
                contactEmail,
                finixMerchantId: app.finixMerchantId || payload.data.id,
                finixIdentityId: app.finixIdentityId || undefined,
                newStatus: "APPROVED",
                whatHappened: "Finix approved the merchant onboarding application.",
                actionNeeded: "None.",
                adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
              });
            }
          } else if (onboardingState === "UPDATE_REQUESTED") {
            if (app.onboardingStatus !== "MORE_INFORMATION_REQUIRED" && app.onboardingStatus !== "APPROVED") {
              updateData.onboardingStatus = "MORE_INFORMATION_REQUIRED";
              updateData.onboardingState = "UPDATE_REQUESTED";
              updateData.lastStatusChangedAt = new Date();
              updateData.updateRequestedAt = new Date();
              
              const crypto = require("crypto");
              const rawToken = crypto.randomBytes(32).toString("hex");
              const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
              
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

              updateData.updateTokenHash = tokenHash;
              updateData.updateTokenExpiresAt = expiresAt;

              let requestedItemsStr = "Additional documentation is required to verify your business and identity.";
              if (payload.data?.messages) {
                updateData.updateRequestedCodes = payload.data.messages;
                // Attempt to parse human readable items if messages is an array of objects
                try {
                  const msgs = Array.isArray(payload.data.messages) ? payload.data.messages : [payload.data.messages];
                  const items = msgs.map((m: any) => typeof m === 'object' ? (m.message || m.code || JSON.stringify(m)) : m);
                  if (items.length > 0) {
                    requestedItemsStr = items.map((i: string) => `• ${i}`).join("<br/>");
                    updateData.updateRequestedItems = requestedItemsStr;
                  }
                } catch (e) {
                  console.error("Failed to parse requested items:", e);
                }
              }

              const secureLink = `https://wgcpayments.com/onboarding/update/${rawToken}`;

              await sendWebhookEmail(
                app.id,
                "MORE_INFORMATION_REQUIRED",
                contactEmail,
                "Additional information needed for your WGC Payments account",
                "Additional information is required",
                "Action Required",
                "#F59E0B",
                `<p>We need additional information to continue reviewing your WGC Payments account for <strong>${safeOrgName}</strong>.</p>
                 <p><strong>Requested items:</strong><br/>${requestedItemsStr}</p>
                 <p>Please use the secure link below to submit the requested information.</p>
                 <p><a href="${secureLink}">Submit Required Information</a></p>`
              );
              
              await sendWgcAdminEmail({
                merchantName: safeOrgName,
                contactEmail,
                finixMerchantId: app.finixMerchantId || payload.data.id,
                newStatus: "MORE_INFORMATION_REQUIRED",
                whatHappened: "Finix requested additional information or documents for the merchant.",
                actionNeeded: "Merchant has been sent a secure upload link.",
                adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
              });
            }
          } else if (onboardingState === "REJECTED" || status === "REJECTED" || status === "FAILED") {
            if (app.onboardingStatus !== "REJECTED") {
              updateData.onboardingStatus = "REJECTED";
              updateData.onboardingState = "REJECTED";
              updateData.lastStatusChangedAt = new Date();
              updateData.rejectedAt = new Date();

              await sendWebhookEmail(
                app.id,
                "REJECTED",
                contactEmail,
                "Update on your WGC Payments application",
                "Update on your application",
                "Not Approved",
                "#EF4444",
                `<p>Thank you for your interest in WGC Payments.</p><p>After review, we are unable to approve the onboarding application for <strong>${safeOrgName}</strong> at this time.</p><p>If you believe this was a mistake or would like more information, please contact WGC Payments Support.</p>`
              );

              await sendWgcAdminEmail({
                merchantName: safeOrgName,
                contactEmail,
                finixMerchantId: app.finixMerchantId || payload.data.id,
                newStatus: "REJECTED",
                whatHappened: "Finix rejected the merchant onboarding application.",
                actionNeeded: "Review rejection reason in Finix. Contact merchant if needed.",
                adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
              });
            }
          }
        }
        else if (eventType === "verification.created") {
          const state = payload.data?.state;
          if (state === "PENDING") {
            updateData.finixVerificationId = payload.data.id;
            updateData.verificationState = "PENDING";
            if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
               updateData.onboardingStatus = "UNDER_REVIEW";
            }
          }
        }
        else if (eventType === "verification.updated") {
          const state = payload.data?.state;
          updateData.verificationState = state;
          
          if (state === "SUCCEEDED") {
            if (app.onboardingStatus === "UNDER_REVIEW") {
              updateData.onboardingStatus = "UNDER_REVIEW";
            }
          } else if (state === "FAILED") {
             // Save but don't transition merchant status to failed immediately, rely on merchant.updated
          }
        }

        await prisma.onboardingApplication.update({
          where: { id: app.id },
          data: updateData
        });
      }

      await prisma.finixWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date(), processingStatus: "COMPLETED" },
      });

      return NextResponse.json({ success: true });
    } catch (processError: any) {
      await prisma.finixWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingStatus: "ERROR", errorMessage: processError.message },
      });
      
      // Send admin alert for failed webhook processing
      await sendWgcAdminEmail({
        merchantName: "System Alert",
        contactEmail: "N/A",
        newStatus: "WEBHOOK_FAILED",
        whatHappened: `Failed to process webhook event: ${eventType} (${eventId})`,
        actionNeeded: `Check logs. Error: ${processError.message}`,
        adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
      });

      throw processError;
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
