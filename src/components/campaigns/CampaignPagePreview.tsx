"use client";

import OrganizationLogo from "@/components/merchant/OrganizationLogo";
import ProgressBar from "@/components/campaigns/ProgressBar";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";

/**
 * Live, in-context preview of the public campaign page (src/app/c/[slug]/page.tsx)
 * for the campaign builder — mirrors GivingLinkPreviewPanel's approach for
 * Giving Links: render the real visual structure from the form's current,
 * unsaved values, not a saved DB row. No teams/fundraisers/recent-gifts
 * sections here since none can exist yet for a campaign that isn't created.
 */
export default function CampaignPagePreview({
  churchName,
  churchLogoUrl,
  name,
  description,
  imageUrl,
  goalAmountCents,
  endDate,
}: {
  churchName: string;
  churchLogoUrl?: string | null;
  name: string;
  description?: string;
  imageUrl?: string | null;
  goalAmountCents: number | null;
  endDate?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
      <div className="py-10 px-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={name || "Campaign image"} className="w-full h-48 object-cover" />
            )}
            <div className="p-8">
            <OrganizationLogo logoUrl={churchLogoUrl ?? null} churchName={churchName} mode={imageUrl ? "embed" : "main"} />
            <h1 className="text-2xl font-bold text-center text-slate-900 mb-1">{name || "Your Campaign Name"}</h1>
            <p className="text-sm text-center text-slate-500 mb-6">{churchName}</p>
            {description && <p className="text-sm text-center text-slate-600 mb-6">{description}</p>}

            <ProgressBar raisedCents={0} goalAmountCents={goalAmountCents} donorCount={0} />

            {endDate && (
              <p className="text-xs text-slate-400 text-center mt-3">Ends {formatCalendarDateUTC(`${endDate}T00:00:00Z`)}</p>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <span className="w-full text-center bg-wgc-gold-500 text-wgc-navy-950 font-bold py-3 rounded-xl cursor-default select-none">
                Give Now
              </span>
              <span className="w-full text-center text-sm font-semibold text-slate-400 cursor-default select-none">
                View Live Donation Wall &rarr;
              </span>
            </div>
            </div>
          </div>

          <div className="text-center mt-6">
            <span className="text-xs text-slate-400">Powered by WGC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
