import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AcceptInviteForm from "./AcceptInviteForm";

export const metadata = { title: "Set up your partner account | WGC Payments", robots: { index: false, follow: false } };

export default async function PartnerAcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900">Set up your partner account</h1>
        <p className="text-sm text-slate-600 mt-2 mb-8">Choose a password to finish. It must be at least 12 characters.</p>
        <AcceptInviteForm token={token} />
      </main>
      <Footer />
    </div>
  );
}
