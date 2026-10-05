import { describe, it, expect, vi, beforeEach } from "vitest";

const recordFinixTechnicalFailure = vi.fn();
vi.mock("@/lib/monitoring/finixHealth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/monitoring/finixHealth")>("@/lib/monitoring/finixHealth");
  return { ...actual, recordFinixTechnicalFailure: (...args: unknown[]) => recordFinixTechnicalFailure(...args) };
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

async function loadClient() {
  vi.resetModules();
  const mod = await import("../client");
  return mod.finixClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FINIX_USERNAME", "test");
  vi.stubEnv("FINIX_PASSWORD", "test");
  vi.stubEnv("FINIX_BASE_URL", "https://finix.example.test");
});

describe("FinixClient technical-failure instrumentation", () => {
  it("never records a health event for a business decline (200 response, state=FAILED)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(201, { id: "TR123", state: "FAILED", failure_code: "DO_NOT_HONOR" })));
    const client = await loadClient();

    const result = await client.getTransfer("TR123");

    expect(result.state).toBe("FAILED");
    expect(recordFinixTechnicalFailure).not.toHaveBeenCalled();
  });

  it("records an AUTH_FAILURE health event for a 401 response and throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "unauthorized" })));
    const client = await loadClient();

    await expect(client.getTransfer("TR123")).rejects.toThrow();
    expect(recordFinixTechnicalFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: "AUTH_FAILURE", httpStatus: 401 }));
  });

  it("records a SERVER_ERROR health event for a 500 on a write (no retry for writes on 5xx)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: "internal error" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = await loadClient();

    await expect(client.createTransfer({ fraud_session_id: "fs_1", amount: 1000 })).rejects.toThrow();
    expect(recordFinixTechnicalFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: "SERVER_ERROR", httpStatus: 500 }));
    // Writes never retry on an ambiguous 5xx — exactly one attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records a NETWORK_ERROR health event when fetch itself throws on a write", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    const client = await loadClient();

    await expect(client.createTransfer({ fraud_session_id: "fs_1", amount: 1000 })).rejects.toThrow();
    expect(recordFinixTechnicalFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: "NETWORK_ERROR" }));
  });

  it("attaches the same requestId to both the recorded health event and the thrown error, for correlation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "unauthorized" })));
    const client = await loadClient();

    let caught: { requestId?: string } | undefined;
    try {
      await client.getTransfer("TR123");
    } catch (err) {
      caught = err as { requestId?: string };
    }
    expect(caught).toBeDefined();
    expect(caught!.requestId).toBeDefined();
    expect(recordFinixTechnicalFailure).toHaveBeenCalledWith(expect.objectContaining({ requestId: caught!.requestId }));
  });

  it("classifies a 4xx that isn't 401/403/429 as CLIENT_ERROR, never as a business decline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { message: "bad request" })));
    const client = await loadClient();

    await expect(client.createTransfer({ fraud_session_id: "fs_1", amount: 1000 })).rejects.toThrow();
    expect(recordFinixTechnicalFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: "CLIENT_ERROR" }));
  });
});
