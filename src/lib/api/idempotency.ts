import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const IDEMPOTENCY_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

/** Looks up a cached response for this (API key, Idempotency-Key, method,
 * path) — returns it verbatim if found and not expired, so a retried write
 * (e.g. a client that timed out and resent the same request) never
 * double-processes. Returns null when there's nothing to replay, meaning
 * the caller should process the request normally. */
export async function findIdempotentReplay(apiKeyId: string, idempotencyKey: string, method: string, path: string): Promise<NextResponse | null> {
  const record = await prisma.apiIdempotencyRecord.findUnique({ where: { apiKeyId_idempotencyKey: { apiKeyId, idempotencyKey } } });
  if (!record) return null;
  if (record.method !== method || record.path !== path) return null; // same key reused for a different operation — treat as a fresh request, never silently return the wrong result
  if (Date.now() - record.createdAt.getTime() > IDEMPOTENCY_RECORD_TTL_MS) return null;

  return NextResponse.json(record.responseBodyJson as object, { status: record.responseStatus, headers: { "X-Idempotent-Replay": "true" } });
}

/** Caches a write response for future idempotent replay. Best-effort — a
 * failure to cache must never fail the actual request that already
 * succeeded, so this never throws. */
export async function storeIdempotentResponse(apiKeyId: string, idempotencyKey: string, method: string, path: string, status: number, body: unknown): Promise<void> {
  try {
    await prisma.apiIdempotencyRecord.create({
      data: { apiKeyId, idempotencyKey, method, path, responseStatus: status, responseBodyJson: body as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("Failed to store idempotency record:", err);
  }
}
