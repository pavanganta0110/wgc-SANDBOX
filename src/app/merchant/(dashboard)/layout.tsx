import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/merchant/Sidebar";
import LogoutButton from "@/components/merchant/LogoutButton";
import ComplianceBanner from "@/components/merchant/ComplianceBanner";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { reconcileComplianceFormsForChurch, resolveComplianceStatus } from "@/lib/finix/sync/complianceForms";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveViewScope } from "@/lib/auth/viewScope";
import ViewScopeSelector from "@/components/merchant/ViewScopeSelector";

export default async function MerchantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Team-access Checkpoint 4D: this layout wraps every /merchant page and
  // was gated on the literal legacy "church_admin" role string — every
  // account migrated to owner/admin/fundraiser/viewer since the
  // Checkpoint 2 backfill was redirected to /merchant/login here. Migrated
  // to requireMerchantSession(), which accepts every normalized org role
  // and still fails closed for wgc_admin and disabled/stale sessions.
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });

  if (!church) {
    redirect("/merchant/login");
  }

  const { after } = require("next/server");
  after(async () => {
    try {
      await reconcileComplianceFormsForChurch(auth.churchId);
    } catch (err) {
      console.error("Compliance sync background task failed:", err);
    }
  });

  const complianceForm = await prisma.complianceForm.findFirst({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
  });
  const complianceStatus = resolveComplianceStatus(
    complianceForm ? { state: complianceForm.state, dueAt: complianceForm.dueAt } : null
  );

  // Dashboard scope dropdown (task 3) — only meaningful for someone who can
  // ever see more than their own activity. FUNDRAISER/VIEWER are already
  // hard-scoped to themselves everywhere via resolveViewScope, so the
  // selector (and its "every active team member" list) is hidden for them
  // rather than shown-but-inert.
  const canUseScopeSelector = hasPermission(auth, "canViewAllTransactions") || hasPermission(auth, "canViewAsUser");
  let scopeSelector: React.ReactNode = null;
  if (canUseScopeSelector) {
    const [viewScope, teamMembers] = await Promise.all([
      resolveViewScope(auth),
      hasPermission(auth, "canViewAsUser")
        ? prisma.user.findMany({
            where: { churchId: auth.churchId, disabledAt: null, role: { in: ["owner", "admin", "fundraiser", "viewer", "church_admin"] }, id: { not: auth.userId } },
            select: { id: true, email: true },
            orderBy: { email: "asc" },
          })
        : Promise.resolve([]),
    ]);
    let currentScopeLabel = "Entire Organization";
    const effective = viewScope.effective;
    if (effective.kind === "currentUser") currentScopeLabel = "My Activity";
    else if (effective.kind === "user") {
      const target = teamMembers.find((m) => m.id === effective.userId);
      currentScopeLabel = target?.email || "Team Member";
    }
    scopeSelector = (
      <ViewScopeSelector members={teamMembers} currentScopeLabel={currentScopeLabel} isViewingAsOther={viewScope.isViewingAsOther} />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <ComplianceBanner status={complianceStatus} />
      <div className="flex-grow flex">
        <Sidebar role={auth.role ?? undefined} />
        <div className="flex-grow flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              {church.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={church.logoUrl}
                  alt={`${church.name} logo`}
                  className="w-9 h-9 rounded-lg object-contain"
                />
              )}
              <div>
                <h1 className="text-lg font-bold text-slate-900">{church.name}</h1>
                <p className="text-[11px] text-slate-400">Powered by WGC Payments</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {scopeSelector}
              <span className="text-sm text-slate-600 hidden md:inline">{auth.email}</span>
              <LogoutButton />
            </div>
          </div>
          <main className="flex-grow px-6 md:px-10 py-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
