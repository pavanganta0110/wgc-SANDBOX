import type { NextResponse } from "next/server";
import { apiError, paginationMeta, parsePagination } from "@/lib/api/response";
import type { PartnerLedgerOrganization } from "@/lib/ledger/loadLedger";
import type { PartnerApiAuthContext } from "./partnerApiAuth";
import { loadPartnerApiOrganizations, pickPartnerOrganization } from "./loadPartnerApiOrganizations";

/**
 * What every partner list endpoint (/api/v1/partner/donors, settlements, recurring, ...) starts
 * from: the organizations this key may read, narrowed to one if the caller asked, plus the
 * paging parameters. The organizations always come from the key. `organization` can only
 * pick one of the partner's own; anything else is a 404, never a wider read.
 */
export interface PartnerListScope {
  organizations: PartnerLedgerOrganization[];
  /** The only organization ids a query may use. */
  churchIds: string[];
  orgById: Map<string, PartnerLedgerOrganization>;
  limit: number;
  cursor: string | null;
  searchParams: URLSearchParams;
}

export async function resolvePartnerListScope(req: Request, auth: PartnerApiAuthContext, requestId: string): Promise<{ scope: PartnerListScope } | { response: NextResponse }> {
  const searchParams = new URL(req.url).searchParams;
  let organizations = await loadPartnerApiOrganizations(auth.partnerId);

  const requested = searchParams.get("organization");
  if (requested) {
    const one = pickPartnerOrganization(organizations, requested);
    if (!one) return { response: apiError("not_found_error", "No organization of yours matches `organization`.", requestId) };
    organizations = [one];
  }

  const { limit, cursor } = parsePagination(searchParams);
  return {
    scope: { organizations, churchIds: organizations.map((o) => o.id), orgById: new Map(organizations.map((o) => [o.id, o])), limit, cursor, searchParams },
  };
}

/**
 * Pages a result the same way the organization API does (cursor = last id), and swaps each
 * row's internal churchId for `organization` {id, name, reference}.
 */
export function pageWithOrganization<T extends { id: string; churchId: string | null }>(rows: T[], scope: PartnerListScope) {
  const { page, hasMore, nextCursor } = paginationMeta(rows, scope.limit);
  const data = page.map((row) => {
    const { churchId, ...rest } = row;
    return { ...rest, organization: churchId ? (scope.orgById.get(churchId) ?? null) : null };
  });
  return { data, hasMore, nextCursor };
}
