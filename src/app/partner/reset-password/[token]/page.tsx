import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AcceptInviteForm from "../../accept-invite/[token]/AcceptInviteForm";

export const metadata = { title: "Choose a new password | WGC Payments", robots: { index: false, follow: false } };

export default async function PartnerResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
        <p className="text-sm text-slate-600 mt-2 mb-8">It must be at least 12 characters. Saving it signs you out everywhere else.</p>
        <AcceptInviteForm token={token} />
      </main>
      <Footer />
    </div>
  );
}
