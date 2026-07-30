"use client";

import { useEffect, useRef, useState } from "react";

interface DonorHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export default function DonorPicker({
  onSelect,
  onClear,
  selected,
}: {
  onSelect: (donor: DonorHit) => void;
  onClear: () => void;
  selected: DonorHit | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DonorHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/merchant/donors/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.donors || []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div>
          <span className="font-semibold text-slate-900">{selected.name || "Unnamed donor"}</span>
          {selected.email && <span className="text-slate-500"> · {selected.email}</span>}
        </div>
        <button type="button" onClick={onClear} className="text-xs font-semibold text-blue-600 hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search existing donors by name, email, or phone"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
          {!loading &&
            results.map((d) => (
              <button
                key={d.id}
                type="button"
                onMouseDown={() => {
                  onSelect(d);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{d.name || "Unnamed donor"}</span>
                {d.email && <span className="text-slate-500"> · {d.email}</span>}
              </button>
            ))}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matching donors — you can still create a new one below.</div>}
        </div>
      )}
    </div>
  );
}
