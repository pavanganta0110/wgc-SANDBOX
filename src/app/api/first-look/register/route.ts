import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import crypto from "crypto";
import { sendFirstLookConfirmationEmail, sendFirstLookInternalNotification } from "@/lib/email";

// Basic in-memory rate limiting (max 10 registrations per IP per hour)
const rateLimitCache = new Map<string, { count: number; expiresAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitCache.get(ip);
  
  if (!record || record.expiresAt < now) {
    rateLimitCache.set(ip, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count += 1;
  return true;
}

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  organization: z.string().min(1, "Organization is required").max(200),
  role: z.string().min(1, "Role is required").max(100),
  annualGiving: z.string().min(1, "Annual giving is required").max(100),
  preferredTime: z.string().min(1, "Preferred time is required").max(100),
  painPoint: z.string().max(1000).optional().default(""),
  honeypot: z.string().optional(),
  source: z.string().optional().default("first-look-landing"),
  referrer: z.string().optional().default(""),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  utmContent: z.string().nullable().optional(),
  utmTerm: z.string().nullable().optional(),
  landingPageUrl: z.string().optional(),
  metaEventId: z.string().optional(),
});

function generatePublicReference() {
  // Generate a random 8-character string for public use (e.g. ref=A8B29X0)
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(req: Request) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ success: false, error: "Too many registrations. Please try again later." }, { status: 429 });
    }

    const body = await req.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    // Honeypot check for bots
    if (data.honeypot) {
      // Act like it succeeded to fool the bot
      return NextResponse.json({ success: true, registrationReference: "bot-ignored" });
    }

    const normalizedEmail = data.email.toLowerCase().trim();
    
    // Check if lead already exists
    const existingLead = await prisma.firstLookLead.findUnique({
      where: { normalizedEmail },
    });

    let lead;
    let publicReference = existingLead ? existingLead.publicReference : generatePublicReference();

    if (existingLead) {
      // Update existing lead with latest info
      lead = await prisma.firstLookLead.update({
        where: { id: existingLead.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          organizationName: data.organization,
          role: data.role,
          annualGivingRange: data.annualGiving,
          preferredSessionTime: data.preferredTime,
          painPoint: data.painPoint || existingLead.painPoint,
          lastSubmittedAt: new Date(),
          submissionCount: { increment: 1 },
          landingPageUrl: data.landingPageUrl || existingLead.landingPageUrl,
          metaEventId: data.metaEventId || existingLead.metaEventId,
          // Only update UTMs if they are present in this submission
          ...(data.utmSource && { utmSource: data.utmSource }),
          ...(data.utmMedium && { utmMedium: data.utmMedium }),
          ...(data.utmCampaign && { utmCampaign: data.utmCampaign }),
          ...(data.utmContent && { utmContent: data.utmContent }),
          ...(data.utmTerm && { utmTerm: data.utmTerm }),
        }
      });
      
      await prisma.firstLookLeadActivity.create({
        data: {
          leadId: lead.id,
          action: "SUBMITTED_REGISTRATION_AGAIN",
          metadataJson: { source: data.source }
        }
      });
    } else {
      // Create new lead
      lead = await prisma.firstLookLead.create({
        data: {
          publicReference,
          firstName: data.firstName,
          lastName: data.lastName,
          originalEmail: data.email.trim(),
          normalizedEmail,
          organizationName: data.organization,
          role: data.role,
          annualGivingRange: data.annualGiving,
          preferredSessionTime: data.preferredTime,
          painPoint: data.painPoint,
          source: data.source,
          referrer: data.referrer,
          utmSource: data.utmSource,
          utmMedium: data.utmMedium,
          utmCampaign: data.utmCampaign,
          utmContent: data.utmContent,
          utmTerm: data.utmTerm,
          landingPageUrl: data.landingPageUrl,
          metaEventId: data.metaEventId,
        }
      });
      
      await prisma.firstLookLeadActivity.create({
        data: {
          leadId: lead.id,
          action: "CREATED_REGISTRATION",
          metadataJson: { source: data.source }
        }
      });
    }

    // Fire & Forget Emails
    sendFirstLookConfirmationEmail(lead).catch(console.error);
    sendFirstLookInternalNotification(lead).catch(console.error);

    return NextResponse.json({ success: true, registrationReference: publicReference });
  } catch (error: any) {
    console.error("First Look Registration API Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
