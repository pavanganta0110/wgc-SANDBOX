import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import PersonGivingReportClient from "@/components/merchant/reports/PersonGivingReportClient";

export default async function PersonGivingReportPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  // Fetch all people for this church
  const people = await prisma.organizationPerson.findMany({
    where: { churchId },
    orderBy: { displayName: "asc" },
  });

  // Fetch successful designated payments
  const payments = await prisma.payment.findMany({
    where: {
      churchId,
      designationType: "PERSON",
      selectedPersonId: { not: null },
      status: "SUCCEEDED",
    },
    include: {
      donor: true,
      givingPage: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Person Giving Report</h2>
      </div>
      <p className="text-sm text-slate-500 max-w-3xl">
        View giving designated to specific people on your Person Giving Pages.
      </p>

      <PersonGivingReportClient people={people} payments={payments} />
    </div>
  );
}
