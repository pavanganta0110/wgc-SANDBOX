"use client";

import { useEffect, useRef, useState } from "react";

interface ClientHit {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  clientType: string;
}

export default function ClientPicker({
  onSelect,
  selected,
}: {
  onSelect: (client: ClientHit) => void;
  selected: ClientHit | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/merchant/clients?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setResults(json.clients || []);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
        <div>
          <div className="text-sm font-semibold text-slate-900">{selected.displayName}</div>
          {selected.email && <div className="text-xs text-slate-500">{selected.email}</div>}
        </div>
        <button type="button" onClick={() => onSelect({ id: "", displayName: "", email: null, phone: null, organizationName: null, clientType: "INDIVIDUAL" })} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
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
        onFocus={() => setOpen(true)}
        placeholder="Search clients by name, email, or organization…"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-slate-100 shadow-lg max-h-64 overflow-y-auto">
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => {
                onSelect(client);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              <div className="font-medium text-slate-900">{client.displayName}</div>
              {client.email && <div className="text-xs text-slate-500">{client.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
