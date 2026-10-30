import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@/lib/partners/partnerApiAuth", () => ({
  withPartnerApiAuth: (handler: (req: Request, auth: { partnerKeyId: string; partnerId: string }, requestId: string) => Promise<Response>) => async (req: Request) =>
    handler(req, { partnerKeyId: "k1", partnerId: "p1" }, "req_1"),
}));

import { POST } from "../route";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const post = (body: unknown) => POST(new Request("https://wgc.test/api/v1/partner/embed-links", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/v1/partner/embed-links", () => {
  it("signs a link for the key's own partner, whatever the body says", async () => {
    const res = await post({ reference: "loc_1", email: "Owner@Church.test", partnerId: "p2", organizationName: "Grace" });
    const body = await res.json();
    const token = new URL(body.data.url).searchParams.get("link");
    expect(verifyPartnerEmbedLinkToken(token)).toMatchObject({ partnerId: "p1", reference: "loc_1", email: "owner@church.test", prefill: { organizationName: "Grace" } });
  });

  it("needs a reference and valid emails", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ reference: "x", email: "nope" })).status).toBe(400);
    expect((await post({ reference: "x", contactEmail: "nope" })).status).toBe(400);
  });
});
