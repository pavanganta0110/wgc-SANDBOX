import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const churches = await prisma.church.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        billingSetupStatus: true,
      },
    });
    return NextResponse.json({ success: true, churches });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
