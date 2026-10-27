export const CAMPAIGN_EXPORT_FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "paid", label: "Paid" },
  { key: "clicked", label: "Clicked" },
  { key: "clicked-not-paid", label: "Clicked, not paid" },
  { key: "not-paid", label: "Not paid" },
  { key: "failed", label: "Failed" },
  { key: "unsubscribed", label: "Unsubscribed (not sent)" },
] as const;

export type CampaignExportFilter = (typeof CAMPAIGN_EXPORT_FILTERS)[number]["key"];

export function parseCampaignExportFilter(raw: string | null): CampaignExportFilter {
  return CAMPAIGN_EXPORT_FILTERS.find((f) => f.key === raw)?.key ?? "all";
}

type RecipientFlags = { sendStatus: string; clickedAt: Date | null; paidAt: Date | null };

export function matchesCampaignExportFilter(r: RecipientFlags, filter: CampaignExportFilter): boolean {
  switch (filter) {
    case "paid":
      return Boolean(r.paidAt);
    case "clicked":
      return Boolean(r.clickedAt);
    case "clicked-not-paid":
      return Boolean(r.clickedAt) && !r.paidAt;
    case "not-paid":
      return r.sendStatus === "SENT" && !r.paidAt;
    case "failed":
      return r.sendStatus === "FAILED";
    case "unsubscribed":
      return r.sendStatus === "SKIPPED";
    default:
      return true;
  }
}
