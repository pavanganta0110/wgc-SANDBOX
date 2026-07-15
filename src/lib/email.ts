import { Resend } from 'resend';

// Lazy — constructing Resend eagerly at module load time throws whenever
// RESEND_API_KEY is unset/empty (confirmed: this crashes locally today),
// which means merely importing this file anywhere — even a route that
// never actually sends an email — takes down the whole request. Deferred
// until sendWgcEmail actually runs, where the existing missing-key check
// already handles it gracefully.
let resend: Resend | null = null;
function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

interface WgcEmailOptions {
  to: string;
  subject: string;
  previewText?: string;
  title: string;
  badgeText?: string;
  badgeColor?: string; // e.g. "#C99A2E" or "#10B981"
  bodyHtml: string;
  attachments?: { filename: string; content: Buffer }[];
}

const WGC_LOGO_URL = "https://wgcpayments.com/wgc-logo.png";

export function generateWgcEmailHtml(options: WgcEmailOptions) {
  const { title, previewText, bodyHtml, badgeText, badgeColor = "#0B5DBC" } = options;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      ${previewText ? `<div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>` : ''}
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF;">

              <!-- Header with Logo -->
              <tr>
                <td style="padding: 20px 40px 30px 40px; text-align: center;">
                  <img src="${WGC_LOGO_URL}" alt="WGC Payments" style="width: 220px; height: auto; max-width: 100%; display: block; margin: 0 auto; border: 0;" />
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px;">
                  
                  ${badgeText ? `
                  <div style="text-align: center; margin-bottom: 20px;">
                    <span style="display: inline-block; padding: 6px 12px; background-color: ${badgeColor}15; color: ${badgeColor}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-radius: 20px;">
                      ${badgeText}
                    </span>
                  </div>
                  ` : ''}

                  <h1 style="color: #0B1320; font-size: 24px; font-weight: 700; text-align: center; margin: 0 0 24px 0;">
                    ${title}
                  </h1>

                  <div style="color: #4A5568; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                    ${bodyHtml}
                  </div>

                  <!-- Support Box -->
                  <div style="background-color: #F8FBFF; border-left: 4px solid #C99A2E; padding: 20px; border-radius: 4px; margin-top: 40px;">
                    <h3 style="margin: 0 0 10px 0; color: #0B1320; font-size: 16px;">Need help?</h3>
                    <p style="margin: 0; color: #4A5568; font-size: 14px; line-height: 1.5;">
                      Contact WGC Payments Support at <a href="mailto:support@wgcpayments.com" style="color: #0B5DBC; text-decoration: none; font-weight: 600;">support@wgcpayments.com</a>
                    </p>
                  </div>
                  
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #F0F4F8;">
                  <p style="margin: 0; color: #4A5568; font-size: 14px; line-height: 1.5;">
                    Thank you,<br/>
                    <strong>WGC Payments Team</strong><br/>
                    <a href="mailto:support@wgcpayments.com" style="color: #0B5DBC; text-decoration: none;">support@wgcpayments.com</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendWgcEmail(options: WgcEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Email not sent.");
    return { success: false, error: "Missing API Key" };
  }

  const html = generateWgcEmailHtml(options);

  // Plain Text Fallback
  // Strip simple HTML tags from bodyHtml for the text version
  const cleanBody = options.bodyHtml
    .replace(/<br\s*[\/]?>/gi, '\\n')
    .replace(/<\/p>/gi, '\\n\\n')
    .replace(/<[^>]+>/g, '')
    .trim();

  const text = `
${options.title}
${options.badgeText ? `[Status: ${options.badgeText}]` : ''}

${cleanBody}

Need help? Contact WGC Payments Support at support@wgcpayments.com

Thank you,
WGC Payments Team
support@wgcpayments.com
  `.trim();

  try {
    const response = await getResendClient().emails.send({
      from: process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>",
      replyTo: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
      to: options.to,
      subject: options.subject,
      html,
      text,
      ...(options.attachments ? { attachments: options.attachments } : {}),
    });

    if (response.error) {
      console.error("Resend API returned error:", response.error);
      return { success: false, error: response.error };
    }

    console.log("WGC Email sent successfully:", response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error("Failed to send WGC email:", error);
    return { success: false, error };
  }
}

interface WgcAdminEmailOptions {
  merchantName: string;
  contactEmail: string;
  finixMerchantId?: string;
  finixIdentityId?: string;
  newStatus: string;
  verificationState?: string;
  documentsUploaded?: string;
  whatHappened: string;
  actionNeeded: string;
  adminDashboardLink: string;
  customSubject?: string;
}

export async function sendWgcAdminEmail(options: WgcAdminEmailOptions) {
  const {
    merchantName,
    contactEmail,
    finixMerchantId,
    finixIdentityId,
    newStatus,
    verificationState,
    documentsUploaded,
    whatHappened,
    actionNeeded,
    adminDashboardLink,
    customSubject
  } = options;

  const adminEmail = process.env.SUPPORT_EMAIL || "support@wgcpayments.com";

  let statusBadgeColor = "#0B5DBC";
  if (newStatus === "APPROVED") statusBadgeColor = "#10B981"; // Green
  else if (newStatus === "MORE_INFORMATION_REQUIRED" || newStatus === "ADDITIONAL_INFO_NEEDED") statusBadgeColor = "#F59E0B"; // Orange
  else if (newStatus === "REJECTED" || newStatus === "FAILED") statusBadgeColor = "#EF4444"; // Red

  const bodyHtml = `
    <p><strong>Business Name:</strong> ${merchantName}</p>
    <p><strong>Contact Email:</strong> ${contactEmail}</p>
    ${finixMerchantId ? `<p><strong>Finix Merchant ID:</strong> ${finixMerchantId}</p>` : ''}
    ${finixIdentityId ? `<p><strong>Finix Identity ID:</strong> ${finixIdentityId}</p>` : ''}
    ${documentsUploaded ? `<p><strong>Documents Uploaded:</strong> ${documentsUploaded}</p>` : ''}
    <p><strong>New Status:</strong> ${newStatus}</p>
    ${verificationState ? `<p><strong>Verification State:</strong> ${verificationState}</p>` : ''}
    
    <div style="margin-top: 20px; padding: 15px; background-color: #F0F4F8; border-radius: 8px;">
      <p style="margin-top: 0;"><strong>What happened:</strong><br/>${whatHappened}</p>
      <p style="margin-bottom: 0;"><strong>What action is needed:</strong><br/>${actionNeeded}</p>
    </div>
  `;

  return await sendWgcEmail({
    to: adminEmail,
    subject: customSubject || `[WGC Admin] Merchant Status Update: ${merchantName} - ${newStatus}`,
    title: "Merchant Application Update",
    badgeText: newStatus,
    badgeColor: statusBadgeColor,
    bodyHtml: bodyHtml + `<p><a href="${adminDashboardLink}">View in Admin Dashboard</a></p>`,
  });
}

export interface WgcAdminOnboardingNotificationOptions {
  organizationName: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  organizationType: string;
  businessTaxId: string; // The raw EIN/TaxID. The function will extract only the last 4.
  website?: string;
  submittedAt: Date;
  applicationId: string;
  finixIdentityId?: string;
  status: string;
}

export async function sendWgcAdminOnboardingNotification(options: WgcAdminOnboardingNotificationOptions) {
  const adminEmail = process.env.SUPPORT_EMAIL || "support@wgcpayments.com";
  const {
    organizationName,
    applicantName,
    applicantEmail,
    applicantPhone,
    organizationType,
    businessTaxId,
    website,
    submittedAt,
    applicationId,
    finixIdentityId,
    status
  } = options;

  const last4Ein = businessTaxId ? businessTaxId.slice(-4) : "N/A";
  const adminDashboardLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://wgcpayments.com'}/admin/merchant-applications/${applicationId}`;

  const bodyHtml = `
    <p>A new merchant onboarding application has been successfully submitted.</p>
    <table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Organization Name:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${organizationName}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Applicant Name:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${applicantName}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Applicant Email:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${applicantEmail}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Applicant Phone:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${applicantPhone}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Organization Type:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${organizationType}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>EIN (Last 4):</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${last4Ein}</td></tr>
      ${website ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Website:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><a href="${website}" target="_blank">${website}</a></td></tr>` : ''}
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Submission Date:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${submittedAt.toLocaleString()}</td></tr>
      <tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Application ID:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${applicationId}</td></tr>
      ${finixIdentityId ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;"><strong>Finix Identity ID:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0;">${finixIdentityId}</td></tr>` : ''}
      <tr><td style="padding: 8px 0;"><strong>Current Status:</strong></td><td style="padding: 8px 0;">${status}</td></tr>
    </table>
    <div style="margin-top: 30px; text-align: center;">
      <a href="${adminDashboardLink}" style="display: inline-block; padding: 10px 20px; background-color: #0B5DBC; color: #FFFFFF; text-decoration: none; border-radius: 4px; font-weight: 600;">Review Application</a>
    </div>
  `;

  return await sendWgcEmail({
    to: adminEmail,
    subject: `New Merchant Onboarding Submitted — ${organizationName}`,
    title: "New Merchant Application",
    badgeText: "NEW",
    badgeColor: "#0B5DBC",
    bodyHtml,
  });
}
