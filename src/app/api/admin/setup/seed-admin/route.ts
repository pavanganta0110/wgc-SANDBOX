import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

/**
 * Sandbox-only, one-time internal admin bootstrap — not a public signup
 * page (there is none). Creates exactly one wgc_super_admin User row from
 * SANDBOX_ADMIN_EMAIL/SANDBOX_ADMIN_PASSWORD, which must already be set
 * as environment variables; this route never accepts credentials from the
 * request body, so a caller can never choose who gets created. Requires a
 * matching ADMIN_SETUP_SECRET header so the route can't be triggered by
 * anyone who merely knows the URL. Idempotent — safe to call more than
 * once, never creates a duplicate admin for the same email, and never
 * echoes the password back in the response or in any log line.
 */
export async function POST(req: Request) {
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: "ADMIN_SETUP_SECRET is not configured — refusing to run" }, { status: 503 });
  }
  const providedSecret = req.headers.get("x-setup-secret");
  if (providedSecret !== setupSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = process.env.SANDBOX_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SANDBOX_ADMIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "SANDBOX_ADMIN_EMAIL/SANDBOX_ADMIN_PASSWORD are not configured" }, { status: 503 });
  }
  if (password.length < 12) {
    return NextResponse.json({ error: "SANDBOX_ADMIN_PASSWORD must be at least 12 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "wgc_admin" || existing.role === "wgc_super_admin") {
      return NextResponse.json({ status: "already_exists", userId: existing.id });
    }
    return NextResponse.json({ error: "A non-admin user already exists with this email" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({
    data: {
      email,
      name: "Sandbox Admin",
      passwordHash,
      role: "wgc_super_admin",
      churchId: null,
    },
  });

  return NextResponse.json({ status: "created", userId: created.id });
}
