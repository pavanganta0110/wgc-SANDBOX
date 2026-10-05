import { describe, it, expect } from "vitest";
import { computeMigrationFingerprint } from "@/lib/migrations/migrationFingerprint";

describe("computeMigrationFingerprint", () => {
  it("is deterministic for the same inputs", () => {
    const a = computeMigrationFingerprint("church-a", "DONOR", ["Jane Doe", "jane@example.com"]);
    const b = computeMigrationFingerprint("church-a", "DONOR", ["Jane Doe", "jane@example.com"]);
    expect(a).toBe(b);
  });

  it("is case- and whitespace-insensitive", () => {
    const a = computeMigrationFingerprint("church-a", "DONOR", ["Jane Doe", "JANE@EXAMPLE.COM"]);
    const b = computeMigrationFingerprint("church-a", "DONOR", [" jane doe ", " jane@example.com "]);
    expect(a).toBe(b);
  });

  it("differs across churches", () => {
    const a = computeMigrationFingerprint("church-a", "DONOR", ["Jane Doe"]);
    const b = computeMigrationFingerprint("church-b", "DONOR", ["Jane Doe"]);
    expect(a).not.toBe(b);
  });

  it("differs across entity types for the same church and fields", () => {
    const a = computeMigrationFingerprint("church-a", "DONOR", ["Jane Doe"]);
    const b = computeMigrationFingerprint("church-a", "FUND", ["Jane Doe"]);
    expect(a).not.toBe(b);
  });

  it("differs when a field value changes", () => {
    const a = computeMigrationFingerprint("church-a", "FUND", ["Building Fund"]);
    const b = computeMigrationFingerprint("church-a", "FUND", ["Missions Fund"]);
    expect(a).not.toBe(b);
  });
});
