import { aplosAuthenticatedGet } from "./resourceClient";
import { DEFAULT_PAGE_SIZE, MAX_PAGES, hasNextPage, parseNextPageNum } from "./pagination";
import { isAplosFund, type AplosFund } from "./types";

/**
 * GET /funds — confirmed exactly from help.aplos.com "API Calls: Funds".
 * Read-only (POST/PUT/DELETE confirmed to return 405 "not available").
 *
 * Display/context only in this integration: a WGC Fund maps to an Aplos
 * Purpose (AplosPurposeMapping.aplosPurposeId), never directly to an Aplos
 * Fund — each Purpose already carries its own linked Fund
 * (purpose.fund.{id,name}, confirmed from the Purposes docs). This
 * endpoint exists so the merchant-facing UI can show which Fund a given
 * Purpose rolls up to, not as a separate mapping target.
 */
export async function listFunds(accessToken: string, aplosAccountId: string): Promise<AplosFund[]> {
  const results: AplosFund[] = [];
  let pageNum = 1;

  for (let page = 0; page < MAX_PAGES; page++) {
    const envelope = await aplosAuthenticatedGet<{ funds: unknown[] }>("/funds", accessToken, aplosAccountId, {
      page_size: String(DEFAULT_PAGE_SIZE),
      page_num: String(pageNum),
    });

    const raw = envelope.data?.funds ?? [];
    for (const item of raw) {
      if (isAplosFund(item)) results.push(item);
    }

    if (!hasNextPage(envelope.links)) break;
    const nextPage = parseNextPageNum(envelope.links!.next!);
    if (!nextPage || nextPage <= pageNum) break;
    pageNum = nextPage;
  }

  return results;
}
