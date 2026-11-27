import { describe, it, expect, vi, beforeEach } from "vitest";

const ai = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("../ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("../ai")>()), generateJson: ai.generateJson }));
vi.mock("../store", () => ({}));
vi.mock("../mailer", () => ({}));
vi.mock("../verifyTransfer", () => ({}));
vi.mock("@/lib/runAfterResponse", () => ({ runAfterResponse: vi.fn() }));

import { handleScore } from "../service";
import { writeReport } from "../report";

const area = (key: string, score: number) => ({ key, score, why: `why ${key}`, fix: `fix ${key}` });
const six = ["mission", "ask", "platform", "relationships", "board", "leaders"].map((k, i) => area(k, i + 1));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SCORECARD_MODEL;
  delete process.env.SCORECARD_REPORT_MODEL;
});

describe("scoring with Gemini", () => {
  it("scores all six areas and the pitch, clamping numbers into range", async () => {
    ai.generateJson.mockResolvedValue(JSON.stringify({ areas: [...six.slice(0, 5), area("leaders", 99)], pitch: { score: 140, notes: [{ ok: true, text: "good" }] } }));
    const res = (await handleScore({ org: "Grace", answers: { mission: "We feed families" }, pitch: "Give $500" })) as { status: number; json: { areas: Record<string, { score: number }>; pitch: { score: number } } };
    expect(res.status).toBe(200);
    expect(res.json.areas.leaders.score).toBe(5);
    expect(res.json.pitch.score).toBe(100);
    expect(ai.generateJson.mock.calls[0][0]).toMatchObject({ model: "gemini-flash-latest", maxOutputTokens: 8000 });
    expect(ai.generateJson.mock.calls[0][0].prompt).toContain("We feed families");
  });

  it("uses the model named in the setting", async () => {
    process.env.SCORECARD_MODEL = "gemini-pinned-1";
    ai.generateJson.mockResolvedValue(JSON.stringify({ areas: six, pitch: null }));
    await handleScore({ org: "x", answers: {} });
    expect(ai.generateJson.mock.calls[0][0].model).toBe("gemini-pinned-1");
  });

  it("answers 502 so the page falls back to keyword scoring when the AI fails or leaves an area out", async () => {
    ai.generateJson.mockRejectedValue(new Error("quota"));
    expect((await handleScore({ org: "x", answers: {} })).status).toBe(502);
    ai.generateJson.mockResolvedValue(JSON.stringify({ areas: six.slice(0, 5), pitch: null }));
    expect((await handleScore({ org: "x", answers: {} })).status).toBe(502);
  });

  it("refuses a body that is not an object", async () => {
    expect((await handleScore(null)).status).toBe(400);
  });
});

describe("writing the report with Gemini", () => {
  const contact = { id: "c1", email: "a@b.co", created_at: 0, sent: {}, org: "Grace", answers: { ask: "we ask nicely" }, scores: { ask: 2 } };

  it("asks the report model for the whole report and returns it", async () => {
    ai.generateJson.mockResolvedValue(JSON.stringify({ opening: "o", areas: [], ask: { diagnosis: "d", rewrite: "r" }, board_moves: ["b"], leader_moves: ["l"] }));
    const r = await writeReport(contact);
    expect(r.board_moves).toEqual(["b"]);
    expect(ai.generateJson.mock.calls[0][0]).toMatchObject({ model: "gemini-pro-latest", maxOutputTokens: 16000 });
    expect(ai.generateJson.mock.calls[0][0].prompt).toContain("we ask nicely");
  });

  it("rejects an incomplete report instead of emailing half of one", async () => {
    ai.generateJson.mockResolvedValue(JSON.stringify({ opening: "o" }));
    await expect(writeReport(contact)).rejects.toThrow("Report JSON incomplete");
  });
});
