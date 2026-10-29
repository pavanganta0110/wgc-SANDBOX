import { describe, it, expect, vi, afterEach } from "vitest";
import { isAllowedPartnerWebhookUrl } from "../webhookUrl";

describe("isAllowedPartnerWebhookUrl", () => {
  it("accepts a public https URL", () => {
    expect(isAllowedPartnerWebhookUrl("https://hooks.example.com/wgc")).toBe(true);
    expect(isAllowedPartnerWebhookUrl("https://gh-payment-demo.workers.dev/wgc-webhook")).toBe(true);
    expect(isAllowedPartnerWebhookUrl("https://8.8.8.8/hook")).toBe(true);
  });

  it("rejects anything that isn't https", () => {
    expect(isAllowedPartnerWebhookUrl("http://hooks.example.com/wgc")).toBe(false);
    expect(isAllowedPartnerWebhookUrl("ftp://hooks.example.com")).toBe(false);
    expect(isAllowedPartnerWebhookUrl("not a url")).toBe(false);
    expect(isAllowedPartnerWebhookUrl(undefined)).toBe(false);
    expect(isAllowedPartnerWebhookUrl("https://user:pw@hooks.example.com/")).toBe(false);
  });

  it("rejects addresses that point into a private network", () => {
    for (const url of [
      "https://localhost/hook",
      "https://intranet/hook",
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://172.16.0.5/hook",
      "https://172.31.255.1/hook",
      "https://192.168.1.10/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://0.0.0.0/hook",
      "https://[::1]/hook",
      "https://[fd00::1]/hook",
      "https://[fe80::1]/hook",
      "https://printer.local/hook",
      "https://db.internal/hook",
    ]) {
      expect(isAllowedPartnerWebhookUrl(url), url).toBe(false);
    }
    expect(isAllowedPartnerWebhookUrl("https://172.32.0.1/hook")).toBe(true);
  });
});

describe("local development switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows a receiver on this machine only outside production and only when switched on", () => {
    expect(isAllowedPartnerWebhookUrl("http://127.0.0.1:5599/hook")).toBe(false);

    vi.stubEnv("PARTNER_WEBHOOK_ALLOW_LOCAL", "1");
    expect(isAllowedPartnerWebhookUrl("http://127.0.0.1:5599/hook")).toBe(true);
    expect(isAllowedPartnerWebhookUrl("ftp://127.0.0.1/hook")).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    expect(isAllowedPartnerWebhookUrl("http://127.0.0.1:5599/hook")).toBe(false);
    expect(isAllowedPartnerWebhookUrl("https://localhost/hook")).toBe(false);
  });
});
