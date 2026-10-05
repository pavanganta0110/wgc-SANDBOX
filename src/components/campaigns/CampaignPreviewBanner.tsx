import Link from "next/link";

/** Shown only to the owning church's own logged-in staff, viewing a campaign/team/fundraiser page before it's published — never seen by a real public visitor (see loadPublicCampaignData.ts's isPreview). */
export default function CampaignPreviewBanner({ campaignId, message }: { campaignId: string; message: string }) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4">
      <strong>Preview only.</strong> {message} Only your team can see this page.{" "}
      <Link href={`/merchant/campaigns/${campaignId}`} className="underline font-semibold">
        Go to campaign settings
      </Link>
    </div>
  );
}
