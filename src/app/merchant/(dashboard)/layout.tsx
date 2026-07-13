import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Sidebar from "@/components/merchant/Sidebar";
import LogoutButton from "@/components/merchant/LogoutButton";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export default async function MerchantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    redirect("/merchant/login");
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  if (!church) {
    redirect("/merchant/login");
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <div className="flex-grow flex">
        <Sidebar />
        <div className="flex-grow flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-slate-100 bg-white">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{church.name}</h1>
              <p className="text-xs text-slate-500">Merchant Dashboard</p>
            </div>
            <LogoutButton />
          </div>
          <main className="flex-grow px-6 md:px-10 py-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
