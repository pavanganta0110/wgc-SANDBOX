import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { isValidEmail } from "@/lib/donors/donorContact";
import { requirePartnerSession, requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import { createPartnerInvite, PartnerAccountError } from "@/lib/partners/partnerAccounts";
import { sendPartnerInviteEmail } from "@/lib/partners/partnerInviteEmail";
import { isStaffRole, parseStaffRole } from "@/lib/partners/partnerType";

/** The people on the signed-in partner's own account. */
export async function GET() {
  try {
    const session = await requirePartnerSession();
    const users = await prisma.partnerUser.findMany({
      where: { partnerId: session.partnerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, passwordHash: true, disabledAt: true, lastLoginAt: true, staffRole: true, agentId: true },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.disabledAt ? "disabled" : u.passwordHash ? "active" : "invite_pending",
        lastLoginAt: u.lastLoginAt,
        role: u.agentId ? "AGENT" : parseStaffRole(u.staffRole),
        isYou: u.id === session.partnerUserId,
      })),
    });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Invites a colleague to this partner account (or sends a pending invite again). A person is either full access or view-only. */
export async function POST(req: Request) {
  try {
    const session = await requirePartnerWriteSession();
    if (!checkMerchantAuthRateLimit(`partner-invite:${session.partnerId}`)) {
      return NextResponse.json({ error: "Too many invitations. Please try again in a minute." }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if ("role" in body && !isStaffRole(body.role)) return NextResponse.json({ error: "Choose full access or view-only." }, { status: 400 });
    const staffRole = isStaffRole(body.role) ? body.role : "FULL";

    let invite;
    try {
      invite = await createPartnerInvite({ partnerId: session.partnerId, email, name, staffRole });
    } catch (err) {
      if (err instanceof PartnerAccountError) return NextResponse.json({ error: err.message }, { status: err.code === "email_in_use" ? 409 : 400 });
      throw err;
    }
    const partner = await prisma.partner.findUnique({ where: { id: session.partnerId }, select: { name: true } });
    const sent = await sendPartnerInviteEmail({ partnerName: partner?.name ?? "your", email, rawToken: invite.rawToken, role: staffRole });
    await createAuditLog({ action: "PARTNER_TEAM_INVITED", actorEmail: session.email, metadata: { partnerId: session.partnerId, invitedEmail: email, staffRole, emailSent: sent } });
    if (!sent) return NextResponse.json({ error: "The invitation couldn't be emailed. Try again in a moment." }, { status: 502 });
    return NextResponse.json({ message: `Invitation sent to ${email}.` }, { status: 201 });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
