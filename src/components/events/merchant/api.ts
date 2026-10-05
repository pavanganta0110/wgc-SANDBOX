/** Reads the error message out of either error shape the merchant APIs return ({error: "msg"} or {error: {message}}). */
export async function readApiError(res: Response, fallback = "Something went wrong. Please try again."): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.error?.message === "string") return data.error.message;
  } catch {
    // fall through
  }
  return fallback;
}

export const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const labelClass = "block text-xs font-semibold text-slate-600 mb-1";
export const primaryButton = "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60";
export const secondaryButton = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
