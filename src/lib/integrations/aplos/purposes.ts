import { aplosAuthenticatedGet } from "./resourceClient";
import { DEFAULT_PAGE_SIZE, MAX_PAGES, hasNextPage, parseNextPageNum } from "./pagination";
import { isAplosPurpose, type AplosPurpose } from "./types";

/**
 * GET /purposes — confirmed exactly from help.aplos.com "API Calls:
 * Purposes". Read-only usage only: this integration never POSTs/PUTs/
 * DELETEs a Purpose, even though Aplos's API technically supports it (see
 * docs/integrations/aplos.md "Do not automatically create an Aplos
 * Purpose").
 *
 * Only enabled purposes are fetched by default (f_enabled=y) — a disabled
 * Purpose is not a valid mapping target for a new WGC Fund mapping. Every
 * item is runtime-validated against isAplosPurpose before being trusted.
 */
export async function listPurposes(
  accessToken: string,
  aplosAccountId: string,
  opts: { onlyEnabled?: boolean } = {}
): Promise<AplosPurpose[]> {
  const results: AplosPurpose[] = [];
  let pageNum = 1;

  for (let page = 0; page < MAX_PAGES; page++) {
    const envelope = await aplosAuthenticatedGet<{ purposes: unknown[] }>("/purposes", accessToken, aplosAccountId, {
      page_size: String(DEFAULT_PAGE_SIZE),
      page_num: String(pageNum),
      ...(opts.onlyEnabled === false ? {} : { f_enabled: "y" }),
    });

    const rawPurposes = envelope.data?.purposes ?? [];
    for (const raw of rawPurposes) {
      if (isAplosPurpose(raw)) results.push(raw);
      // Silently skipping a malformed individual item (rather than failing
      // the whole list) is deliberate here — a single unexpected item
      // should not hide every other valid Purpose from the merchant's
      // mapping UI. The item is simply omitted, never fabricated.
    }

    if (!hasNextPage(envelope.links)) break;
    const nextPage = parseNextPageNum(envelope.links!.next!);
    if (!nextPage || nextPage <= pageNum) break; // guards against a malformed/non-advancing next link
    pageNum = nextPage;
  }

  return results;
}
