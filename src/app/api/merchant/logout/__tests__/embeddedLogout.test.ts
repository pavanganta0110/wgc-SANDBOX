import { describe, it, expect, vi } from "vitest";

const clear = vi.hoisted(() => ({ clearSessionCookie: vi.fn(async () => undefined), clearImpersonationCookie: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/session", () => ({ clearSessionCookie: clear.clearSessionCookie }));
vi.mock("@/lib/auth/impersonation", () => ({ clearImpersonationCookie: clear.clearImpersonationCookie }));

import { POST } from "../route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

describe("POST /api/merchant/logout", () => {
  it("clears the session the normal way and also the partitioned cookie a partner frame uses", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(clear.clearSessionCookie).toHaveBeenCalled();
    expect(clear.clearImpersonationCookie).toHaveBeenCalled();
    const cookies = res.headers.getSetCookie();
    const framed = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=;`)) ?? "";
    expect(framed).toContain("Max-Age=0");
    expect(framed).toContain("SameSite=None");
    expect(framed).toContain("Secure");
    expect(framed).toContain("Partitioned");
  });
});
