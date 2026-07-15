import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import ContactsPanel from "@/components/merchant/ContactsPanel";

export default async function OrganizationContactsPage() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  const contacts = await prisma.organizationContact.findMany({ where: { churchId: session!.churchId! }, orderBy: { createdAt: "asc" } });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Contacts</h3>
      <p className="text-xs text-slate-500 mb-6">People WGC Support can reach out to for specific matters.</p>
      <ContactsPanel
        initialContacts={contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone, isPrimary: c.isPrimary }))}
        canManage={permissions.canManageContacts}
      />
    </div>
  );
}
