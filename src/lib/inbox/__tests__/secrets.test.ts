import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptInboxSecret, encryptInboxSecret } from "../secrets";

const key = () => crypto.randomBytes(32).toString("base64");
const saved = { inbox: process.env.INBOX_ENCRYPTION_KEY, aplos: process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY };
afterEach(() => {
  if (saved.inbox === undefined) delete process.env.INBOX_ENCRYPTION_KEY; else process.env.INBOX_ENCRYPTION_KEY = saved.inbox;
  if (saved.aplos === undefined) delete process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY; else process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = saved.aplos;
});

describe("inbox secrets", () => {
  it("round-trips with INBOX_ENCRYPTION_KEY", () => {
    process.env.INBOX_ENCRYPTION_KEY = key();
    delete process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
    const enc = encryptInboxSecret("refresh-token");
    expect(enc).not.toContain("refresh-token");
    expect(decryptInboxSecret(enc)).toBe("refresh-token");
  });
  it("falls back to the old Aplos-named key", () => {
    delete process.env.INBOX_ENCRYPTION_KEY;
    process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = key();
    expect(decryptInboxSecret(encryptInboxSecret("abc"))).toBe("abc");
  });
  it("INBOX_ENCRYPTION_KEY wins when both are set", () => {
    process.env.INBOX_ENCRYPTION_KEY = key();
    process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = key();
    const enc = encryptInboxSecret("abc");
    delete process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
    expect(decryptInboxSecret(enc)).toBe("abc");
  });
  it("names INBOX_ENCRYPTION_KEY when nothing is configured", () => {
    delete process.env.INBOX_ENCRYPTION_KEY;
    delete process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => encryptInboxSecret("x")).toThrow(/INBOX_ENCRYPTION_KEY is not configured/);
  });
  it("rejects a wrong-size key", () => {
    process.env.INBOX_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptInboxSecret("x")).toThrow(/32 bytes/);
  });
});
