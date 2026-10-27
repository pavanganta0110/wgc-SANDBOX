import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { matchesCampaignExportFilter, parseCampaignExportFilter } from "@/lib/giving-campaigns-export";

type Recipient = {
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  sendStatus: string;
  sentAt: Date | null;
  clickedAt: Date | null;
  paidAt: Date | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : "");

/** Downloads a campaign's recipient list — only the group chosen via ?filter=. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!getDonorPermissions(auth.rawRole).canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await prisma.givingCampaign.findFirst({ where: { id, churchId: auth.churchId }, select: { id: true, name: true, channel: true } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const filter = parseCampaignExportFilter(new URL(req.url).searchParams.get("filter"));
  const all = await prisma.givingCampaignRecipient.findMany({
    where: { campaignId: campaign.id, churchId: auth.churchId },
    orderBy: { createdAt: "asc" },
    select: { recipientName: true, recipientEmail: true, recipientPhone: true, sendStatus: true, sentAt: true, clickedAt: true, paidAt: true },
  });
  const rows: Recipient[] = all.filter((r) => matchesCampaignExportFilter(r, filter));

  const columns: CsvColumn<Recipient>[] = [
    { header: "Donor Name", value: (r) => r.recipientName || "" },
    campaign.channel === "TEXT"
      ? { header: "Phone", value: (r) => r.recipientPhone || "" }
      : { header: "Email", value: (r) => r.recipientEmail || "" },
    { header: "Send Status", value: (r) => r.sendStatus },
    { header: "Sent (UTC)", value: (r) => iso(r.sentAt) },
    { header: "Clicked (UTC)", value: (r) => iso(r.clickedAt) },
    { header: "Paid (UTC)", value: (r) => iso(r.paidAt) },
  ];

  const slug = campaign.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "campaign";
  return csvResponse(buildCsvExport(rows, columns), `${slug}-${filter}.csv`);
}
