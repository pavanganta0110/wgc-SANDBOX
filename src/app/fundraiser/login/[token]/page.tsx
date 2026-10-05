import { redirect } from "next/navigation";
import { consumeFundraiserLoginToken } from "@/lib/fundraiserPortal/fundraiserAuth";

export default async function FundraiserLoginTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await consumeFundraiserLoginToken(token);

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Login Link Invalid</h1>
          <p className="text-sm text-slate-500">{result.error} Please request a new login link from your fundraiser page.</p>
        </div>
      </div>
    );
  }

  redirect("/fundraiser");
}
