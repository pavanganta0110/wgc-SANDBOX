import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Lightweight endpoint: validates a reset token without consuming it.
// Used by the set-password page on mount to decide whether to show
// the form or an "expired link" error state.
export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: { setPasswordTokenHash: tokenHash },
      select: { setPasswordTokenExpiresAt: true },
    });

    if (!user || !user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date()) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
