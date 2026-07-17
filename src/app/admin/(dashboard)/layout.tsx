import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware already redirects unauthenticated/wrong-role
  // requests before this layout ever renders, but this is the real,
  // DB-backed check (disabled account, password-changed-since-issued
  // invalidation) — middleware's is a fast stateless pre-check only.
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const roleLabel = session.role === "wgc_super_admin" ? "Super Admin" : "Admin";

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <div className="flex-grow flex flex-col md:flex-row">
        <AdminSidebar role={session.role} />
        <div className="flex-grow flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-slate-100 bg-white">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{session.name || session.email}</h1>
              <p className="text-xs text-slate-500">{roleLabel} · Admin Dashboard</p>
            </div>
            <AdminLogoutButton />
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
