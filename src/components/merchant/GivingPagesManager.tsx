"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Share2, Plus, ChevronDown } from "lucide-react";

interface GivingPage {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  logoUrl: string | null;
  headline: string | null;
  description: string | null;
  primaryColorHex: string;
  suggestedAmountsJson: unknown;
  allowRecurring: boolean;
  allowFeeCoverage: boolean;
  givingPageType: string;
  givingPagePersons?: { person: { id: string; displayName: string } }[];
}

interface Person {
  id: string;
  displayName: string;
  isActive: boolean;
}

const DEFAULT_AMOUNTS = "25, 50, 100, 250, 500, 1000";

function amountsToCents(input: string): number[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Math.round(parseFloat(s) * 100))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function centsToAmountsInput(json: unknown): string {
  if (Array.isArray(json)) {
    return (json as number[]).map((c) => (c / 100).toString()).join(", ");
  }
  return DEFAULT_AMOUNTS;
}

export default function GivingPagesManager({
  initialPages,
  appUrl,
}: {
  initialPages: GivingPage[];
  appUrl: string;
}) {
  const [pages, setPages] = useState(initialPages);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleShare = (slug: string) => {
    const url = `${appUrl}/give/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Giving page link copied to clipboard");
  };

  const handleToggleEnabled = async (page: GivingPage) => {
    const res = await fetch(`/api/merchant/giving-pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !page.enabled }),
    });
    if (!res.ok) {
      toast.error("Failed to update giving page");
      return;
    }
    const { page: updated } = await res.json();
    setPages((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
    toast.success(updated.enabled ? "Giving page enabled" : "Giving page disabled");
  };

  const handleDelete = async (page: GivingPage) => {
    if (!confirm(`Delete "${page.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/merchant/giving-pages/${page.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data?.error || "Failed to delete giving page");
      return;
    }
    setPages((prev) => prev.filter((p) => p.id !== page.id));
    toast.success("Giving page deleted");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Your Giving Pages</h3>
        <button
          onClick={() => setCreating((c) => !c)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#eab308] text-sm font-bold text-slate-900"
        >
          <Plus className="w-4 h-4" />
          Create Giving Page
        </button>
      </div>

      {creating && (
        <GivingPageForm
          onCancel={() => setCreating(false)}
          onSaved={(page) => {
            setPages((prev) => [...prev, page]);
            setCreating(false);
          }}
        />
      )}

      <div className="space-y-3">
        {pages.map((page) => (
          <div key={page.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{page.name}</p>
                  {page.isDefault && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                      Default
                    </span>
                  )}
                  {page.givingPageType === "PERSON" && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-600">
                      Person Page
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      page.enabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {page.enabled ? "Live" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {appUrl}/give/{page.slug}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleShare(page.slug)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <button
                  onClick={() => setEditingId(editingId === page.id ? null : page.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${editingId === page.id ? "rotate-180" : ""}`} />
                </button>
                <button
                  onClick={() => handleToggleEnabled(page)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    page.enabled ? "border border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-slate-900 text-white"
                  }`}
                >
                  {page.enabled ? "Disable" : "Enable"}
                </button>
                {!page.isDefault && (
                  <button
                    onClick={() => handleDelete(page)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {editingId === page.id && (
              <div className="border-t border-slate-100 px-5 py-4">
                <GivingPageForm
                  page={page}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    setEditingId(null);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GivingPageForm({
  page,
  onCancel,
  onSaved,
}: {
  page?: GivingPage;
  onCancel: () => void;
  onSaved: (page: GivingPage) => void;
}) {
  const [name, setName] = useState(page?.name || "");
  const [logoUrl, setLogoUrl] = useState(page?.logoUrl || "");
  const [headline, setHeadline] = useState(page?.headline || "");
  const [description, setDescription] = useState(page?.description || "");
  const [primaryColorHex, setPrimaryColorHex] = useState(page?.primaryColorHex || "#eab308");
  const [amounts, setAmounts] = useState(centsToAmountsInput(page?.suggestedAmountsJson));
  const [allowRecurring, setAllowRecurring] = useState(page?.allowRecurring ?? true);
  const [allowFeeCoverage, setAllowFeeCoverage] = useState(page?.allowFeeCoverage ?? true);
  const [givingPageType, setGivingPageType] = useState(page?.givingPageType || "ORGANIZATION");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(
    page?.givingPagePersons?.map((gp) => gp.person.id) || []
  );
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    fetch("/api/merchant/giving-pages/people")
      .then((r) => r.json())
      .then((data) => {
        if (data.people) setPeople(data.people);
      });
  }, []);

  const togglePerson = (id: string) => {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Give this giving page a name");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      logoUrl,
      headline,
      description,
      primaryColorHex,
      suggestedAmountsCents: amountsToCents(amounts),
      allowRecurring,
      allowFeeCoverage,
      givingPageType,
      personIds: givingPageType === "PERSON" ? selectedPersonIds : [],
    };

    const res = await fetch(page ? `/api/merchant/giving-pages/${page.id}` : "/api/merchant/giving-pages", {
      method: page ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      toast.error(data?.error || "Failed to save giving page");
      return;
    }
    const data = await res.json();
    toast.success("Giving page saved");
    onSaved(data.page);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Page Type</label>
          <select
            value={givingPageType}
            onChange={(e) => setGivingPageType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          >
            <option value="ORGANIZATION">Organization Giving</option>
            <option value="PERSON">Person Giving</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Page Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. General Fund, Building Campaign"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Logo URL</label>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Headline</label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Give to First Baptist Church"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Brand Color</label>
          <input
            type="color"
            value={primaryColorHex}
            onChange={(e) => setPrimaryColorHex(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Suggested Amounts ($, comma-separated)</label>
          <input
            value={amounts}
            onChange={(e) => setAmounts(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allowRecurring} onChange={(e) => setAllowRecurring(e.target.checked)} />
          Allow recurring gifts
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allowFeeCoverage} onChange={(e) => setAllowFeeCoverage(e.target.checked)} />
          Allow donor to cover fees
        </label>
      </div>

      {givingPageType === "PERSON" && (
        <div className="border-t border-slate-100 pt-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Attach People to this Page</label>
          {people.length === 0 ? (
            <p className="text-sm text-slate-500">No active people found. Create people in the People directory first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {people.map((person) => (
                <button
                  key={person.id}
                  onClick={() => togglePerson(person.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    selectedPersonIds.includes(person.id)
                      ? "bg-purple-100 text-purple-700 border-2 border-purple-200"
                      : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {person.displayName}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-2">
            Donors will choose which person they are supporting.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-[#eab308] text-sm font-bold text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
