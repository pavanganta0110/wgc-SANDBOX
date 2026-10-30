import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("@/lib/partners/partnerApiAuth", () => ({
  withPartnerApiAuth: (handler: (req: Request, auth: { partnerKeyId: string; partnerId: string }, requestId: string) => Promise<Response>) => async (req: Request) =>
    handler(req, { partnerKeyId: "k1", partnerId: "p1" }, "req_1"),
}));

const prismaMock = vi.hoisted(() => ({ partnerEmbedLinkRequest: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST, EMBED_LINKS_PER_MINUTE } from "../route";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const post = (body: unknown) => POST(new Request("https://wgc.test/api/v1/partner/embed-links", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partnerEmbedLinkRequest.count.mockResolvedValue(0);
  prismaMock.partnerEmbedLinkRequest.create.mockResolvedValue({});
  prismaMock.partnerEmbedLinkRequest.deleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/v1/partner/embed-links", () => {
  it("stores a record of each request (the key, the partner and the reference, never the email)", async () => {
    await post({ reference: "loc_1", email: "sam@church.test" });
    expect(prismaMock.partnerEmbedLinkRequest.create).toHaveBeenCalledWith({ data: { partnerId: "p1", partnerKeyId: "k1", reference: "loc_1" } });
  });

  it("refuses a key that asks for too many links in a minute, and makes no link", async () => {
    prismaMock.partnerEmbedLinkRequest.count.mockResolvedValue(EMBED_LINKS_PER_MINUTE);
    const res = await post({ reference: "loc_1" });
    expect(res.status).toBe(429);
    expect(prismaMock.partnerEmbedLinkRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.partnerEmbedLinkRequest.count.mock.calls[0][0].where.partnerKeyId).toBe("k1");
  });

  it("signs a link for the key's own partner, whatever the body says", async () => {
    const res = await post({ reference: "loc_1", email: "Owner@Church.test", partnerId: "p2", organizationName: "Grace" });
    const body = await res.json();
    const token = new URL(body.data.url).searchParams.get("link");
    expect(verifyPartnerEmbedLinkToken(token)).toMatchObject({ partnerId: "p1", reference: "loc_1", email: "owner@church.test", prefill: { organizationName: "Grace" } });
  });

  it("uses the person's email as the organization's contact unless a contact email is given", async () => {
    const link = async (body: unknown) => verifyPartnerEmbedLinkToken(new URL((await (await post(body)).json()).data.url).searchParams.get("link"));
    expect((await link({ reference: "loc_1", email: "Admin@Church.test" }))?.prefill.contactEmail).toBe("admin@church.test");
    expect((await link({ reference: "loc_1", email: "admin@church.test", contactEmail: "office@church.test" }))?.prefill.contactEmail).toBe("office@church.test");
  });

  it("needs a reference and valid emails", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ reference: "x", email: "nope" })).status).toBe(400);
    expect((await post({ reference: "x", contactEmail: "nope" })).status).toBe(400);
  });
});
