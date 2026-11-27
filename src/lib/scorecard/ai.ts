/**
 * The scorecard's one call to an AI model: Google Gemini, over its plain web API (no extra package).
 * Settings: GEMINI_API_KEY (server only), SCORECARD_MODEL (scoring) and SCORECARD_REPORT_MODEL (the written report).
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export class AiError extends Error {}

/**
 * Sends one prompt and returns the model's reply as JSON text. Asks Gemini for JSON directly. Never includes the key in
 * an error. Throws AiError on any failure (missing key, refusal, bad status, empty or cut-off reply, timeout).
 */
export async function generateJson(opts: { model: string; prompt: string; maxOutputTokens: number; timeoutMs?: number }): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("GEMINI_API_KEY is not set");

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: opts.maxOutputTokens, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 55_000),
    });
  } catch {
    throw new AiError("The AI service did not answer in time");
  }

  const body = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  } | null;

  if (!res.ok) throw new AiError(`The AI service answered ${res.status}${body?.error?.message ? `: ${body.error.message.slice(0, 160)}` : ""}`);
  if (body?.promptFeedback?.blockReason) throw new AiError(`The AI service declined the request (${body.promptFeedback.blockReason})`);

  const candidate = body?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AiError(`The AI service sent no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`);
  if (candidate?.finishReason === "MAX_TOKENS") throw new AiError("The AI reply was cut off before it finished");
  return text;
}

/** The first JSON object in a reply (some models wrap it in text or code fences). */
export function extractJsonObject<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError("No JSON in the AI reply");
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    throw new AiError("The AI reply was not valid JSON");
  }
}
