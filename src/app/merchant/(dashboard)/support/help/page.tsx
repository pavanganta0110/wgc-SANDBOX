import Link from "next/link";
import { getArticlesByCategory } from "@/lib/support/helpArticles";

export default function HelpCenterPage() {
  const grouped = getArticlesByCategory();

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900">Help Center</h2>
      {Object.entries(grouped).map(([category, articles]) =>
        articles.length === 0 ? null : (
          <div key={category} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">{category}</h3>
            <div className="space-y-1">
              {articles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/merchant/support/help/${article.slug}`}
                  className="block px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700 font-medium"
                >
                  {article.title}
                </Link>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
