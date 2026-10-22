import { prisma } from "@/lib/prisma";
import { loadPdfImage, type PdfImage } from "@/lib/pdf/pdfImage";

/** What a church-branded export shows at the top: the organization, never WGC. */
export interface OrganizationBranding {
  name: string;
  /** PNG/JPEG bytes ready for @react-pdf's <Image>, or null (no logo / unsupported format / fetch failed). */
  logo: PdfImage | null;
  address: string | null;
  contact: string | null;
}

export async function loadOrganizationBranding(churchId: string): Promise<OrganizationBranding | null> {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: {
      name: true,
      statementSenderName: true,
      logoUrl: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      supportEmail: true,
      primaryContactEmail: true,
      website: true,
    },
  });
  if (!church) return null;
  const cityLine = [[church.city, church.state].filter(Boolean).join(", "), church.postalCode].filter(Boolean).join(" ");
  const address = [church.addressLine1, church.addressLine2, cityLine].filter(Boolean).join(", ") || null;
  const contact = [church.supportEmail || church.primaryContactEmail, church.phone, church.website].filter(Boolean).join(" · ") || null;
  return {
    name: church.statementSenderName || church.name,
    logo: await loadPdfImage(church.logoUrl),
    address,
    contact,
  };
}
