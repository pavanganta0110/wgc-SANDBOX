import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const preferencesSchema = z.object({
  publicReference: z.string().min(1),
  buildUpdatesPreference: z.enum(["OPTED_IN", "SESSION_ONLY"]),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = preferencesSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }

    const { publicReference, buildUpdatesPreference } = result.data;

    const lead = await prisma.firstLookLead.findUnique({
      where: { publicReference }
    });

    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    await prisma.firstLookLead.update({
      where: { id: lead.id },
      data: {
        buildUpdatesPreference,
        buildUpdatesPreferenceSetAt: new Date(),
      }
    });
    
    await prisma.firstLookLeadActivity.create({
      data: {
        leadId: lead.id,
        action: "UPDATED_PREFERENCES",
        metadataJson: { buildUpdatesPreference }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("First Look Preferences API Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
