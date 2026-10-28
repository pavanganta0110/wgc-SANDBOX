import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { canManageStudents } from "@/lib/students/access";
import StudentGivingSettings from "@/components/merchant/students/StudentGivingSettings";

export default async function StudentGivingSettingsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { studentGivingEnabled: true, studentCurrentTerm: true },
  });
  return (
    <StudentGivingSettings
      enabled={church?.studentGivingEnabled ?? false}
      currentTerm={church?.studentCurrentTerm ?? null}
      canManage={canManageStudents(auth)}
    />
  );
}
