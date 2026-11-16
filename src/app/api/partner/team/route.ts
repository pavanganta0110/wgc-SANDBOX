import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { isValidEmail } from "@/lib/donors/donorContact";
import { requirePartnerSession, requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";
import { createPartnerInvite, PartnerAccountError } from "@/lib/partners/partnerAccounts";
import { sendPartnerInviteEmail } from "@/lib/partners/partnerInviteEmail";
import { isStaffRole, parseStaffRole } from "@/lib/partners/partnerType";

/** The people on the signed-in partner's own account. */
export async function GET(req: Request) {
  try {
    const session = await requirePartnerSession();
    const users = await prisma.partnerUser.findMany({
      where: { partnerId: session.partnerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, passwordHash: true, disabledAt: true, lastLoginAt: true, staffRole: true, agentId: true },
    });
    // The partner's agents, and whether each already has a login: the Team page sends and re-sends their logins.
    const code = session.partnerType === "REFERRAL" && !session.agentId ? await ensureOnboardingCode(session.partnerId) : null;
    const origin = new URL(req.url).origin;
    const agents =
      code
        ? (await prisma.partnerAgent.findMany({ where: { partnerId: session.partnerId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true } })).map((a) => {
            const login = users.find((u) => u.agentId === a.id && !u.disabledAt);
            return { id: a.id, name: a.name, email: a.email, status: a.status, login: login ? (login.passwordHash ? "active" : "invite_pending") : "none", loginEmail: login?.email ?? null, link: `${origin}/start?partner=${code}&agent=${a.id}` };
          })
        : [];
    return NextResponse.json({
      referral: Boolean(code),
      agents,
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
    if (body.action !== "addAgent" && !isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    // A referral partner adds its own agent (no WGC step); the rate is the default until WGC sets one.
    if (body.action === "addAgent") {
      if (session.partnerType !== "REFERRAL") return NextResponse.json({ error: "Only a referral partner has agents." }, { status: 400 });
      const agentName = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const agentEmail = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
      if (!agentName) return NextResponse.json({ error: "Enter the agent's name." }, { status: 400 });
      if (agentEmail && !isValidEmail(agentEmail)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if ((await prisma.partnerAgent.count({ where: { partnerId: session.partnerId } })) >= 200) return NextResponse.json({ error: "Too many agents." }, { status: 409 });
      const agent = await prisma.partnerAgent.create({ data: { partnerId: session.partnerId, name: agentName, email: agentEmail || null } });
      await createAuditLog({ action: "PARTNER_AGENT_ADDED", actorEmail: session.email, metadata: { partnerId: session.partnerId, agentId: agent.id, name: agentName, by: "partner" } });
      return NextResponse.json({ message: `${agentName} added.`, id: agent.id }, { status: 201 });
    }

    // An invitation for one of the partner's agents: a login that sees only that agent's clients and commission.
    const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : null;
    if (agentId) {
      if (session.partnerType !== "REFERRAL") return NextResponse.json({ error: "Only a referral partner has agents." }, { status: 400 });
      const agent = await prisma.partnerAgent.findFirst({ where: { id: agentId, partnerId: session.partnerId }, select: { id: true, status: true } });
      if (!agent) return NextResponse.json({ error: "That agent does not belong to your account." }, { status: 400 });
      if (agent.status !== "ACTIVE") return NextResponse.json({ error: "That agent is inactive." }, { status: 409 });
      let agentInvite;
      try {
        agentInvite = await createPartnerInvite({ partnerId: session.partnerId, email, name, agentId });
      } catch (err) {
        if (err instanceof PartnerAccountError) return NextResponse.json({ error: err.message }, { status: err.code === "email_in_use" ? 409 : 400 });
        throw err;
      }
      const partnerRow = await prisma.partner.findUnique({ where: { id: session.partnerId }, select: { name: true } });
      const agentSent = await sendPartnerInviteEmail({ partnerName: partnerRow?.name ?? "your", email, rawToken: agentInvite.rawToken, role: "AGENT" });
      await createAuditLog({ action: "PARTNER_AGENT_INVITED", actorEmail: session.email, metadata: { partnerId: session.partnerId, agentId, invitedEmail: email, emailSent: agentSent } });
      if (!agentSent) return NextResponse.json({ error: "The invitation couldn't be emailed. Try again in a moment." }, { status: 502 });
      return NextResponse.json({ message: `Login invitation sent to ${email}.` }, { status: 201 });
    }

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
