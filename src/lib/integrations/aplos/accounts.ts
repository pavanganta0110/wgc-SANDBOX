import { aplosAuthenticatedGet } from "./resourceClient";
import { DEFAULT_PAGE_SIZE, MAX_PAGES, hasNextPage, parseNextPageNum } from "./pagination";
import { isAplosAccount, type AplosAccount, type AplosAccountCategory } from "./types";

/**
 * GET /accounts — confirmed exactly from help.aplos.com "API Calls:
 * Accounts". Read-only (POST/PUT/DELETE confirmed to return 405 "not
 * available" in official docs) — WGC never creates or modifies an Aplos
 * account, matching the approved spec's "Do not automatically choose
 * accounting accounts."
 */
export async function listAccounts(
  accessToken: string,
  aplosAccountId: string,
  opts: { onlyEnabled?: boolean; category?: AplosAccountCategory } = {}
): Promise<AplosAccount[]> {
  const results: AplosAccount[] = [];
  let pageNum = 1;

  for (let page = 0; page < MAX_PAGES; page++) {
    const envelope = await aplosAuthenticatedGet<{ accounts: unknown[] }>("/accounts", accessToken, aplosAccountId, {
      page_size: String(DEFAULT_PAGE_SIZE),
      page_num: String(pageNum),
      ...(opts.onlyEnabled === false ? {} : { f_enabled: "y" }),
    });

    const raw = envelope.data?.accounts ?? [];
    for (const item of raw) {
      if (isAplosAccount(item) && (!opts.category || item.category === opts.category)) results.push(item);
    }

    if (!hasNextPage(envelope.links)) break;
    const nextPage = parseNextPageNum(envelope.links!.next!);
    if (!nextPage || nextPage <= pageNum) break;
    pageNum = nextPage;
  }

  return results;
}

/**
 * Account-eligibility rule for the two accounting destinations this
 * integration asks a merchant to configure. This is WGC's own
 * interpretation applied to Aplos's documented `category` field
 * (asset|liability|equity|income|expense, confirmed from official docs) —
 * Aplos's API itself carries no "valid for deposit"/"valid for expense"
 * flag; nothing here claims otherwise. Standard double-entry accounting
 * convention: a bank/deposit destination is an asset account (Aplos's own
 * documented example is account_number 1000, "Cash", category "asset");
 * an expense deduction (the processing-fee line on a Contribution) is
 * booked to an expense account.
 */
export function isDepositAccountEligible(account: AplosAccount): boolean {
  return account.category === "asset" && account.is_enabled;
}

export function isProcessingFeeExpenseAccountEligible(account: AplosAccount): boolean {
  return account.category === "expense" && account.is_enabled;
}
