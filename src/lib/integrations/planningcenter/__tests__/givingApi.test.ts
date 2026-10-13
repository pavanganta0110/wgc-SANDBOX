import { describe, it, expect, vi } from "vitest";
import type { PlanningCenterClient } from "../resourceClient";
import { PlanningCenterApiError } from "../errors";
import {
  PAYMENT_SOURCE_NAME,
  createFund,
  createPaymentSource,
  isFundUsable,
  listFunds,
  listPaymentSources,
  normalizeFundName,
  touchPaymentSource,
} from "../givingApi";

function fakeClient(handlers: { get?: (path: string) => unknown; request?: (path: string, opts: { method?: string; body?: unknown }) => unknown }) {
  return {
    get: vi.fn(async (path: string) => handlers.get?.(path)),
    request: vi.fn(async (path: string, opts: { method?: string; body?: unknown }) => handlers.request?.(path, opts)),
  } as unknown as PlanningCenterClient & { get: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
}

const fundRow = (i: number, extra: Record<string, unknown> = {}) => ({
  id: String(i),
  attributes: { name: `Fund ${i}`, default: false, visibility: "everywhere", ...extra },
});

describe("listFunds / listPaymentSources", () => {
  it("walks every page until a short page", async () => {
    const pages: Record<string, unknown> = {
      "/giving/v2/funds?per_page=100&offset=0": { data: Array.from({ length: 100 }, (_, i) => fundRow(i)) },
      "/giving/v2/funds?per_page=100&offset=100": { data: Array.from({ length: 100 }, (_, i) => fundRow(100 + i)) },
      "/giving/v2/funds?per_page=100&offset=200": { data: [fundRow(200)] },
    };
    const client = fakeClient({ get: (p) => pages[p] });
    const funds = await listFunds(client);
    expect(funds).toHaveLength(201);
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it("stops after one request when the first page is short or empty", async () => {
    const client = fakeClient({ get: () => ({ data: [] }) });
    await expect(listFunds(client)).resolves.toEqual([]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("maps fund attributes defensively", async () => {
    const client = fakeClient({ get: () => ({ data: [{ id: "7", attributes: { name: "General", default: true, visibility: "admin_only", ledger_code: "100" } }, { id: "8" }] }) });
    const [a, b] = await listFunds(client);
    expect(a).toEqual({ id: "7", name: "General", isDefault: true, visibility: "admin_only", ledgerCode: "100" });
    expect(b).toEqual({ id: "8", name: "", isDefault: false, visibility: "", ledgerCode: null });
  });

  it("maps payment sources and defaults a missing status to active", async () => {
    const client = fakeClient({ get: () => ({ data: [{ id: "1", attributes: { name: "WGC Payments" } }, { id: "2", attributes: { name: "Old", status: "archived" } }] }) });
    await expect(listPaymentSources(client)).resolves.toEqual([
      { id: "1", name: "WGC Payments", status: "active" },
      { id: "2", name: "Old", status: "archived" },
    ]);
  });

  it("propagates API errors untouched so callers can inspect the status", async () => {
    const err = new PlanningCenterApiError({ category: "ACCESS_DENIED", retryable: false, safeMessage: "no" }, 403);
    const client = fakeClient({ get: () => { throw err; } });
    await expect(listFunds(client)).rejects.toBe(err);
  });
});

describe("createFund", () => {
  it("POSTs an admin_only fund by default so it never shows on the church's donate form", async () => {
    const client = fakeClient({ request: () => ({ data: { id: "9", attributes: { name: "Missions", visibility: "admin_only" } } }) });
    const fund = await createFund(client, { name: "Missions" });
    const [path, opts] = client.request.mock.calls[0];
    expect(path).toBe("/giving/v2/funds");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({ data: { type: "Fund", attributes: { name: "Missions", visibility: "admin_only" } } });
    expect(fund.id).toBe("9");
  });

  it("truncates the description to Planning Center's 255-character limit", async () => {
    const client = fakeClient({ request: () => ({ data: { id: "9", attributes: { name: "X" } } }) });
    await createFund(client, { name: "X", description: "d".repeat(400) });
    const attrs = (client.request.mock.calls[0][1].body as { data: { attributes: { description: string } } }).data.attributes;
    expect(attrs.description).toHaveLength(255);
  });

  it("fails clearly if Planning Center returns no id", async () => {
    const client = fakeClient({ request: () => ({}) });
    await expect(createFund(client, { name: "X" })).rejects.toThrow(/did not return the created fund/);
  });
});

describe("payment source writes", () => {
  it("creates a source with the WGC name", async () => {
    const client = fakeClient({ request: () => ({ data: { id: "4", attributes: { name: PAYMENT_SOURCE_NAME, status: "active" } } }) });
    const source = await createPaymentSource(client, PAYMENT_SOURCE_NAME);
    expect(client.request.mock.calls[0][1].body).toEqual({ data: { type: "PaymentSource", attributes: { name: "WGC Payments" } } });
    expect(source).toEqual({ id: "4", name: "WGC Payments", status: "active" });
  });

  it("touch re-saves the SAME name (a no-op for the data) and does not reactivate unless asked", async () => {
    const client = fakeClient({ request: () => ({ data: { id: "4", attributes: { name: "WGC Payments", status: "active" } } }) });
    await touchPaymentSource(client, { id: "4", name: "WGC Payments", status: "active" });
    const [path, opts] = client.request.mock.calls[0];
    expect(path).toBe("/giving/v2/payment_sources/4");
    expect(opts.method).toBe("PATCH");
    expect((opts.body as { data: { attributes: Record<string, unknown> } }).data.attributes).toEqual({ name: "WGC Payments" });
  });

  it("touch reactivates an archived source when asked", async () => {
    const client = fakeClient({ request: () => ({ data: { id: "4", attributes: { name: "WGC Payments", status: "active" } } }) });
    await touchPaymentSource(client, { id: "4", name: "WGC Payments", status: "archived" }, { reactivate: true });
    expect((client.request.mock.calls[0][1].body as { data: { attributes: Record<string, unknown> } }).data.attributes).toEqual({ name: "WGC Payments", status: "active" });
  });
});

describe("helpers", () => {
  it("only funds with visibility 'nowhere' are unusable", () => {
    const base = { id: "1", name: "x", isDefault: false, ledgerCode: null };
    expect(isFundUsable({ ...base, visibility: "everywhere" })).toBe(true);
    expect(isFundUsable({ ...base, visibility: "admin_only" })).toBe(true);
    expect(isFundUsable({ ...base, visibility: "hidden" })).toBe(true);
    expect(isFundUsable({ ...base, visibility: "nowhere" })).toBe(false);
  });

  it("normalizes names for matching", () => {
    expect(normalizeFundName("  General   FUND ")).toBe("general fund");
  });
});
