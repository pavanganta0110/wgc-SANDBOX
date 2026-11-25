import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { checkMerchantAuthRateLimit } from "@/lib/auth/merchantAuthRateLimit";
import { isValidEmail } from "@/lib/donors/donorContact";
import { requirePartnerSession, requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";
import { addPartnerAgent, AddAgentError } from "@/lib/partners/addPartnerAgent";
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
    if (body.action !== "addAgent" && body.action !== "resendInvite" && !isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    // Send a pending invitation again. The address and role come from the stored person, never from
    // the request, so the email always goes to that person's own address and nobody else's.
    if (body.action === "resendInvite") {
      const target = typeof body.userId === "string" ? await prisma.partnerUser.findFirst({
        where: { id: body.userId, partnerId: session.partnerId },
        select: { email: true, name: true, passwordHash: true, disabledAt: true, agentId: true, staffRole: true },
      }) : null;
      if (!target) return NextResponse.json({ error: "That person is not on your team." }, { status: 404 });
      if (target.disabledAt) return NextResponse.json({ error: "That person's access was removed." }, { status: 409 });
      if (target.passwordHash) return NextResponse.json({ error: "That person has already set up their login." }, { status: 409 });
      const role = target.agentId ? "AGENT" : parseStaffRole(target.staffRole);
      let again;
      try {
        again = await createPartnerInvite({
          partnerId: session.partnerId,
          email: target.email,
          name: target.name,
          ...(target.agentId ? { agentId: target.agentId } : { staffRole: role === "VIEWER" ? "VIEWER" : "FULL" }),
        });
      } catch (err) {
        if (err instanceof PartnerAccountError) return NextResponse.json({ error: err.message }, { status: err.code === "email_in_use" ? 409 : 400 });
        throw err;
      }
      const partnerRow = await prisma.partner.findUnique({ where: { id: session.partnerId }, select: { name: true } });
      const resent = await sendPartnerInviteEmail({ partnerName: partnerRow?.name ?? "your", email: target.email, rawToken: again.rawToken, role });
      await createAuditLog({ action: "PARTNER_TEAM_INVITE_RESENT", actorEmail: session.email, metadata: { partnerId: session.partnerId, invitedEmail: target.email, emailSent: resent } });
      if (!resent) return NextResponse.json({ error: "The invitation couldn't be emailed. Try again in a moment." }, { status: 502 });
      return NextResponse.json({ message: `Invitation sent again to ${target.email}.` });
    }

    // A referral partner adds its own agent; WGC is told so it can set the rate (default until then).
    if (body.action === "addAgent") {
      try {
        const agent = await addPartnerAgent({ partnerId: session.partnerId, name: body.name, email: body.email, actor: session.email, via: "dashboard" });
        return NextResponse.json({ message: `${agent.name} added.`, id: agent.id }, { status: 201 });
      } catch (err) {
        if (err instanceof AddAgentError) return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
      }
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
