import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import GivingLinkBuilderForm from "@/components/merchant/GivingLinkBuilderForm";

export default async function CreateGivingLinkPage() {
  const session = await getSession();
  const [church, pricing] = await Promise.all([
    prisma.church.findUnique({ where: { id: session!.churchId! }, select: { name: true } }),
    prisma.churchPricing.findUnique({ where: { churchId: session!.churchId! } }),
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
        pricing={{
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        }}
      />
    </div>
  );
}
