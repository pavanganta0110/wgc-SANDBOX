import MerchandiseOrdersList from "@/components/merchant/MerchandiseOrdersList";
import { getPaymentWording } from "@/lib/settings/paymentWording";

export default async function MerchandiseOrdersPage() {
  const { pw } = await getPaymentWording();
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Merchandise Orders</h2>
      <p className="text-sm text-slate-500 mb-6">{pw("Orders placed through your giving pages, fulfilled by Printful.")}</p>
      <MerchandiseOrdersList />
    </div>
  );
}
