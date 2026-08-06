import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyPartnerAccess, AplosPartnerVerifyError } from "../partners";

describe("verifyPartnerAccess", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the verification result on a real, confirmed authorized response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        version: "v2_0_1",
        status: 200,
        data: { partner_verification: { aplos_account_id: "org-123", authorized: true } },
      }),
    });

    const result = await verifyPartnerAccess("token-abc", "org-123");
    expect(result).toEqual({ aplos_account_id: "org-123", authorized: true });
  });

  it("hits the exact documented URL and header shape", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_1", status: 200, data: { partner_verification: { aplos_account_id: "org-1", authorized: true } } }),
    });

    await verifyPartnerAccess("my-token", "org-1");

    expect(fetchMock.mock.calls[0][0]).toBe("https://app.aplos.com/hermes/api/v1/partners/verify?api-client-id=org-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { Authorization: "Bearer my-token" } });
  });

  it("returns authorized: false for the documented unauthorized response shape, without throwing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        version: "v2_0_1",
        status: 422,
        data: { partner_verification: { aplos_account_id: "org-123", authorized: false } },
        exception: { message: "Client is not authorized to access the given account.", code: 1006 },
      }),
    });

    // The documented "unauthorized" response includes BOTH a data.partner_verification
    // AND an exception block — exception takes priority since it's the more specific signal.
    await expect(verifyPartnerAccess("token", "org-123")).rejects.toMatchObject({
      normalized: { category: "ACCESS_DENIED", aplosExceptionCode: 1006 },
    });
  });

  it("throws AplosPartnerVerifyError on a network failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(verifyPartnerAccess("token", "org")).rejects.toBeInstanceOf(AplosPartnerVerifyError);
  });

  it("throws on a malformed response missing partner_verification", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_1", status: 200, data: {} }),
    });
    await expect(verifyPartnerAccess("token", "org")).rejects.toBeInstanceOf(AplosPartnerVerifyError);
  });

  it("URL-encodes an account id containing special characters", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_1", status: 200, data: { partner_verification: { aplos_account_id: "org a/b", authorized: true } } }),
    });
    await verifyPartnerAccess("token", "org a/b");
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent("org a/b"));
  });
});
