import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiError, extractJsonObject, generateJson } from "../ai";

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const ok = (text: string, finishReason = "STOP") => reply({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key-123";
});
afterEach(() => vi.unstubAllGlobals());

describe("generateJson", () => {
  it("sends the prompt to Gemini's web API with the key in a header, asks for JSON, and returns the text", async () => {
    const fetchMock = vi.fn(() => ok('{"a":1}'));
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateJson({ model: "gemini-flash-latest", prompt: "hello", maxOutputTokens: 100 })).toBe('{"a":1}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect(url).not.toContain("test-key-123");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-123");
    const sent = JSON.parse(String(init.body));
    expect(sent.contents[0].parts[0].text).toBe("hello");
    expect(sent.generationConfig).toMatchObject({ responseMimeType: "application/json", maxOutputTokens: 100 });
  });

  it("fails clearly, and never with the key in the message, when the key is missing, the service errors or declines, or the reply is empty or cut off", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateJson({ model: "m", prompt: "p", maxOutputTokens: 1 })).rejects.toThrow("GEMINI_API_KEY is not set");
    process.env.GEMINI_API_KEY = "test-key-123";

    const cases: Array<[Promise<Response>, string]> = [
      [reply({ error: { message: "quota exceeded" } }, 429), "answered 429: quota exceeded"],
      [reply({ promptFeedback: { blockReason: "SAFETY" } }), "declined the request (SAFETY)"],
      [reply({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] }), "sent no text (SAFETY)"],
      [ok('{"a":', "MAX_TOKENS"), "cut off"],
    ];
    for (const [response, message] of cases) {
      vi.stubGlobal("fetch", vi.fn(() => response));
      const err = await generateJson({ model: "m", prompt: "p", maxOutputTokens: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(AiError);
      expect(err.message).toContain(message);
      expect(err.message).not.toContain("test-key-123");
    }
  });

  it("reports a network failure or timeout as an AI error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("socket hang up"))));
    await expect(generateJson({ model: "m", prompt: "p", maxOutputTokens: 1 })).rejects.toThrow("did not answer in time");
  });
});

describe("extractJsonObject", () => {
  it("finds the JSON even when the model wraps it in a code fence or text", () => {
    expect(extractJsonObject<{ a: number }>('```json\n{"a": 2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject<{ a: number }>('Here you go: {"a": 3} thanks')).toEqual({ a: 3 });
  });

  it("throws when there is no JSON or it is broken", () => {
    expect(() => extractJsonObject("no json here")).toThrow(AiError);
    expect(() => extractJsonObject("{broken")).toThrow(AiError);
  });
});
