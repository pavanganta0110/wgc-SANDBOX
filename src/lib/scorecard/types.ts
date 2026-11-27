/** One person's scorecard record, as the app reads and writes it (the id is the database row id). */
export interface Contact {
  id: string;
  created_at: number;
  sent: Record<string, number>;
  name?: string;
  email: string;
  org?: string;
  role?: string;
  phone?: string;
  invited_as?: string;
  group_code?: string;
  data_consent?: string;
  answers?: Record<string, string>;
  scores?: Record<string, unknown>;
  pitch?: string;
  fundraising_score?: string | number;
  pitch_score?: string | number;
  unsure_areas?: string;
  last_scored_at?: number;
  unsubscribed_at?: number;
  /** When the instant results email was last sent, so one address is not emailed again within a day. */
  results_sent_at?: number;
  purchase?: Purchase;
}

export interface Purchase {
  started_at: number;
  transfer_id: string;
  status: "checking" | "pending" | "sending" | "sent" | "failed";
  reason?: string;
  notified?: boolean;
  verified?: string;
  sent_at?: number;
}
