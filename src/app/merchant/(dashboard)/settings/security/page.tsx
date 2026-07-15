import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import SecuritySettingsForm from "@/components/merchant/SecuritySettingsForm";

export default async function SecuritySettingsPage() {
  const session = await getSession();
  const user = await prisma.user.findUnique({ where: { id: session!.userId }, select: { lastLoginAt: true, email: true } });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Security</h3>
      <p className="text-xs text-slate-500 mb-6">Manage sign-in credentials for your WGC Payments dashboard account.</p>
      <SecuritySettingsForm
        email={user?.email || session!.email}
        lastLoginAt={user?.lastLoginAt ? user.lastLoginAt.toISOString() : null}
      />
    </div>
  );
}
