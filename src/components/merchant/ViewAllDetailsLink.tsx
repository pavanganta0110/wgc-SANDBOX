import Link from "next/link";

export default function ViewAllDetailsLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      View All Details
    </Link>
  );
}
