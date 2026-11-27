import { describe, it, expect } from "vitest";
import { buildCsvExport } from "@/lib/csvExport";
import { filterLeads, LEAD_CSV_COLUMNS, statusOf, toAdminRow } from "../adminRows";
import type { Contact } from "../types";

const base = (over: Partial<Contact> = {}): Contact => ({
  id: "c1",
  email: "ada@church.test",
  created_at: Date.parse("2026-11-20T10:00:00Z"),
  sent: {},
  name: "Ada Lovelace",
  org: "Grace Church",
  role: "ED",
  phone: "816-555-0123",
  fundraising_score: "57",
  pitch_score: "74",
  scores: { mission: 3, ask: 2, platform: 3, relationships: 4, board: 2, leaders: "not sure" },
  answers: { mission: "We feed families", board: "Four of eleven give nothing" },
  pitch: "Give $500",
  data_consent: "yes",
  invited_as: "self",
  ...over,
});

describe("toAdminRow", () => {
  it("lays one lead out for the list: scores, every area, source, consent and what was sent", () => {
    const r = toAdminRow(base({ sent: { L2: 2, L1: 1 }, results_sent_at: Date.parse("2026-11-20T10:01:00Z"), last_scored_at: Date.parse("2026-11-20T10:00:30Z") }));
    expect(r).toMatchObject({ name: "Ada Lovelace", email: "ada@church.test", organization: "Grace Church", fundraisingScore: "57", pitchScore: "74", status: "NOT_PURCHASED", source: "self", dataConsent: "yes", followUpsSent: ["L1", "L2"], unsubscribed: false });
    expect(r.areaScores.map((a) => a.name)).toEqual(["Mission & who you serve", "The ask", "Donor platform", "Donor relationships", "Board", "Executive leadership"]);
    expect(r.areaScores.find((a) => a.key === "leaders")!.score).toBe("not sure");
    expect(r.areaScores.find((a) => a.key === "board")!.answer).toContain("Four of eleven");
    expect(r.resultsEmailAt).toBe("2026-11-20T10:01:00.000Z");
  });

  it("reads missing optional fields as empty, not as errors", () => {
    const r = toAdminRow({ id: "x", email: "a@b.co", created_at: 0, sent: {} });
    expect(r.name).toBe("");
    expect(r.fundraisingScore).toBe("");
    expect(r.areaScores.every((a) => a.score === "" && a.answer === "")).toBe(true);
    expect(r.reportSentAt).toBeNull();
  });
});

describe("statusOf", () => {
  it.each([
    [undefined, "NOT_PURCHASED"],
    ["checking", "CHECKING"],
    ["pending", "HELD"],
    ["sending", "SENDING"],
    ["sent", "SENT"],
    ["failed", "FAILED"],
  ])("%s -> %s", (s, expected) => {
    const c = base(s ? { purchase: { started_at: 1, transfer_id: "TR1", status: s as never } } : {});
    expect(statusOf(c)).toBe(expected);
  });
});

describe("filterLeads", () => {
  const rows = [
    toAdminRow(base({ id: "a", email: "ada@church.test", name: "Ada", org: "Grace Church", created_at: Date.parse("2026-11-20T00:00:00Z") })),
    toAdminRow(base({ id: "b", email: "bob@hope.test", name: "Bob", org: "Hope Mission", created_at: Date.parse("2026-11-22T00:00:00Z"), purchase: { started_at: 1, transfer_id: "TR1", status: "sent" } })),
  ];

  it("searches name, email and organization, any letter case", () => {
    expect(filterLeads(rows, { q: "HOPE" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterLeads(rows, { q: "ada@" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { q: "nobody" })).toEqual([]);
  });

  it("filters by report status, and ALL shows everyone", () => {
    expect(filterLeads(rows, { status: "SENT" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterLeads(rows, { status: "NOT_PURCHASED" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { status: "ALL" })).toHaveLength(2);
  });

  it("puts the newest first unless oldest is asked for", () => {
    expect(filterLeads(rows, {}).map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterLeads(rows, { sort: "oldest" }).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the CSV", () => {
  it("has a header and one row per lead, with every area's score and answer", () => {
    const csv = buildCsvExport([toAdminRow(base())], LEAD_CSV_COLUMNS);
    const [header, row] = csv.split("\n");
    expect(header).toContain("Email");
    expect(header).toContain("Board answer");
    expect(row).toContain("ada@church.test");
    expect(row).toContain("Four of eleven give nothing");
  });

  it("neutralizes anything a visitor typed that a spreadsheet would run as a formula", () => {
    const csv = buildCsvExport([toAdminRow(base({ name: "=HYPERLINK(\"http://evil\",\"x\")", org: "+SUM(A1)", pitch: "@cmd" }))], LEAD_CSV_COLUMNS);
    const row = csv.split("\n")[1];
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain("'+SUM(A1)");
    expect(row).toContain("'@cmd");
    expect(row).not.toMatch(/(^|,)=HYPERLINK/);
  });
});
