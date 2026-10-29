import { describe, it, expect, vi, beforeEach } from "vitest";

const orgs = vi.hoisted(() => ({ loadPartnerApiOrganizations: vi.fn() }));
vi.mock("../loadPartnerApiOrganizations", async (importOriginal) => ({ ...(await importOriginal<typeof import("../loadPartnerApiOrganizations")>()), loadPartnerApiOrganizations: orgs.loadPartnerApiOrganizations }));

import { pageWithOrganization, resolvePartnerListScope } from "../partnerApiScope";

const mine = [
  { id: "c1", name: "Grace", reference: "loc_1" },
  { id: "c2", name: "Hope", reference: null },
];
const call = (query = "") => resolvePartnerListScope(new Request(`https://wgc.test/api/v1/partner/donors${query}`), { partnerKeyId: "k1", partnerId: "p1" }, "req_1");

beforeEach(() => {
  vi.clearAllMocks();
  orgs.loadPartnerApiOrganizations.mockResolvedValue(mine);
});

describe("resolvePartnerListScope", () => {
  it("takes the organizations from the key's partner, never from the request", async () => {
    const result = await call("?churchId=someone-elses&partnerId=p2");
    expect("scope" in result && result.scope.churchIds).toEqual(["c1", "c2"]);
    expect(orgs.loadPartnerApiOrganizations).toHaveBeenCalledWith("p1");
  });

  it("narrows to one of the partner's own organizations by id or by the partner's reference", async () => {
    for (const q of ["?organization=c2", "?organization=loc_1"]) {
      const result = await call(q);
      expect("scope" in result && result.scope.churchIds).toHaveLength(1);
    }
    const byRef = await call("?organization=loc_1");
    expect("scope" in byRef && byRef.scope.churchIds).toEqual(["c1"]);
  });

  it("answers 404, never a wider read, for an organization that isn't the partner's", async () => {
    const result = await call("?organization=not-mine");
    expect("response" in result && result.response.status).toBe(404);
  });

  it("reads the paging parameters", async () => {
    const result = await call("?limit=7&cursor=abc");
    expect("scope" in result && [result.scope.limit, result.scope.cursor]).toEqual([7, "abc"]);
  });
});

describe("pageWithOrganization", () => {
  it("swaps the internal churchId for the organization and reports paging", async () => {
    const result = await call("?limit=2");
    if (!("scope" in result)) throw new Error("no scope");
    const rows = [
      { id: "a", churchId: "c1", name: "x" },
      { id: "b", churchId: "c2", name: "y" },
      { id: "c", churchId: "c1", name: "z" },
    ];
    const { data, hasMore, nextCursor } = pageWithOrganization(rows, result.scope);
    expect(data).toEqual([
      { id: "a", name: "x", organization: { id: "c1", name: "Grace", reference: "loc_1" } },
      { id: "b", name: "y", organization: { id: "c2", name: "Hope", reference: null } },
    ]);
    expect(JSON.stringify(data)).not.toContain("churchId");
    expect(hasMore).toBe(true);
    expect(nextCursor).toBe("b");
  });
});
