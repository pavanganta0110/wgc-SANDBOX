/** Small fetch helper shared by the Planning Center panels. */

export const PCO_API = "/api/merchant/settings/integrations/planning-center";

export class PcoApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function pcoFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PCO_API}${path}`, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  let body: { error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new PcoApiError(body?.error || "Something went wrong. Please try again.", res.status);
  return body as T;
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const buttonSecondary =
  "px-3.5 py-2 rounded-lg font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-xs flex items-center gap-1.5 whitespace-nowrap";
export const buttonPrimary =
  "px-3.5 py-2 rounded-lg font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs flex items-center gap-1.5 whitespace-nowrap";
export const buttonDanger =
  "px-3.5 py-2 rounded-lg font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-xs flex items-center gap-1.5 whitespace-nowrap";
