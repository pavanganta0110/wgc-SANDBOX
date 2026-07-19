import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import GivingLinksTabs from "@/components/merchant/GivingLinksTabs";
import GivingLinksTable from "@/components/merchant/GivingLinksTable";
import DonationAttemptsTable from "@/components/merchant/DonationAttemptsTable";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildGivingLinkScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export default async function GivingLinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const churchId = auth.churchId;
  const sp = await searchParams;
  const tab = sp.tab === "attempts" ? "attempts" : "links";

  // Team-access: FUNDRAISER/VIEWER are always forced to their own scope by
  // buildGivingLinkScope regardless of the ?owner= param — the "All Links /
  // My Links / Team Member" filter below is only meaningful for OWNER/ADMIN.
  const viewScope = await resolveViewScope(auth);
  const baseScope = buildGivingLinkScope(auth, viewScope);
  const canFilterByOwner = auth.role === "owner" || auth.role === "admin";
  const ownerFilterOptions = canFilterByOwner
    ? await prisma.user.findMany({
        where: { churchId, role: { in: ["owner", "admin", "fundraiser", "viewer", "church_admin"] } },
        select: { id: true, email: true, disabledAt: true },
        orderBy: { email: "asc" },
      })
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Giving Links</h2>
        <Link
          href="/merchant/giving-links/create"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Giving Link
        </Link>
      </div>

      <GivingLinksTabs active={tab} />

      {tab === "links" ? (
        <GivingLinksTable
          churchId={churchId}
          baseScope={baseScope}
          searchParams={sp}
          canFilterByOwner={canFilterByOwner}
          ownerFilterOptions={ownerFilterOptions}
          currentUserId={auth.userId}
        />
      ) : (
        <DonationAttemptsTable churchId={churchId} searchParams={sp} />
      )}
    </div>
  );
}
