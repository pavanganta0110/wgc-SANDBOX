import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import AuctionManager from "./AuctionManager";

export default async function AuctionDetailPage({ params }: { params: Promise<{ auctionId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");
  const { auctionId } = await params;
  return <AuctionManager auctionId={auctionId} canManage={hasPermission(auth, "canManageEvents")} />;
}
