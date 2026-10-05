import FundraiserLoginForm from "@/components/fundraiser/FundraiserLoginForm";

export default function FundraiserLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h1 className="text-lg font-semibold text-slate-900 mb-1 text-center">Fundraiser Login</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">Enter the email you registered your fundraiser with.</p>
        <FundraiserLoginForm />
      </div>
    </div>
  );
}
