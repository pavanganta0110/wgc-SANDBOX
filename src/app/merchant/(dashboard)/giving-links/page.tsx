import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import GivingLinksTabs from "@/components/merchant/GivingLinksTabs";
import GivingLinksTable from "@/components/merchant/GivingLinksTable";
import DonationAttemptsTable from "@/components/merchant/DonationAttemptsTable";

export default async function GivingLinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const sp = await searchParams;
  const tab = sp.tab === "attempts" ? "attempts" : "links";

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
        <GivingLinksTable churchId={churchId} searchParams={sp} />
      ) : (
        <DonationAttemptsTable churchId={churchId} searchParams={sp} />
      )}
    </div>
  );
}
