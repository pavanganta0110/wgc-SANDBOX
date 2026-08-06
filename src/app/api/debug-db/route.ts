import { NextResponse } from "next/server";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "not-set";
  // Mask the password for security
  const masked = dbUrl.replace(/:([^:@]+)@/, ":***@");
  return NextResponse.json({ dbUrl: masked });
}
