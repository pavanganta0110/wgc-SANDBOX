import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MerchandiseOrderDetail from "@/components/merchant/MerchandiseOrderDetail";

export default async function MerchandiseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <Link href="/merchant/merchandise/orders" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Orders
      </Link>
      <MerchandiseOrderDetail orderId={id} />
    </div>
  );
}
