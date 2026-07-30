/**
 * Aplos's documented pagination shape (confirmed identically across every
 * List/Search endpoint fetched during this integration's research —
 * Contributions, Purposes, Accounts, Funds):
 *
 *   "meta": { "resource_count": 1, "available_filters": {...} },
 *   "links": { "self": "/api/v1/X?page_size=1&page_num=1",
 *              "next": "/api/v1/X?page_size=1&page_num=2" }
 *
 * `links.next` is only present when another page exists — its absence is
 * the documented end-of-results signal. `page_size`/`page_num` are
 * confirmed present in the example URLs but Aplos's docs never state a
 * default or maximum page_size; MAX_PAGE_SIZE below is this integration's
 * own conservative choice, not an Aplos-documented limit.
 */

export const DEFAULT_PAGE_SIZE = 100;
// Safety bound on total pages fetched in one call — prevents an
// unexpectedly large or looping resource list from making this integration
// fetch indefinitely. This is our own defensive limit; Aplos documents no
// maximum result set size.
export const MAX_PAGES = 20;

export interface AplosPaginationLinks {
  self?: string;
  next?: string;
  prev?: string;
}

export function hasNextPage(links: AplosPaginationLinks | undefined): boolean {
  return !!links?.next;
}

/**
 * Extracts { page_num } from a documented `links.next` relative URL (e.g.
 * "/api/v1/purposes?page_size=100&page_num=2") — used to drive the next
 * request rather than hand-incrementing a counter, so pagination follows
 * exactly what Aplos itself returned rather than an assumption about
 * sequential numbering.
 */
export function parseNextPageNum(nextLink: string): number | null {
  try {
    const url = new URL(nextLink, "https://app.aplos.com");
    const pageNum = url.searchParams.get("page_num");
    return pageNum ? parseInt(pageNum, 10) : null;
  } catch {
    return null;
  }
}
