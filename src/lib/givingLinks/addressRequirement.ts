import type { DonorFieldSettings } from "./types";

export interface LinkAddressSettings {
  collectMailingAddress: boolean;
  donorFieldSettings: DonorFieldSettings;
}

/**
 * The address settings a giving page actually uses once the organization-wide
 * rule is applied. With Church.requireDonorAddress on, every link collects a
 * mailing address and requires it, whatever the link itself says — so one staff
 * member can't create a page that leaves the organization unable to mail a
 * year-end statement. `street` is the single field that drives the whole
 * address block (see GivingLinkForm), so it is the one forced to REQUIRED.
 * With the rule off, the link's own settings pass through untouched.
 */
export function applyOrgAddressRequirement(requireDonorAddress: boolean | null | undefined, link: LinkAddressSettings): LinkAddressSettings {
  if (!requireDonorAddress) return link;
  return {
    collectMailingAddress: true,
    donorFieldSettings: { ...link.donorFieldSettings, street: "REQUIRED" },
  };
}
