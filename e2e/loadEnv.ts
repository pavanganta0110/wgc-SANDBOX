import fs from "fs";
import path from "path";

/**
 * Playwright's globalSetup/globalTeardown run as a plain Node process, not
 * through Next.js's own env loader — so .env.local (DATABASE_URL, etc.)
 * isn't picked up automatically the way it is for `next dev`. This is a
 * minimal, dependency-free parser (no dotenv install needed) used only by
 * the e2e harness, never by application code.
 */
export function loadDotEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
