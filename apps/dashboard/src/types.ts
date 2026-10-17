export type ChallengeStatus = "active" | "ending_soon" | "upcoming" | "ongoing";

export type ChallengeType = "audit_contest" | "bug_bounty" | "ctf" | "hackathon" | "practice";

export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export interface Challenge {
  id: string;
  title: string;
  platform: string;
  source: string;
  url: string;
  prize: string;
  prize_usd: number;
  prize_currency: string;
  prize_raw: string;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
  status: ChallengeStatus;
  challenge_type: ChallengeType;
  category: string;
  ecosystem: string;
  languages: string[];
  tags: string[];
  description: string;
  organizer: string;
  difficulty: Difficulty;
  kyc_required: boolean | null;
  participants_count: number | null;
  findings_count: number | null;
  repo_url: string | null;
  logo_url: string | null;
  first_seen_at: string | null;
  is_new: boolean;
  prize_delta_usd: number;
  days_shift: number;
  scraped_at: string;
}

export interface SourceStatusItem {
  name: string;
  status: "ok" | "cached" | "degraded" | "error";
  count: number;
  duration_ms: number;
  error: string | null;
  updated_at: string;
}

export interface TrendPoint {
  date: string;
  total_active: number;
  by_type?: Record<string, number>;
  contest_prize_usd?: number;
  new_count?: number;
}

export interface Metadata {
  generated_at: string;
  total_active: number;
  contest_prize_usd: number;
  max_bounty_usd: number;
  bounty_pool_usd: number;
  ending_soon_count: number;
  platforms_count: number;
  by_type: Record<string, number>;
  platforms: Record<string, number>;
  categories: Record<string, number>;
  ecosystems: Record<string, number>;
  history?: {
    new_challenges: number;
    prize_changes: number;
    deadline_changes: number;
    tracked_total: number;
  };
  trend?: TrendPoint[];
  sources: SourceStatusItem[];
}

export interface Payload {
  metadata: Metadata;
  challenges: Challenge[];
}

/** Segmented "view" control: which challenge types are in scope. */
export type View = "live" | "audit_contest" | "bug_bounty" | "ctf" | "hackathon" | "practice" | "all";

export type QuickPreset = "none" | "ending_soon" | "high_prize" | "new" | "beginner" | "saved";

export interface Filters {
  view: View;
  preset: QuickPreset;
  search: string;
  platforms: string[];
  categories: string[];
  ecosystems: string[];
  languages: string[];
  statuses: ChallengeStatus[];
  difficulties: Difficulty[];
  minPrizeUsd: number;
}

export const DEFAULT_FILTERS: Filters = {
  view: "live",
  preset: "none",
  search: "",
  platforms: [],
  categories: [],
  ecosystems: [],
  languages: [],
  statuses: [],
  difficulties: [],
  minPrizeUsd: 0,
};

