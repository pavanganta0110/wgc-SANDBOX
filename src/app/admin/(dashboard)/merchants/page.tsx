"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Search, 
  Filter, 
  X,
  CalendarRange,
  ChevronLeft, 
  ChevronRight, 
  MoreHorizontal, 
  Store, 
  RefreshCw,
  AlertCircle,
  ExternalLink
} from "lucide-react";

interface MerchantData {
  id: string;
  name: string;
  status: string;
  onboardingStatus: string;
  merchantActivationStatus: string | null;
  primaryOwner: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  counts: {
    users: number;
    locations?: number;
    transactions: number;
    activeRecurring?: number;
  };
  lastActivity: string;
  createdAt: string;
}

const ONBOARDING_OPTIONS = [
  { value: "ALL", label: "All onboarding" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "MORE_INFORMATION_REQUIRED", label: "More information required" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

// Local-date YYYY-MM-DD (what <input type="date"> uses), not UTC, so "today" matches the admin's calendar.
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
};

const DATE_PRESETS: { key: string; label: string; range: () => { from: string; to: string } }[] = [
  { key: "today", label: "Today", range: () => ({ from: toDateInput(new Date()), to: toDateInput(new Date()) }) },
  { key: "7d", label: "Last 7 days", range: () => ({ from: daysAgo(6), to: toDateInput(new Date()) }) },
  { key: "30d", label: "Last 30 days", range: () => ({ from: daysAgo(29), to: toDateInput(new Date()) }) },
  { key: "90d", label: "Last 90 days", range: () => ({ from: daysAgo(89), to: toDateInput(new Date()) }) },
  { key: "mtd", label: "This month", range: () => { const n = new Date(); return { from: toDateInput(new Date(n.getFullYear(), n.getMonth(), 1)), to: toDateInput(n) }; } },
  { key: "ytd", label: "This year", range: () => { const n = new Date(); return { from: toDateInput(new Date(n.getFullYear(), 0, 1)), to: toDateInput(n) }; } },
];

export default function MerchantsDirectoryPage() {
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState<"name" | "any">("name");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [onboardingFilter, setOnboardingFilter] = useState("ALL");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const fetchMerchants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        search: searchQuery,
      });
      if (statusFilter !== "ALL") {
        query.append("status", statusFilter);
      }
      if (onboardingFilter !== "ALL") {
        query.append("onboardingStatus", onboardingFilter);
      }
      if (createdFrom) query.append("createdDateStart", createdFrom);
      if (createdTo) query.append("createdDateEnd", createdTo);
      if (searchQuery) query.append("searchField", searchField);
      const res = await fetch(`/api/admin/merchants?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to load merchants");
      }
      const json = await res.json();
      setMerchants(json.data || []);
      setTotalPages(json.pagination?.totalPages || 1);
      // The API returns totalCount (the page used to read `total`, so the footer always said "of 0").
      setTotal(json.pagination?.totalCount ?? json.pagination?.total ?? 0);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, searchField, statusFilter, onboardingFilter, createdFrom, createdTo]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  // Search as you type (debounced) so a name filter doesn't need Enter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery((prev) => {
        const next = searchInput.trim();
        if (prev !== next) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activePreset = DATE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === createdFrom && r.to === createdTo;
  })?.key;

  const activeFilterCount =
    (searchQuery ? 1 : 0) + (statusFilter !== "ALL" ? 1 : 0) + (onboardingFilter !== "ALL" ? 1 : 0) + (createdFrom || createdTo ? 1 : 0);

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setStatusFilter("ALL");
    setOnboardingFilter("ALL");
    setCreatedFrom("");
    setCreatedTo("");
    setPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadgeClass = (status: string | null) => {
    if (!status) return "bg-slate-100 text-slate-700 border-slate-200";
    switch (status.toUpperCase()) {
      case "ACTIVE":
      case "COMPLETED":
      case "APPROVED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "PENDING":
      case "IN_PROGRESS":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "DISABLED":
      case "REJECTED":
      case "FAILED":
      case "TERMINATED":
        return "bg-rose-100 text-rose-800 border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Store className="h-6 w-6 text-indigo-600" />
            Merchants Directory
          </h1>
          <p className="text-slate-500 mt-1">Manage and view all merchants across the platform.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fetchMerchants()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <form onSubmit={handleSearchSubmit} className="flex w-full lg:max-w-xl gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search merchants"
                  placeholder={searchField === "name" ? "Search by merchant name..." : "Search by name, ID, owner or email..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-sm transition-shadow"
                />
              </div>
              <select
                aria-label="Search in"
                value={searchField}
                onChange={(e) => {
                  setSearchField(e.target.value as "name" | "any");
                  setPage(1);
                }}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-8 shadow-sm cursor-pointer"
              >
                <option value="name">Name only</option>
                <option value="any">Name, ID, owner, email</option>
              </select>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" aria-hidden />
              <select
                aria-label="Platform status"
                value={statusFilter}
                onChange={handleStatusChange}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-8 shadow-sm cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="DISABLED">Disabled</option>
                <option value="TERMINATED">Terminated</option>
              </select>
              <select
                aria-label="Onboarding status"
                value={onboardingFilter}
                onChange={(e) => {
                  setOnboardingFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 pl-3 pr-8 shadow-sm cursor-pointer"
              >
                {ONBOARDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Created date: quick ranges + custom from/to */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 mr-1">
              <CalendarRange className="h-4 w-4" aria-hidden />
              Created
            </span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={activePreset === p.key}
                onClick={() => {
                  const r = p.range();
                  setCreatedFrom(r.from);
                  setCreatedTo(r.to);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                  activePreset === p.key
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="date"
                aria-label="Created from"
                value={createdFrom}
                max={createdTo || undefined}
                onChange={(e) => {
                  setCreatedFrom(e.target.value);
                  setPage(1);
                }}
                className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg py-1.5 px-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                aria-label="Created to"
                value={createdTo}
                min={createdFrom || undefined}
                onChange={(e) => {
                  setCreatedTo(e.target.value);
                  setPage(1);
                }}
                className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg py-1.5 px-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear all filters ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4">Name</th>
                <th scope="col" className="px-6 py-4">Statuses</th>
                <th scope="col" className="px-6 py-4">Primary Owner</th>
                <th scope="col" className="px-6 py-4">Counts</th>
                <th scope="col" className="px-6 py-4">Last Activity</th>
                <th scope="col" className="px-6 py-4">Created Date</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
                      <p>Loading merchants data...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-rose-600">
                      <AlertCircle className="h-8 w-8" />
                      <p>{error}</p>
                      <button 
                        onClick={() => fetchMerchants()}
                        className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </div>
                  </td>
                </tr>
              ) : merchants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Store className="h-12 w-12 mb-3 text-slate-300" />
                      <p className="text-base text-slate-600 font-medium">No merchants found</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                merchants.map((merchant) => (
                  <tr key={merchant.id || Math.random().toString()} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link 
                        href={`/admin/merchants/${merchant.id}`}
                        className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline transition-colors block"
                      >
                        {merchant.name || "Unknown Merchant"}
                      </Link>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {merchant.id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs w-full max-w-[140px]">
                          <span className="text-slate-500">Platform:</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${getStatusBadgeClass(merchant.status)}`}>
                            {merchant.status || "UNKNOWN"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs w-full max-w-[140px]">
                          <span className="text-slate-500">Onboarding:</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${getStatusBadgeClass(merchant.onboardingStatus)}`}>
                            {merchant.onboardingStatus || "UNKNOWN"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs w-full max-w-[140px]">
                          <span className="text-slate-500">Activation:</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${getStatusBadgeClass(merchant.merchantActivationStatus)}`}>
                            {merchant.merchantActivationStatus || "UNKNOWN"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {merchant.primaryOwner ? (
                        <div>
                          <div className="text-slate-900 font-medium">{merchant.primaryOwner.name || "Unnamed owner"}</div>
                          <div className="text-xs text-slate-500">{merchant.primaryOwner.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">No owner assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between max-w-[100px]"><span className="text-slate-400">Users:</span> <span className="font-medium text-slate-700">{merchant.counts?.users ?? 0}</span></div>
                        <div className="flex justify-between max-w-[100px]"><span className="text-slate-400">Locs:</span> <span className="font-medium text-slate-700">{merchant.counts?.locations ?? 0}</span></div>
                        <div className="flex justify-between max-w-[100px]"><span className="text-slate-400">Txns:</span> <span className="font-medium text-slate-700">{merchant.counts?.transactions ?? 0}</span></div>
                        <div className="flex justify-between max-w-[100px]"><span className="text-slate-400">Subs:</span> <span className="font-medium text-slate-700">{merchant.counts?.activeRecurring ?? 0}</span></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                      {formatDate(merchant.lastActivity)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                      {formatDate(merchant.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        href={`/admin/merchants/${merchant.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Profile
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && merchants.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">{(page - 1) * pageSize + 1}</span> to <span className="font-medium text-slate-900">{Math.min(page * pageSize, total)}</span> of <span className="font-medium text-slate-900">{total}</span> results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-medium text-slate-700 px-2">
                Page {page} of {totalPages}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
