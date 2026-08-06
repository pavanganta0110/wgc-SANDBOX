import fs from "fs";
import path from "path";

/**
 * Minimal .env.local loader for the Playwright test process (a separate
 * Node process from the Next.js dev server, which loads .env.local on its
 * own via Next's built-in dotenv support). No external "dotenv" dependency
 * is installed in this repo, and the values here never need to be printed
 * or logged — only used in-memory to compute things like webhook HMAC
 * signatures, exactly the way a real webhook sender would.
 *
 * Values already present in process.env are never overwritten (matches
 * dotenv's own precedence rule, and lets CI override via real env vars).
 */
let loaded = false;

export function loadDotEnvLocal(): void {
  if (loaded) return;
  loaded = true;

  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();
