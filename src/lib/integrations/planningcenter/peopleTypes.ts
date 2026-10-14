/** Client-safe shapes for the people-linking panel. */

export interface PeopleCandidate {
  pcoPersonId: string;
  name: string;
  emails: string[];
  phones: string[];
  alreadyLinkedDonorId?: string;
}

export interface PeopleReviewItem {
  donorId: string;
  donorName: string | null;
  donorEmail: string | null;
  donorPhone: string | null;
  candidates: PeopleCandidate[];
}

export interface PeopleJobSummary {
  id: string;
  type: "MATCH_DONORS" | "IMPORT_PEOPLE";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number | null;
  processedCount: number;
  linkedCount: number;
  reviewCount: number;
  noMatchCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  lastError: string | null;
}

export interface PeopleOverview {
  counts: { linked: number; needsReview: number; noMatch: number };
  review: PeopleReviewItem[];
  matchJob: PeopleJobSummary | null;
  importJob: PeopleJobSummary | null;
}
