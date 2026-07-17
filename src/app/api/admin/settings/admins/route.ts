import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { isValidEmail } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";

function adminView(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  disabledAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  const invitePending = !user.passwordHash;
  const inviteExpired = invitePending && (!user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date());
  let invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED";
  if (!invitePending) invitationStatus = "ACCEPTED";
  else if (inviteExpired) invitationStatus = "EXPIRED";
  else invitationStatus = "PENDING";

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    invitationStatus,
    disabled: !!user.disabledAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ["wgc_admin", "wgc_super_admin"] } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ admins: admins.map(adminView) });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = body.role === "wgc_super_admin" ? "wgc_super_admin" : "wgc_admin";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      role,
      setPasswordTokenHash: tokenHash,
      setPasswordTokenExpiresAt: expiresAt,
      invitedByUserId: session.userId,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const inviteLink = `${appUrl}/admin/accept-invite?token=${rawToken}`;

  try {
    await sendWgcEmail({
      to: email,
      subject: "You've been invited to the WGC Payments Admin Dashboard",
      title: "You're invited",
      badgeText: "Admin Invitation",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>You've been invited to join the WGC Payments Admin Dashboard as ${role === "wgc_super_admin" ? "a Super Admin" : "an Admin"}.</p>
                 <p><a href="${inviteLink}">Accept invitation and set your password</a></p>
                 <p>This invitation link expires in 48 hours.</p>`,
    });
  } catch (err) {
    console.error("Failed to send admin invite email:", err);
  }

  await prisma.auditLog.create({
    data: {
      action: "ADMIN_INVITED",
      actorEmail: session.email,
      metadata: { invitedUserId: user.id, email, role },
    },
  });

  return NextResponse.json({ admin: adminView(user) }, { status: 201 });
}
