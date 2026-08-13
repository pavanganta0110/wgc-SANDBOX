import MerchandiseOrdersList from "@/components/merchant/MerchandiseOrdersList";

export default function MerchandiseOrdersPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Merchandise Orders</h2>
      <p className="text-sm text-slate-500 mb-6">Orders placed through your giving pages, fulfilled by Printful.</p>
      <MerchandiseOrdersList />
    </div>
  );
}
