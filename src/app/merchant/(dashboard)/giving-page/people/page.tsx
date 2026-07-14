import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import PeopleManager from "@/components/merchant/PeopleManager";

export default async function PeopleDirectoryPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  const people = await prisma.organizationPerson.findMany({
    where: { churchId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Giving Page Directory</h2>
      </div>
      <p className="text-sm text-slate-500 max-w-3xl">
        Manage the people who can receive designated donations on your Person Giving Pages.
        You can attach these people to any Person Giving Page, and donors will be able to select them when making a gift.
      </p>

      <PeopleManager initialPeople={people} />
    </div>
  );
}
