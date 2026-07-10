import Link from "next/link";
import { HeartHandshake } from "lucide-react";

export default function QuickLinksPanel() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Quick Links</h3>
      </div>
      <div className="p-5">
        <Link
          href="/merchant/giving-links"
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
        >
          <HeartHandshake className="w-4 h-4" />
          Manage Giving Links
        </Link>
      </div>
    </div>
  );
}
