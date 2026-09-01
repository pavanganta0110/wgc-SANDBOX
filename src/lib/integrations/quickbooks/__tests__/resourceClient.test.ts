import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config", () => ({
  getQuickBooksApiBaseUrl: () => "https://sandbox-quickbooks.api.intuit.com",
}));

async function load() {
  vi.resetModules();
  return import("../resourceClient");
}

function fakeResponse(body: unknown, { ok = true, status = 200, intuitTid }: { ok?: boolean; status?: number; intuitTid?: string } = {}) {
  const headers = new Headers();
  if (intuitTid) headers.set("intuit_tid", intuitTid);
  return { ok, status, headers, text: async () => JSON.stringify(body) } as Response;
}

describe("QuickBooksResourceClient — API error handling", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses a successful company info response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse({ CompanyInfo: { CompanyName: "Test Co" } }));
    const { QuickBooksResourceClient } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });
    const info = await client.getCompanyInfo();
    expect(info.CompanyName).toBe("Test Co");
  });

  it("classifies a known Intuit fault code and captures intuit_tid for support tickets", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeResponse(
        { Fault: { Error: [{ Message: "AuthenticationFailed", code: "3200", Detail: "Token expired" }], type: "AUTHENTICATION" } },
        { ok: false, status: 401, intuitTid: "abc-123-tid" }
      )
    );
    const { QuickBooksResourceClient, QuickBooksNormalizedApiError } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });

    await expect(client.getCompanyInfo()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(QuickBooksNormalizedApiError);
      const normalized = (err as InstanceType<typeof QuickBooksNormalizedApiError>).normalized;
      expect(normalized.category).toBe("AUTHENTICATION_REQUIRED");
      expect(normalized.intuitFaultCode).toBe("3200");
      expect(normalized.intuitTid).toBe("abc-123-tid");
      expect(normalized.rawDetail).toBe("Token expired");
      return true;
    });
  });

  it("falls back to plain HTTP-status classification when the body isn't Intuit's fault shape", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse({ some: "unexpected shape" }, { ok: false, status: 500 }));
    const { QuickBooksResourceClient, QuickBooksNormalizedApiError } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });

    await expect(client.getCompanyInfo()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(QuickBooksNormalizedApiError);
      expect((err as InstanceType<typeof QuickBooksNormalizedApiError>).normalized.category).toBe("TEMPORARY_INTUIT_ERROR");
      return true;
    });
  });

  it("classifies a validation fault (e.g. bad customer data) distinctly, non-retryable", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeResponse({ Fault: { Error: [{ Message: "Business Validation Error", code: "6000", Detail: "DisplayName already in use" }] } }, { ok: false, status: 400 })
    );
    const { QuickBooksResourceClient } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });

    await expect(client.createCustomer({ DisplayName: "Dup" })).rejects.toSatisfy((err: unknown) => {
      const normalized = (err as { normalized: { category: string; retryable: boolean } }).normalized;
      expect(normalized.category).toBe("VALIDATION_ERROR");
      expect(normalized.retryable).toBe(false);
      return true;
    });
  });

  it("classifies a network/timeout failure (fetch itself throwing) as retryable", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network unreachable"));
    const { QuickBooksResourceClient } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });

    await expect(client.getCompanyInfo()).rejects.toSatisfy((err: unknown) => {
      const normalized = (err as { normalized: { category: string; retryable: boolean } }).normalized;
      expect(normalized.category).toBe("TEMPORARY_INTUIT_ERROR");
      expect(normalized.retryable).toBe(true);
      return true;
    });
  });

  it("createPayment sends the expected request shape and parses the created record", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fakeResponse({ Payment: { Id: "145", CustomerRef: { value: "9" }, TotalAmt: 25 } }));
    const { QuickBooksResourceClient } = await load();
    const client = new QuickBooksResourceClient({ accessToken: "tok", realmId: "123" });

    const result = await client.createPayment({ CustomerRef: { value: "9" }, TotalAmt: 25 });
    expect(result.Id).toBe("145");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/v3/company/123/payment");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ CustomerRef: { value: "9" }, TotalAmt: 25 });
    expect(options.headers.Authorization).toBe("Bearer tok");
  });
});
