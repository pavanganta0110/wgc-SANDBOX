import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "merchant-logos";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`Supabase storage is not configured. (url_exists: ${!!url}, key_exists: ${!!key})`);
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Uploads bytes to the shared public "merchant-logos" bucket and returns the
 * permanent public URL. Despite the bucket's name (kept as-is to avoid
 * migrating already-uploaded logo URLs), this is a general-purpose public
 * image store for anything a merchant uploads that needs to be shown on a
 * public page — org logos, campaign images, etc. — distinguished only by
 * storageKey prefix, not by bucket. Throws on failure.
 */
async function uploadPublicFile(storageKey: string, fileData: Blob | File | Buffer, contentType: string): Promise<string> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storageKey, fileData, { contentType, upsert: true });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageKey);
  if (!data || !data.publicUrl) {
    throw new Error("Failed to generate public URL for the uploaded file");
  }

  return data.publicUrl;
}

export async function uploadPublicLogo(storageKey: string, fileData: Blob | File | Buffer, contentType: string): Promise<string> {
  return uploadPublicFile(storageKey, fileData, contentType);
}

/** Same underlying storage as uploadPublicLogo, used for campaign/team/fundraiser cover images instead of org logos. */
export async function uploadPublicCampaignImage(storageKey: string, fileData: Blob | File | Buffer, contentType: string): Promise<string> {
  return uploadPublicFile(storageKey, fileData, contentType);
}
