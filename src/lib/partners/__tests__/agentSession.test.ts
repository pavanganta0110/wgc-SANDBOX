import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn() }, partnerUser: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/session", () => ({ getAdminSession: vi.fn() }));

import { createPartnerSessionToken, getPartnerSession, requirePartnerSession } from "../partnerSession";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const user = (agentId: string | null) => ({
  id: "u1", partnerId: "p1", email: "a@x.test", name: "A", disabledAt: null, authVersion: 1, agentId,
  partner: { name: "Sparrow", status: "ACTIVE" },
});

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: createPartnerSessionToken({ partnerUserId: "u1", partnerId: "p1", authVersion: 1 }) });
});

describe("an agent's partner login", () => {
  it("is treated as signed out by default, so no existing page or endpoint can show an agent the partner's data", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(user("agent-1"));
    expect(await getPartnerSession()).toBeNull();
    await expect(requirePartnerSession()).rejects.toThrow();
  });

  it("is let in only where a page asks for it, and carries the agent id", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(user("agent-1"));
    expect(await getPartnerSession({ allowAgent: true })).toMatchObject({ partnerId: "p1", agentId: "agent-1" });
  });

  it("does not change what partner staff get", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(user(null));
    const s = await getPartnerSession();
    expect(s).toMatchObject({ partnerId: "p1", email: "a@x.test" });
    expect(s?.agentId).toBeUndefined();
  });
});
