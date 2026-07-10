"use client";

import { useEffect, useState } from "react";
import { Link2, Copy, ExternalLink, X } from "lucide-react";
import toast from "react-hot-toast";

interface GivingPageSummary {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
}

export default function CreateGivingPageLinkDialog({ onClose }: { onClose: () => void }) {
  const [pages, setPages] = useState<GivingPageSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/giving-pages")
      .then((r) => r.json())
      .then((data) => {
        setPages(data.pages ?? []);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load giving pages");
        setLoading(false);
      });
  }, []);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copyLink = (slug: string) => {
    const url = `${appUrl}/give/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Giving Page Links</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading giving pages…</p>
          ) : pages.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-500 mb-2">No giving pages yet.</p>
              <a
                href="/merchant/giving-page"
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                Create your first giving page
              </a>
            </div>
          ) : (
            pages.map((page) => {
              const url = `${appUrl}/give/${page.slug}`;
              return (
                <div
                  key={page.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{page.name}</p>
                      {page.isDefault && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 shrink-0">
                          Default
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          page.enabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {page.enabled ? "Live" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{url}</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    <button
                      onClick={() => copyLink(page.slug)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                    <a
                      href={`/give/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
          <a
            href="/merchant/giving-page"
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Manage giving pages
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
