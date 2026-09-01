import Link from "next/link";
import MerchandiseProductsList from "@/components/merchant/MerchandiseProductsList";

export default function MerchandiseProductsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Merchandise Products</h2>
          <p className="text-sm text-slate-500">Products synced from Printful. Enable and price them, then select which giving pages show them.</p>
        </div>
        <Link href="/merchant/settings/integrations/printful" className="text-sm text-blue-600 hover:underline">
          Printful Connection
        </Link>
      </div>
      <MerchandiseProductsList />
    </div>
  );
}
