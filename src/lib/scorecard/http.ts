import { NextResponse } from "next/server";
import type { HandlerResult } from "./service";

const MAX_BODY_BYTES = 200_000;

/** Reads a JSON body of at most 200 KB. Null when it is too big or not JSON. */
export async function readJson(req: Request): Promise<unknown | null> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function toResponse(r: HandlerResult): Response {
  if ("html" in r) {
    return new Response(r.html, { status: r.status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  return NextResponse.json(r.json, { status: r.status, headers: { "cache-control": "no-store" } });
}

export const tooMany = () => NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": "60" } });
export const badBody = () => NextResponse.json({ error: "Request body must be JSON (under 200 KB)." }, { status: 400 });
