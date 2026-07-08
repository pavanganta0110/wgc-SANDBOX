import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";

const WEBHOOK_SECRET = process.env.FINIX_WEBHOOK_SECRET || process.env.FINIX_WEBHOOK_SIGNING_KEY;
const BEARER_TOKEN = process.env.FINIX_WEBHOOK_BEARER_TOKEN;
const BASIC_AUTH_USERNAME = process.env.FINIX_WEBHOOK_USERNAME || process.env.FINIX_WEBHOOK_BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD = process.env.FINIX_WEBHOOK_PASSWORD || process.env.FINIX_WEBHOOK_BASIC_AUTH_PASSWORD;

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

function getFinixEventData(payload: any) {
  const entity = String(payload.entity || payload.data?.resource_type || "UNKNOWN").toUpperCase();
  const type = String(payload.type || "").toLowerCase();
  const data =
    payload.data ||
    payload._embedded?.merchants?.[0] ||
    payload._embedded?.identities?.[0] ||
    payload._embedded?.verifications?.[0] ||
    payload._embedded?.onboarding_forms?.[0] ||
    {};

  return { entity, type, data, eventType: `${entity.toLowerCase()}.${type}` };
}

async function findOnboardingApplicationForFinixEvent(data: any) {
  const finixIds = [
    data?.id,
    data?.merchant,
    data?.identity,
    data?.verification,
    data?.application,
  ].filter(Boolean);

  if (finixIds.length === 0) {
    return null;
  }

  return prisma.onboardingApplication.findFirst({
    where: {
      OR: [
      ...finixIds.flatMap((id) => [
          { finixIdentityId: id },
          { finixMerchantId: id },
          { finixVerificationId: id },
          { finixApplicationId: id },
        ]),
      ],
    },
  });
}

export async function POST(req: Request) {
  try {
    const headerList = await headers();
    const signatureHeader = headerList.get("finix-signature");
    const authHeader = headerList.get("authorization") || "";
    const rawBody = await req.text();
    const authConfigured = Boolean(BEARER_TOKEN || BASIC_AUTH_USERNAME || BASIC_AUTH_PASSWORD);

    if (authConfigured) {
      const authChecks: { name: string; valid: boolean }[] = [];

      if (BEARER_TOKEN) {
        const match = authHeader.match(/^Bearer\s+(.*)$/i);
        authChecks.push({
          name: "Bearer",
          valid: Boolean(match && match[1] === BEARER_TOKEN),
        });
      }

      if (BASIC_AUTH_USERNAME || BASIC_AUTH_PASSWORD) {
        const match = authHeader.match(/^Basic\s+(.*)$/i);
        let basicValid = false;

        if (match) {
          try {
            const decoded = Buffer.from(match[1], "base64").toString("utf8");
            const separatorIndex = decoded.indexOf(":");
            const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
            const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

            basicValid = username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD;
          } catch {
            basicValid = false;
          }
        }

        authChecks.push({
          name: "Basic",
          valid: basicValid,
        });
      }

      if (!authChecks.some((check) => check.valid)) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid authentication" },
          { status: 401 }
        );
      }
    }

    if (!WEBHOOK_SECRET || !signatureHeader) {
      return NextResponse.json(
        { error: "Unauthorized: Missing Signature" },
        { status: 401 }
      );
    }

    const sigParts = signatureHeader.split(",");
    let timestamp = "";
    let signature = "";
    for (const part of sigParts) {
      const [key, value] = part.trim().split("=");
      if (key === "timestamp") timestamp = value;
      if (key === "sig") signature = value;
    }

    if (!timestamp || !signature) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid Signature Format" },
        { status: 401 }
      );
    }

    const payloadToSign = `${timestamp}:${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(payloadToSign, "utf-8")
      .digest("hex");

    if (signature.length !== expectedSignature.length) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid Signature" },
        { status: 401 }
      );
    }

    if (
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid Signature" },
        { status: 401 }
      );
    }

    const eventTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (Number.isNaN(eventTime) || Math.abs(now - eventTime) > 300) {
      return NextResponse.json(
        { error: "Unauthorized: Timestamp too old" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const { entity, eventType, data } = getFinixEventData(payload);
    const eventId = payload.id;
    const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();

    let identityId = data?.identity;
    let merchantId = data?.merchant;
    if (!merchantId && entity === "MERCHANT") {
      merchantId = data?.id;
    }
    if (!identityId && entity === "IDENTITY") {
      identityId = data?.id;
    }

    const verificationId = entity === "VERIFICATION" ? data?.id : undefined;

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
      const app = await findOnboardingApplicationForFinixEvent(data);

      if (!app) {
        await prisma.finixWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: { processedAt: new Date(), processingStatus: "COMPLETED" },
        });

        return NextResponse.json(
          { message: "Webhook recorded (no matching onboarding app)" },
          { status: 200 }
        );
      }

      const contactEmail = app.contactEmail;
      const orgName = app.legalBusinessName || app.organizationName;
      const safeOrgName = orgName || "your organization";

      const updateData: any = {
        lastFinixEventId: eventId,
        lastFinixEventType: eventType,
        lastWebhookPayloadSummary: { type: eventType, entity, status: data?.status, state: data?.state, onboarding_state: data?.onboarding_state }
      };

      if (eventType === "merchant.created") {
        const onboardingState = data?.onboarding_state;
        if (onboardingState === "PROVISIONING") {
          if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
            updateData.onboardingStatus = "UNDER_REVIEW";
            updateData.finixMerchantId = data.id;
            updateData.lastStatusChangedAt = new Date();
          }
        }
      } else if (eventType === "merchant.underwritten" || eventType === "merchant.updated") {
        const onboardingState = data?.onboarding_state;
        const status = data?.status;

        if (onboardingState === "APPROVED" || status === "APPROVED") {
          const wasAlreadyApproved = app.onboardingStatus === "APPROVED";
          updateData.onboardingStatus = "APPROVED";
          updateData.onboardingState = "APPROVED";
          updateData.processingEnabled = data?.processing_enabled || false;
          updateData.settlementEnabled = data?.settlement_enabled || false;
          if (!wasAlreadyApproved) {
            updateData.lastStatusChangedAt = new Date();
            updateData.approvedAt = new Date();
          }

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
            finixMerchantId: app.finixMerchantId || data.id,
            finixIdentityId: app.finixIdentityId || undefined,
            newStatus: "APPROVED",
            whatHappened: "Finix approved the merchant onboarding application.",
            actionNeeded: "None.",
            adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
          });
        } else if (onboardingState === "UPDATE_REQUESTED") {
          if (app.onboardingStatus !== "MORE_INFORMATION_REQUIRED" && app.onboardingStatus !== "APPROVED") {
            updateData.onboardingStatus = "MORE_INFORMATION_REQUIRED";
            updateData.onboardingState = "UPDATE_REQUESTED";
            updateData.lastStatusChangedAt = new Date();
            updateData.updateRequestedAt = new Date();

            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            updateData.updateTokenHash = tokenHash;
            updateData.updateTokenExpiresAt = expiresAt;

            let requestedItemsStr = "Additional documentation is required to verify your business and identity.";
            if (data?.messages) {
              updateData.updateRequestedCodes = data.messages;
              try {
                const msgs = Array.isArray(data.messages) ? data.messages : [data.messages];
                const items = msgs.map((m: any) => typeof m === "object" ? (m.message || m.code || JSON.stringify(m)) : m);
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
              finixMerchantId: app.finixMerchantId || data.id,
              newStatus: "MORE_INFORMATION_REQUIRED",
              whatHappened: "Finix requested additional information or documents for the merchant.",
              actionNeeded: "Merchant has been sent a secure upload link.",
              adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
            });
          }
        } else if (onboardingState === "REJECTED" || status === "REJECTED" || status === "FAILED") {
          const wasAlreadyRejected = app.onboardingStatus === "REJECTED";
          updateData.onboardingStatus = "REJECTED";
          updateData.onboardingState = "REJECTED";
          if (!wasAlreadyRejected) {
            updateData.lastStatusChangedAt = new Date();
            updateData.rejectedAt = new Date();
          }

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
            finixMerchantId: app.finixMerchantId || data.id,
            newStatus: "REJECTED",
            whatHappened: "Finix rejected the merchant onboarding application.",
            actionNeeded: "Review rejection reason in Finix. Contact merchant if needed.",
            adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
          });
        }
      } else if (eventType === "verification.created") {
        const state = data?.state;
        if (state === "PENDING") {
          updateData.finixVerificationId = data.id;
          updateData.verificationState = "PENDING";
          if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
            updateData.onboardingStatus = "UNDER_REVIEW";
          }
        }
      } else if (eventType === "verification.updated") {
        const state = data?.state;
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
