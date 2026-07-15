import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import UpdateForm from "./UpdateForm"; // We will create this client component next

export default async function SecureUpdatePage({
  params
}: {
  params: { token: string };
}) {
  const token = params.token;
  
  if (!token) {
    notFound();
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const app = await prisma.onboardingApplication.findFirst({
    where: {
      updateTokenHash: tokenHash,
      updateTokenExpiresAt: {
        gt: new Date()
      }
    }
  });

  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Link Expired or Invalid</h1>
          <p className="text-gray-600 mb-6">
            This secure update link has expired or is no longer valid. If you still need to provide information, please contact support.
          </p>
          <a href="mailto:support@wgcpayments.com" className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  // Determine if it was already submitted
  if (app.onboardingStatus !== "MORE_INFORMATION_REQUIRED" && app.onboardingStatus !== "ADDITIONAL_INFO_NEEDED") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Information Received</h1>
          <p className="text-gray-600">
            Thank you! Your information has been received and is currently under review. 
            We will notify you once the review is complete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FBFF] flex items-center justify-center p-4 py-12">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0B1320] mb-2">Additional Information Required</h1>
          <p className="text-gray-600">
            We need a few more details to continue reviewing the WGC Payments account for <strong className="text-[#0B1320]">{app.organizationName}</strong>.
          </p>
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-xl p-5 mb-8">
          <h3 className="font-bold text-orange-900 mb-2">Requested Items:</h3>
          <div className="text-orange-800 text-sm space-y-2 whitespace-pre-wrap">{app.updateRequestedItems || "Additional documentation is required."}</div>
        </div>

        <UpdateForm token={token} />

        <div className="mt-8 pt-6 border-t text-center text-sm text-gray-500">
          Need help? <a href="mailto:support@wgcpayments.com" className="text-blue-600 hover:underline">Contact Support</a>
        </div>
      </div>
    </div>
  );
}
