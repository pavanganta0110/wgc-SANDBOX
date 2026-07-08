import { generateWgcEmailHtml } from "@/lib/email";

export default function EmailPreviewPage() {
  const businessName = "Test Business LLC";
  const contactEmail = "test@example.com";
  const finixMerchantId = "MUxxx123";
  const finixIdentityId = "IDxxx456";

  const emails = [
    {
      name: "Application Submitted",
      html: generateWgcEmailHtml({
        to: contactEmail,
        subject: "WGC Payments Onboarding Submitted",
        title: "Application Submitted",
        badgeText: "Under Review",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p>Thank you for submitting your onboarding application for <strong>${businessName}</strong>.</p>
                   <p>Your application is currently under review. We will notify you once your account has been approved or if we need any additional information.</p>`
      })
    },
    {
      name: "More Information Required",
      html: generateWgcEmailHtml({
        to: contactEmail,
        subject: "Additional information needed for your WGC Payments account",
        title: "Additional information is required",
        badgeText: "Action Required",
        badgeColor: "#F59E0B",
        bodyHtml: `<p>We need additional information to continue reviewing your WGC Payments account for <strong>${businessName}</strong>.</p>
                 <p><strong>Requested items:</strong><br/>• Government ID<br/>• Bank Statement</p>
                 <p>Please use the secure link below to submit the requested information.</p>
                 <p><a href="https://wgcpayments.com/onboarding/update/dummy-token">Submit Required Information</a></p>`
      })
    },
    {
      name: "Additional Information Received",
      html: generateWgcEmailHtml({
        to: contactEmail,
        subject: "Additional information received — WGC Payments",
        title: "Additional information received",
        badgeText: "Under Review",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p>We have received the additional information for your WGC Payments account for <strong>${businessName}</strong>.</p>
                 <p>Your application has been resubmitted for review. We will notify you once the review is completed or if any further information is required.</p>`
      })
    },
    {
      name: "Application Approved",
      html: generateWgcEmailHtml({
        to: contactEmail,
        subject: "Your WGC Payments account has been approved",
        title: "Your account has been approved",
        badgeText: "Approved",
        badgeColor: "#10B981",
        bodyHtml: `<p>Hi ${businessName},</p>
                   <p>Great news — your WGC Payments account has been approved.</p>
                   <p>Your merchant account is now approved for payment processing. You will receive a separate secure dashboard access email with instructions to log in and set or reset your password.</p>`
      })
    },
    {
      name: "Application Rejected",
      html: generateWgcEmailHtml({
        to: contactEmail,
        subject: "WGC Payments Onboarding Rejected",
        title: "Application Rejected",
        badgeText: "Rejected",
        badgeColor: "#EF4444",
        bodyHtml: `<p>Unfortunately, we are unable to approve your application for <strong>${businessName}</strong> at this time.</p>
                   <p>If you believe this is a mistake, please contact our support team.</p>`
      })
    },
    {
      name: "Admin Notification (Documents Submitted)",
      html: generateWgcEmailHtml({
        to: "support@wgcpayments.com",
        subject: `Merchant documents submitted — ${businessName}`,
        title: "Merchant Application Update",
        badgeText: "UNDER_REVIEW",
        badgeColor: "#0B5DBC",
        bodyHtml: `
          <p><strong>Business Name:</strong> ${businessName}</p>
          <p><strong>Contact Email:</strong> ${contactEmail}</p>
          <p><strong>Finix Merchant ID:</strong> ${finixMerchantId}</p>
          <p><strong>Finix Identity ID:</strong> ${finixIdentityId}</p>
          <p><strong>Documents Uploaded:</strong> id_front.jpg</p>
          <p><strong>New Status:</strong> UNDER_REVIEW</p>
          <div style="margin-top: 20px; padding: 15px; background-color: #F0F4F8; border-radius: 8px;">
            <p style="margin-top: 0;"><strong>What happened:</strong><br/>The merchant successfully uploaded a document via the secure link. A new verification was triggered.</p>
            <p style="margin-bottom: 0;"><strong>What action is needed:</strong><br/>Wait for Finix to review the new verification.</p>
          </div>
        `
      })
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Email Templates Preview</h1>
      <p className="text-gray-600 mb-8">
        This is an internal development route to preview exactly how WGC emails render.
        Note that different mail clients (Outlook, Gmail) might render slightly differently.
      </p>

      <div className="space-y-16">
        {emails.map((email, idx) => (
          <div key={idx} className="border rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="bg-gray-100 p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">{email.name}</h2>
            </div>
            {/* Desktop Preview */}
            <div className="p-6 bg-gray-50 flex justify-center border-b">
              <div className="w-[600px] bg-white shadow-lg border rounded">
                <iframe
                  srcDoc={email.html}
                  className="w-full"
                  style={{ height: '700px' }}
                />
              </div>
            </div>
            {/* Mobile Preview */}
            <div className="p-6 bg-gray-200 flex justify-center">
              <div className="w-[375px] bg-white shadow-2xl border-4 border-black rounded-[40px] overflow-hidden relative">
                <div className="bg-black h-6 w-32 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl"></div>
                <iframe
                  srcDoc={email.html}
                  className="w-full mt-6"
                  style={{ height: '600px' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
