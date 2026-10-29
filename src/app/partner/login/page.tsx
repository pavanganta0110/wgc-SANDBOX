import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import PartnerLoginForm from "./PartnerLoginForm";

export const metadata = { title: "Partner Login | WGC Payments", robots: { index: false, follow: false } };

export default async function PartnerLoginPage() {
  if (await getPartnerSession()) redirect("/partner/organizations");

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900">Partner Login</h1>
        <p className="text-sm text-slate-600 mt-2 mb-8">Sign in to manage your organizations, API keys and webhooks.</p>
        <PartnerLoginForm />
      </main>
      <Footer />
    </div>
  );
}
