import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "merchant-logos";

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

/**
 * Uploads bytes to the public merchant-logos bucket and returns the permanent public URL.
 * Throws on failure.
 */
export async function uploadPublicLogo(storageKey: string, fileData: Blob | File | Buffer, contentType: string): Promise<string> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storageKey, fileData, { contentType, upsert: true });
  
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageKey);
  if (!data || !data.publicUrl) {
    throw new Error("Failed to generate public URL for uploaded logo");
  }
  
  return data.publicUrl;
}
