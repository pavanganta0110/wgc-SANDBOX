"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, X, LifeBuoy } from "lucide-react";

interface HelpResult {
  slug: string;
  title: string;
  category: string;
  question: string;
  answer: string;
  truncated: boolean;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; asked: string; results: HelpResult[] }
  | { status: "error"; message: string };

function ticketHref(asked: string) {
  const params = new URLSearchParams({ subject: asked.slice(0, 100), description: asked });
  return `/merchant/support/tickets/new?${params.toString()}`;
}

/** Help Center "Ask a question": the best matching answers from our own articles (no AI), with Support as the fallback. */
export default function HelpSearchBox() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const asked = query.trim();
    if (asked.length < 2) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/merchant/support/help-search?q=${encodeURIComponent(asked)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Search failed. Please try again.");
      setState({ status: "done", asked, results: json.results ?? [] });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Search failed. Please try again." });
    }
  }

  function clear() {
    setQuery("");
    setState({ status: "idle" });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Ask a question</h3>
      <p className="text-xs text-slate-500 mb-3">
        Type your question and we&apos;ll show the best answers from the Help Center. Please don&apos;t type card numbers or passwords.
      </p>
      <form role="search" onSubmit={ask} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={query}
          maxLength={300}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="For example: How do I print a receipt?"
          aria-label="Ask a question"
          className="w-full pl-9 pr-24 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-900"
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Clear" className="absolute right-20 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={state.status === "loading" || query.trim().length < 2}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
        >
          {state.status === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

        {state.status === "done" && state.results.length > 0 && (
          <div className="space-y-3">
            {state.results.map((r) => (
              <div key={r.slug} className="rounded-xl border border-slate-100 p-4">
                <p className="text-[11px] font-semibold text-blue-600 mb-0.5">{r.category}</p>
                <p className="text-sm font-bold text-slate-900">{r.question}</p>
                <p className="text-sm text-slate-700 mt-1">{r.answer}</p>
                <Link href={`/merchant/support/help/${r.slug}`} className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:underline">
                  {r.truncated ? "Read the full article" : "Open the article"}: {r.title}
                </Link>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Not what you needed?{" "}
              <Link href={ticketHref(state.asked)} className="font-semibold text-blue-600 hover:underline">
                Contact Support
              </Link>
            </p>
          </div>
        )}

        {state.status === "done" && state.results.length === 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-slate-900">We couldn&apos;t find an answer in the Help Center.</p>
            <p className="text-sm text-slate-600 mt-1">Try different words, or send your question to our team and we&apos;ll help.</p>
            <Link
              href={ticketHref(state.asked)}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
            >
              <LifeBuoy className="w-3.5 h-3.5" /> Contact Support
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
