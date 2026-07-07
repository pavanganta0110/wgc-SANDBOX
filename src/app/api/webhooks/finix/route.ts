import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const WEBHOOK_SECRET = process.env.FINIX_WEBHOOK_SECRET;

async function sendWebhookEmail(
  applicationId: string,
  type: string,
  to: string,
  subject: string,
  html: string
) {
  // Check if we already sent this type of email to prevent duplicates
  const existingLog = await prisma.emailLog.findFirst({
    where: {
      onboardingApplicationId: applicationId,
      type: type,
    },
  });

  if (existingLog) {
    console.log(`Email of type ${type} already sent for application ${applicationId}`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>",
      to: [to],
      subject: subject,
      html: html,
    });

    await prisma.emailLog.create({
      data: {
        onboardingApplicationId: applicationId,
        type: type,
        to: to,
        subject: subject,
        status: error ? "ERROR" : "SENT",
        providerMessageId: data?.id || null,
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
    const authHeader = headerList.get("authorization") || "";
    const signature = headerList.get("finix-signature");
    const rawBody = await req.text();

    const basicAuthUser = process.env.FINIX_WEBHOOK_BASIC_USERNAME || "wgc_finix_webhook";
    const basicAuthPass = process.env.FINIX_WEBHOOK_BASIC_PASSWORD || "Pavankumarreddy145@";

    let isAuthenticated = false;

    // Check Basic Auth
    const match = authHeader.match(/^Basic\s+(.*)$/i);
    if (match) {
      const credentials = Buffer.from(match[1], "base64").toString("utf-8");
      const [username, password] = credentials.split(":");
      if (username === basicAuthUser && password === basicAuthPass) {
        isAuthenticated = true;
      }
    }

    // Check HMAC Signature if Basic Auth failed but secret is present
    if (!isAuthenticated && WEBHOOK_SECRET && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature === expectedSignature) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.type;
    const eventId = payload.id;
    let relatedFinixId = null;

    // Determine related ID
    if (payload.data?.id) {
      relatedFinixId = payload.data.id;
    }

    // Save webhook event (idempotency check)
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { providerEventId: eventId },
    });

    if (existingEvent) {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        provider: "FINIX",
        eventType,
        providerEventId: eventId,
        relatedFinixId,
        payload,
      },
    });

    try {
      // Process event based on type
      let app = null;

      if (payload.data?.id) {
        // Find application by Identity ID, Merchant ID, or Form ID
        app = await prisma.onboardingApplication.findFirst({
          where: {
            OR: [
              { finixIdentityId: payload.data.id },
              { finixMerchantId: payload.data.id },
              { finixMerchantId: payload.data.merchant }, // sometimes related via merchant field
              { finixIdentityId: payload.data.identity },
            ],
          },
        });
      }

      if (app) {
        const contactEmail = app.contactEmail;
        const contactName = app.contactName;
        const orgName = app.organizationName;

        switch (eventType) {
          case "onboarding_form.updated": {
            if (payload.data.status === "COMPLETED" || payload.data.status === "SUBMITTED") {
              if (app.status === "DRAFT" || app.status === "ONBOARDING_LINK_CREATED") {
                 await prisma.onboardingApplication.update({
                   where: { id: app.id },
                   data: { status: "SUBMITTED", submittedAt: new Date() }
                 });
                 // Send submitted email
                 await sendWebhookEmail(
                   app.id,
                   "ONBOARDING_SUBMITTED",
                   contactEmail,
                   "WGC Payments onboarding submitted",
                   `<p>Hi ${contactName},</p><p>Thank you for submitting your WGC Payments onboarding form for ${orgName}.</p><p>Your application is now under review. Most reviews are completed within 24–48 hours.</p><p>We will notify you once your account is approved or if Finix requires additional information.</p><p>Thank you,<br/>WGC Payments</p>`
                 );
              }
            }
            break;
          }
          case "merchant.created":
          case "merchant.updated": {
            const status = payload.data.status;
            let newStatus = app.status;
            let approvedAt = app.approvedAt;
            let rejectedAt = app.rejectedAt;
            let updateRequestedAt = app.updateRequestedAt;

            if (status === "APPROVED") {
              newStatus = "APPROVED";
              if (!approvedAt) approvedAt = new Date();
              // Send approved email
              await sendWebhookEmail(
                app.id,
                "APPROVED",
                contactEmail,
                "WGC Payments account approved",
                `<p>Hi ${contactName},</p><p>Good news — your WGC Payments account for ${orgName} has been approved.</p><p>You will receive access to your Finix Sub-Merchant Dashboard.</p><p>Finix Dashboard Login:<br/><a href="${process.env.NEXT_PUBLIC_FINIX_DASHBOARD_LOGIN_URL || "#"}">${process.env.NEXT_PUBLIC_FINIX_DASHBOARD_LOGIN_URL || "Finix Dashboard"}</a></p><p>Thank you,<br/>WGC Payments</p>`
              );
            } else if (status === "REJECTED") {
              newStatus = "REJECTED";
              if (!rejectedAt) rejectedAt = new Date();
              // Send rejected email
              await sendWebhookEmail(
                app.id,
                "REJECTED",
                contactEmail,
                "WGC Payments onboarding update",
                `<p>Hi ${contactName},</p><p>We’re sorry, but your WGC Payments onboarding for ${orgName} could not be approved at this time.</p><p>Please contact WGC Payments support for next steps.</p><p>Support: ${process.env.SUPPORT_EMAIL || "support@wgcpayments.com"}</p><p>Thank you,<br/>WGC Payments</p>`
              );
            }

            await prisma.onboardingApplication.update({
              where: { id: app.id },
              data: {
                status: newStatus,
                approvedAt,
                rejectedAt,
                finixMerchantId: payload.data.id,
                processingEnabled: payload.data.processing_enabled || false,
                settlementEnabled: payload.data.settlement_enabled || false,
              },
            });
            break;
          }
          case "identity.updated": {
            if (payload.data.status === "UPDATE_REQUESTED") {
              await prisma.onboardingApplication.update({
                where: { id: app.id },
                data: {
                  status: "ADDITIONAL_INFO_NEEDED",
                  updateRequestedAt: new Date(),
                },
              });

              // Send additional info email
              const resumeLink = app.finixOnboardingUrl || "your Finix dashboard";
              await sendWebhookEmail(
                app.id,
                "ADDITIONAL_INFO_NEEDED",
                contactEmail,
                "Additional information needed for WGC Payments onboarding",
                `<p>Hi ${contactName},</p><p>Finix requires additional information before your WGC Payments account can be approved.</p><p>Please continue the secure onboarding update process here:</p><p><a href="${resumeLink}">${resumeLink}</a></p><p>Once the updated information is submitted, Finix will continue the review.</p><p>Thank you,<br/>WGC Payments</p>`
              );
            }
            break;
          }
        }
      }

      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });

      return NextResponse.json({ success: true });
    } catch (processError) {
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingError: (processError as Error).message },
      });
      throw processError; // Re-throw to return 500
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
