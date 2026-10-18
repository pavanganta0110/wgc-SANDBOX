import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSession = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockSession() }));
const mockPermission = vi.fn();
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: unknown[]) => mockPermission(...a) }));
const disconnect = vi.fn();
vi.mock("@/lib/integrations/planningcenter/service", () => ({ disconnectPlanningCenter: (...a: unknown[]) => disconnect(...a) }));

import { ForbiddenError } from "@/lib/auth/errors";
import { PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";
import { POST } from "../disconnect/route";

const session = { churchId: "church-from-session", userId: "u1", email: "a@b.c", role: "ADMIN" };
const post = (body?: unknown) => new Request("http://x", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  [mockSession, mockPermission, disconnect].forEach((m) => m.mockReset());
  mockSession.mockResolvedValue(session);
  disconnect.mockResolvedValue({ status: "DISCONNECTED" });
});

describe("POST /disconnect", () => {
  it("disconnects WITHOUT deleting stored data when no choice is sent (the safe default)", async () => {
    expect((await POST(post())).status).toBe(200);
    expect(disconnect).toHaveBeenCalledWith(expect.objectContaining({ churchId: session.churchId, deleteStoredData: false }));
  });

  it("deletes stored data only when the body says exactly deleteStoredData: true", async () => {
    await POST(post({ deleteStoredData: true }));
    expect(disconnect).toHaveBeenLastCalledWith(expect.objectContaining({ deleteStoredData: true }));
    await POST(post({ deleteStoredData: "yes" }));
    expect(disconnect).toHaveBeenLastCalledWith(expect.objectContaining({ deleteStoredData: false }));
  });

  it("always acts on the signed-in church, never one named in the body", async () => {
    await POST(post({ deleteStoredData: true, churchId: "someone-else" }));
    expect(disconnect).toHaveBeenCalledWith(expect.objectContaining({ churchId: session.churchId }));
  });

  it("needs permission to manage integrations", async () => {
    mockPermission.mockImplementation(() => { throw new ForbiddenError("no"); });
    expect((await POST(post({ deleteStoredData: true }))).status).toBe(403);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("404s when there is nothing to disconnect", async () => {
    disconnect.mockRejectedValue(new PlanningCenterConnectionError("This organization has no Planning Center connection."));
    expect((await POST(post())).status).toBe(404);
  });
});
