import { CheckCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default async function OnboardingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const { applicationId } = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-3xl w-full mx-auto py-24 px-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-8">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Application Submitted!</h1>
        <p className="text-lg text-slate-600 max-w-2xl mb-10">
          Your onboarding application has been submitted. Reviews are completed within 48 hours, often quicker. We will email you once your account is approved or if we require more information.
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
