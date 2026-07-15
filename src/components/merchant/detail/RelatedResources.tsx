import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type RelatedResource = {
  type: string;
  label: string;
  href: string;
};

export function RelatedResources({ resources }: { resources: RelatedResource[] }) {
  if (resources.length === 0) {
    return <p className="text-sm text-slate-400">No related resources</p>;
  }
  return (
    <div className="space-y-1">
      {resources.map((resource, i) => (
        <Link
          key={i}
          href={resource.href}
          className="flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-slate-50 group"
        >
          <span>
            <span className="text-slate-400 mr-1.5">{resource.type}</span>
            <span className="font-semibold text-slate-700">{resource.label}</span>
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600" />
        </Link>
      ))}
    </div>
  );
}
