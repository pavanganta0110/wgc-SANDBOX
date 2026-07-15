import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HELP_ARTICLES } from "@/lib/support/helpArticles";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = HELP_ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/merchant/support/help" className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Help Center
      </Link>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-xs font-semibold text-blue-600 mb-1">{article.category}</p>
        <h2 className="text-lg font-bold text-slate-900 mb-4">{article.title}</h2>
        <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
      </div>
    </div>
  );
}
