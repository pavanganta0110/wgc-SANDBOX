import { prisma } from "@/lib/prisma";
import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { Resend } from "resend";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function OnboardingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ app_id?: string }>;
}) {
  const { app_id } = await searchParams;

  if (app_id) {
    // Look up application
    const app = await prisma.onboardingApplication.findUnique({
      where: { id: app_id },
    });

    if (app && app.status !== "SUBMITTED" && app.status !== "APPROVED" && app.status !== "UNDER_REVIEW") {
      // Mark as submitted
      await prisma.onboardingApplication.update({
        where: { id: app_id },
        data: { 
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });

      // Check idempotency
      const existingLog = await prisma.emailLog.findFirst({
        where: {
          onboardingApplicationId: app_id,
          type: "ONBOARDING_SUBMITTED",
        },
      });

      if (!existingLog) {
        // Send submitted email
        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>",
            to: [app.contactEmail],
            subject: "WGC Payments onboarding submitted",
            html: `<p>Hi ${app.contactName},</p>
                   <p>Thank you for submitting your WGC Payments onboarding form for ${app.organizationName}.</p>
                   <p>Your application is now under review. Most reviews are completed within 24–48 hours.</p>
                   <p>We will notify you once your account is approved or if Finix requires additional information.</p>
                   <p>Thank you,<br/>WGC Payments</p>`,
          });

          await prisma.emailLog.create({
            data: {
              onboardingApplicationId: app_id,
              type: "ONBOARDING_SUBMITTED",
              to: app.contactEmail,
              subject: "WGC Payments onboarding submitted",
              status: "SENT",
              sentAt: new Date(),
            },
          });
        } catch (err) {
          console.error("Failed to send submitted email:", err);
        }
      }
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-3xl w-full mx-auto py-24 px-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-8">
        <CheckCircle className="w-10 h-10" />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 mb-4">Application Submitted!</h1>
      <p className="text-lg text-slate-600 max-w-2xl mb-10">
        Your onboarding form has been submitted. Most reviews are completed within 24–48 hours. We will notify you via email once your account is approved or if we need any additional information.
      </p>
      <Link 
        href="/"
        className="metallic-gold px-8 py-4 text-sm font-bold rounded-xl shadow-lg transition-all text-slate-900"
      >
        Return to Home
      </Link>
      </main>
      <Footer />
    </div>
  );
}
