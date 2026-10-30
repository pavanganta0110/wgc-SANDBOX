import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn() }, partnerUser: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const adminMock = vi.hoisted(() => ({ getAdminSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => adminMock);

import {
  createPartnerSessionToken,
  verifyPartnerSessionToken,
  getPartnerSession,
  requirePartnerWriteSession,
  setPartnerViewAsCookie,
  PARTNER_VIEW_AS_MAX_AGE_SECONDS,
  PARTNER_SESSION_MAX_AGE_SECONDS,
} from "../partnerSession";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const viewToken = () => createPartnerSessionToken({ partnerUserId: "admin:a1", partnerId: "p1", authVersion: 0, viewAsAdminUserId: "a1" });
const asView = () => cookieStore.get.mockReturnValue({ value: viewToken() });

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.getAdminSession.mockResolvedValue({ userId: "a1", email: "boss@wgc.test", name: "Boss", role: "wgc_super_admin" });
  prismaMock.partner.findUnique.mockResolvedValue({ name: "Clear Vision" });
});

describe("an admin's read-only view of a partner", () => {
  it("is a short token that records which admin it is for", () => {
    const now = Date.now();
    const token = createPartnerSessionToken({ partnerUserId: "admin:a1", partnerId: "p1", authVersion: 0, viewAsAdminUserId: "a1" }, now);
    const payload = verifyPartnerSessionToken(token, now)!;
    expect(payload.viewAsAdminUserId).toBe("a1");
    expect(payload.exp - Math.floor(now / 1000)).toBe(PARTNER_VIEW_AS_MAX_AGE_SECONDS);
    const normal = verifyPartnerSessionToken(createPartnerSessionToken({ partnerUserId: "u", partnerId: "p1", authVersion: 1 }, now), now)!;
    expect(normal.exp - Math.floor(now / 1000)).toBe(PARTNER_SESSION_MAX_AGE_SECONDS);
  });

  it("opens the partner's dashboard as read-only while the same super admin is signed in", async () => {
    asView();
    const s = await getPartnerSession();
    expect(s).toMatchObject({ partnerId: "p1", partnerName: "Clear Vision", email: "boss@wgc.test", readOnly: true });
    expect(prismaMock.partnerUser.findUnique).not.toHaveBeenCalled();
  });

  it("ends when the admin signs out, is a different admin, or is not a super admin", async () => {
    asView();
    adminMock.getAdminSession.mockResolvedValue(null);
    expect(await getPartnerSession()).toBeNull();
    adminMock.getAdminSession.mockResolvedValue({ userId: "other", email: "x", name: null, role: "wgc_super_admin" });
    expect(await getPartnerSession()).toBeNull();
    adminMock.getAdminSession.mockResolvedValue({ userId: "a1", email: "x", name: null, role: "wgc_admin" });
    expect(await getPartnerSession()).toBeNull();
  });

  it("is refused for a partner that no longer exists", async () => {
    asView();
    prismaMock.partner.findUnique.mockResolvedValue(null);
    expect(await getPartnerSession()).toBeNull();
  });

  it("is refused by anything that changes something", async () => {
    asView();
    await expect(requirePartnerWriteSession()).rejects.toThrow(/read-only/i);
  });

  it("a partner's own staff can still make changes", async () => {
    cookieStore.get.mockReturnValue({ value: createPartnerSessionToken({ partnerUserId: "u1", partnerId: "p1", authVersion: 2 }) });
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "u1", partnerId: "p1", email: "d@x.test", name: "D", disabledAt: null, authVersion: 2, partner: { name: "Clear Vision", status: "ACTIVE" } });
    const s = await requirePartnerWriteSession();
    expect(s.readOnly).toBeUndefined();
  });

  it("sets a one-hour cookie for the admin", async () => {
    await setPartnerViewAsCookie("p1", "a1");
    const [name, token, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("wgc_partner_session");
    expect(verifyPartnerSessionToken(token)).toMatchObject({ partnerId: "p1", viewAsAdminUserId: "a1" });
    expect(options).toMatchObject({ httpOnly: true, maxAge: PARTNER_VIEW_AS_MAX_AGE_SECONDS });
  });
});

describe("every partner route that changes something refuses the read-only view", () => {
  it("uses requirePartnerWriteSession, never requirePartnerSession, in POST, PUT, PATCH and DELETE", async () => {
    const root = path.join(process.cwd(), "src/app/api/partner");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.ts") files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of files) {
      const parts = fs.readFileSync(file, "utf8").split(/(?=export async function )/);
      for (const part of parts) {
        const m = /^export async function (GET|POST|PUT|PATCH|DELETE)\b/.exec(part);
        if (m && m[1] !== "GET" && part.includes("requirePartnerSession()")) offenders.push(`${path.relative(root, file)} ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
