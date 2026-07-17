import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminSetPasswordForm from "@/components/admin/AdminSetPasswordForm";

export default function AdminResetPasswordPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Reset your password</h1>
        <p className="text-slate-600 text-sm text-center mb-8">Choose a new password for your admin account.</p>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <Suspense fallback={null}>
            <AdminSetPasswordForm mode="reset" />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}
