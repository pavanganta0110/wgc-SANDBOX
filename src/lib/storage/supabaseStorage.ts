import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * WGC's own private object storage — completely independent of Finix.
 * Used exclusively for documents that must never reach the payment
 * processor (see src/lib/onboarding/wgcInternalDocumentGuard.ts). Every
 * other document-upload flow in this codebase stores bytes via Finix's own
 * File API; this is the one storage path that isn't Finix at all.
 */
const BUCKET = "onboarding-internal-documents";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase storage is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Uploads bytes to the private bucket. Throws on failure — callers must not silently swallow a storage error. */
export async function uploadPrivateFile(storageKey: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await getClient().storage.from(BUCKET).upload(storageKey, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/**
 * Returns a signed URL valid for `expiresInSeconds` (default 5 minutes) —
 * never a permanent URL, and the caller must never persist this value
 * anywhere (DB, logs, audit records).
 */
export async function createSignedDownloadUrl(storageKey: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storageKey, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message || "unknown error"}`);
  return data.signedUrl;
}


