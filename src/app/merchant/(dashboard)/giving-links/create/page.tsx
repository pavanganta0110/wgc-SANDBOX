import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import GivingLinkBuilderForm from "@/components/merchant/GivingLinkBuilderForm";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export default async function CreateGivingLinkPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const canAssignOwner = auth.role === "owner" || auth.role === "admin";

  const [church, pricing, teamMembers] = await Promise.all([
    prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true, logoUrl: true } }),
    prisma.churchPricing.findUnique({ where: { churchId: auth.churchId } }),
    canAssignOwner
      ? prisma.user.findMany({
          where: { churchId: auth.churchId, disabledAt: null, role: { in: ["owner", "admin", "fundraiser", "viewer", "church_admin"] } },
          select: { id: true, email: true, role: true },
          orderBy: { email: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <Link href="/merchant/giving-links" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Giving Links
      </Link>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Create Giving Link</h2>
      <GivingLinkBuilderForm
        mode="create"
        churchName={church?.name || "Your Organization"}
        churchLogoUrl={church?.logoUrl}
        pricing={{
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        }}
        ownerOptions={canAssignOwner ? teamMembers : undefined}
        initialOwnerUserId={auth.userId}
        canAssignOwner={canAssignOwner}
      />
    </div>
  );
}
