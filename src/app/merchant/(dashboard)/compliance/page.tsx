import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reconcileComplianceFormsForChurch, resolveComplianceStatus } from "@/lib/finix/sync/complianceForms";
import ComplianceAttestationForm from "@/components/merchant/ComplianceAttestationForm";

export default async function CompliancePage() {
  const session = await getSession();
  if (!session?.churchId) return null;

  await reconcileComplianceFormsForChurch(session.churchId);
  const form = await prisma.complianceForm.findFirst({
    where: { churchId: session.churchId },
    orderBy: { createdAt: "desc" },
  });
  const status = resolveComplianceStatus(form ? { state: form.state, dueAt: form.dueAt } : null);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 mb-1">PCI Compliance</h1>
      <p className="text-sm text-slate-500 mb-6">
        As a condition of processing card payments, you must attest to a PCI Self-Assessment Questionnaire (SAQ)
        within 90 days of onboarding and annually thereafter.
      </p>
      <ComplianceAttestationForm
        form={
          form
            ? {
                id: form.id,
                type: form.type,
                state: form.state,
                dueAt: form.dueAt ? form.dueAt.toISOString() : null,
                validUntil: form.validUntil ? form.validUntil.toISOString() : null,
                unsignedFileId: form.unsignedFileId,
                signedFileId: form.signedFileId,
                signeeName: form.signeeName,
                signeeTitle: form.signeeTitle,
                signedAt: form.signedAt ? form.signedAt.toISOString() : null,
              }
            : null
        }
        status={status}
      />
    </div>
  );
}
