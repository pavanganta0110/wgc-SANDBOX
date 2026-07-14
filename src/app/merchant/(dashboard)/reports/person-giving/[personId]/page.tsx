import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PersonGivingDetailClient from "@/components/merchant/reports/PersonGivingDetailClient";

export default async function PersonGivingDetailReportPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const session = await getSession();
  const churchId = session!.churchId!;

  const person = await prisma.organizationPerson.findUnique({
    where: { id: personId },
  });

  if (!person || person.churchId !== churchId) {
    notFound();
  }

  const payments = await prisma.payment.findMany({
    where: {
      churchId,
      designationType: "PERSON",
      selectedPersonId: personId,
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
      <div className="flex items-center gap-4">
        {person.profileImageUrl && (
          <img src={person.profileImageUrl} alt={person.displayName} className="w-16 h-16 rounded-full object-cover shadow-sm" />
        )}
        <div>
          <h2 className="text-xl font-bold text-slate-900">{person.displayName}</h2>
          <p className="text-sm text-slate-500">
            {person.title || "No Title"} {person.ministryOrDepartment && `• ${person.ministryOrDepartment}`}
          </p>
        </div>
      </div>

      <PersonGivingDetailClient person={person} payments={payments} />
    </div>
  );
}
