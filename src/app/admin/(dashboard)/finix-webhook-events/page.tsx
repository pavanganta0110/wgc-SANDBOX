import FinixWebhookEventsClient from "@/components/admin/FinixWebhookEventsClient";

export default async function FinixWebhookEventsPage({ searchParams }: { searchParams: Promise<{ merchantId?: string }> }) {
  const { merchantId } = await searchParams;
  return <FinixWebhookEventsClient initialMerchantId={merchantId ?? ""} />;
}
