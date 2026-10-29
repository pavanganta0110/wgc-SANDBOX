import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password | WGC Payments", robots: { index: false, follow: false } };

export default function PartnerForgotPasswordPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
        <p className="text-sm text-slate-600 mt-2 mb-8">Enter the email on your partner account and we&apos;ll send you a link.</p>
        <ForgotPasswordForm />
      </main>
      <Footer />
    </div>
  );
}
