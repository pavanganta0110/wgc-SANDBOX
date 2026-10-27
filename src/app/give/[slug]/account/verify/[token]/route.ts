import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeDonorLoginLink } from "@/lib/donorPortal/donorAuth";

/** Emailed one-tap sign-in. A route handler (not a page) because setting the session cookie is not allowed while rendering. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const accountUrl = new URL(`/give/${encodeURIComponent(slug)}/account`, req.url);

  const church = await prisma.church.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!church) return NextResponse.redirect(new URL("/", req.url));

  const result = await consumeDonorLoginLink(church.id, church.slug, token);
  if (!result.ok) accountUrl.searchParams.set("linkError", "1");
  return NextResponse.redirect(accountUrl);
}
