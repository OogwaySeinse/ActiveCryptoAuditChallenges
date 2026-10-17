import type { Challenge, ChallengeType } from "../types";
import { TYPE_META, formatUSD, msUntil } from "./format";

export type Experience = "newcomer" | "intermediate" | "senior";
export type Goal = "earn" | "learn" | "reputation" | "build";

export interface Profile {
  prompt: string;
  experience: Experience;
  languages: string[];
  goal: Goal;
  types: ChallengeType[];
  hoursPerWeek: number;
}

export interface PlanStep {
  week: string;
  focus: string;
  deliverable: string;
}

export interface Recommendation {
  id: string;
  match_score: number;
  headline: string;
  fit_reasons: string[];
  watch_outs: string;
  weekly_plan: PlanStep[];
}

export interface RecommendationResult {
  summary: string;
  recommendations: Recommendation[];
  source: "local-ranker" | "gemini-worker";
  model?: string;
}

export const DEFAULT_PROFILE: Profile = {
  prompt: "",
  experience: "intermediate",
  languages: ["Solidity"],
  goal: "earn",
  types: ["audit_contest", "bug_bounty"],
  hoursPerWeek: 10,
};

export const ARCHETYPES: { id: string; label: string; profile: Profile }[] = [
  {
    id: "solidity-warden",
    label: "⛨ Solidity Warden",
    profile: {
      prompt: "Experienced Solidity auditor looking for well-funded DeFi audit contests (lending, AMMs, vaults) where I can place on the leaderboard.",
      experience: "senior",
      languages: ["Solidity"],
      goal: "reputation",
      types: ["audit_contest"],
      hoursPerWeek: 20,
    },
  },
  {
    id: "rust-hunter",
    label: "🦀 Rust / Solana Hunter",
    profile: {
      prompt: "Rust developer moving into Solana/Cosmos security. Want bounties or contests on Rust codebases with big critical payouts.",
      experience: "intermediate",
      languages: ["Rust"],
      goal: "earn",
      types: ["bug_bounty", "audit_contest"],
      hoursPerWeek: 12,
    },
  },
  {
    id: "first-finding",
    label: "🌱 First Valid Finding",
    profile: {
      prompt: "New to smart contract security, finished Ethernaut. Looking for beginner-friendly contests and practice to land my first valid finding.",
      experience: "newcomer",
      languages: ["Solidity"],
      goal: "learn",
      types: ["audit_contest", "practice", "ctf"],
      hoursPerWeek: 6,
    },
  },
  {
    id: "crypto-ctf",
    label: "⚑ Crypto CTF Player",
    profile: {
      prompt: "I enjoy cryptography CTF challenges — RSA, elliptic curves, lattices — and blockchain pwn. Weekend CTFs preferred.",
      experience: "intermediate",
      languages: ["Python", "Solidity"],
      goal: "learn",
      types: ["ctf", "practice"],
      hoursPerWeek: 8,
    },
  },
  {
    id: "builder",
    label: "⌁ Web3 Builder",
    profile: {
      prompt: "Full-stack dev who wants to ship a dApp at a hackathon with sponsor prizes; interested in DeFi, AI agents and account abstraction.",
      experience: "intermediate",
      languages: ["Solidity", "TypeScript"],
      goal: "build",
      types: ["hackathon"],
      hoursPerWeek: 15,
    },
  },
];

const DIFFICULTY_FIT: Record<Experience, Record<string, number>> = {
  newcomer: { Beginner: 22, Intermediate: 6, Advanced: -12, Expert: -28 },
  intermediate: { Beginner: 4, Intermediate: 18, Advanced: 10, Expert: -6 },
  senior: { Beginner: -10, Intermediate: 4, Advanced: 16, Expert: 20 },
};

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have i in into is it its looking me my of on or so that the this to want where which with would like".split(" "),
);

function tokens(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9+#.-]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)))];
}

function hoursAvailable(c: Challenge, now: number, hoursPerWeek: number): number | null {
  const ms = msUntil(c, now);
  if (ms === null || c.status === "upcoming") return null;
  return (Math.max(0, ms) / (7 * 86400_000)) * hoursPerWeek;
}

function score(c: Challenge, p: Profile, now: number) {
  let s = 40;
  const reasons: string[] = [];
  const watch: string[] = [];

  const langOverlap = c.languages.filter((l) => p.languages.includes(l));
  if (langOverlap.length) {
    s += 26;
    reasons.push(`Codebase in ${langOverlap.join(" / ")} — squarely in your stack.`);
  } else if (c.languages.length && p.languages.length) {
    s -= 14;
    watch.push(`Requires ${c.languages.join("/")}, outside your listed languages.`);
  }

  if (p.types.includes(c.challenge_type)) s += 16;

  const diff = DIFFICULTY_FIT[p.experience][c.difficulty] ?? 0;
  s += diff;
  if (diff >= 15) reasons.push(`${c.difficulty} tier matches your ${p.experience} experience level.`);
  if (diff <= -12) watch.push(`${c.difficulty}-tier scope may be a steep ramp for a ${p.experience}.`);

  const prize = c.prize_usd || 0;
  if (p.goal === "earn") {
    const bump = prize > 0 ? Math.min(26, Math.log10(prize) * 4.2) : -6;
    s += bump;
    if (prize >= 25_000) reasons.push(`${c.challenge_type === "bug_bounty" ? "Max payout" : "Prize pool"} of ${formatUSD(prize)} rewards a strong finding.`);
  } else if (p.goal === "learn") {
    if (c.challenge_type === "practice" || c.difficulty === "Beginner") {
      s += 20;
      reasons.push("Low-stakes, beginner-accessible format — ideal for building audit intuition.");
    }
    if (c.challenge_type === "ctf") s += 8;
  } else if (p.goal === "reputation") {
    if (c.challenge_type === "audit_contest") {
      s += 20;
      reasons.push("Ranked contest with a public leaderboard — findings build a verifiable track record.");
    }
    if (c.challenge_type === "ctf") s += 8;
  } else if (p.goal === "build") {
    if (c.challenge_type === "hackathon") {
      s += 34;
      reasons.push("Hackathon format: ship something, compete for sponsor tracks, meet teams.");
    } else s -= 10;
  }

  const hrs = hoursAvailable(c, now, p.hoursPerWeek);
  if (hrs !== null) {
    if (hrs < 6) {
      s -= 16;
      watch.push(`Only ~${Math.max(1, Math.round(hrs))}h of your time budget before it closes.`);
    } else if (hrs >= 12) {
      s += 6;
      reasons.push(`~${Math.round(hrs)}h of review time at ${p.hoursPerWeek}h/week before the deadline.`);
    }
  }
  if (c.status === "upcoming") {
    s += 5;
    reasons.push("Opens soon — time to pre-read docs and set up tooling before the clock starts.");
  }
  if (c.status === "ongoing" && c.challenge_type === "bug_bounty") reasons.push("Always-on program: hunt at your own pace with no deadline.");

  const promptTokens = tokens(p.prompt);
  if (promptTokens.length) {
    const hay = [c.title, c.description, c.category, c.ecosystem, c.organizer, ...c.tags, ...c.languages].join(" ").toLowerCase();
    const hits = promptTokens.filter((t) => hay.includes(t));
    if (hits.length) {
      s += Math.min(24, hits.length * 6);
      reasons.push(`Matches your brief on: ${hits.slice(0, 4).join(", ")}.`);
    }
  }

  if (c.kyc_required) watch.push("KYC required to receive rewards.");
  if (c.is_new) s += 3;

  if (!reasons.length) reasons.push(`${TYPE_META[c.challenge_type].label} on ${c.platform} in ${c.category}.`);
  return { s, reasons: reasons.slice(0, 3), watch };
}

function phaseHours(p: Profile, c: Challenge, now: number, phases: number): string[] {
  const hrs = hoursAvailable(c, now, p.hoursPerWeek);
  const total = hrs === null ? p.hoursPerWeek * phases : Math.max(phases, Math.round(hrs));
  const per = Math.max(1, Math.round(total / phases));
  const ms = msUntil(c, now);
  const days = ms && c.status !== "upcoming" ? Math.max(1, Math.floor(ms / 86400_000)) : null;
  return Array.from({ length: phases }, (_, i) => {
    if (days !== null && days < 21) {
      const a = Math.floor((i * days) / phases) + 1;
      const b = Math.max(a, Math.floor(((i + 1) * days) / phases));
      return `Day ${a}${b > a ? `–${b}` : ""} (~${per}h)`;
    }
    return `Week ${i + 1} (~${Math.min(per, p.hoursPerWeek)}h)`;
  });
}

const PLAN_TEMPLATES: Record<ChallengeType, { focus: string; deliverable: string }[]> = {
  audit_contest: [
    { focus: "Recon & scoping: read docs, map contracts, run the test suite", deliverable: "Architecture sketch + list of external entry points and trust assumptions" },
    { focus: "Threat modelling: invariants, privileged roles, value flows, oracle/price dependencies", deliverable: "Invariant list + attack-surface checklist per contract" },
    { focus: "Deep manual review + targeted fuzzing (Foundry/Echidna/Medusa)", deliverable: "Proof-of-concept tests for every candidate High/Medium" },
    { focus: "Write-up & triage: severity justification, deduplicate, submit early", deliverable: "Polished reports with PoCs submitted before the deadline" },
  ],
  bug_bounty: [
    { focus: "Scope & impacts: in-scope assets, severity table, excluded issues", deliverable: "Asset map with deployed addresses and upgrade history" },
    { focus: "Diff hunting: recent upgrades, new integrations, governance changes", deliverable: "Shortlist of changed code paths with high blast radius" },
    { focus: "Exploit development on a mainnet fork", deliverable: "Working fork PoC quantifying funds at risk" },
    { focus: "Responsible disclosure report", deliverable: "Clear report with impact, PoC and fix suggestion" },
  ],
  ctf: [
    { focus: "Team & tooling: pwntools, SageMath, Foundry/anvil, z3", deliverable: "Shared notes doc + ready-to-go solver templates" },
    { focus: "Warm-ups and category triage once the CTF opens", deliverable: "First flags captured; hard challenges assigned" },
    { focus: "Main push on crypto / blockchain challenges", deliverable: "Exploit scripts for the highest-value challenges" },
    { focus: "Write-ups", deliverable: "Published write-ups to cement learning and reputation" },
  ],
  hackathon: [
    { focus: "Ideation: browse sponsor tracks, form a team, pick a narrow problem", deliverable: "One-page spec targeting 1–2 sponsor bounties" },
    { focus: "Build the MVP: contracts + minimal frontend", deliverable: "End-to-end demo on a testnet" },
    { focus: "Polish, security pass, and sponsor integrations", deliverable: "Deployed app with README and architecture diagram" },
    { focus: "Pitch & submission", deliverable: "2-minute demo video and submission before cutoff" },
  ],
  practice: [
    { focus: "Foundations: complete the first levels without hints", deliverable: "Notes on each vulnerability class encountered" },
    { focus: "Intermediate levels with Foundry PoCs", deliverable: "A repo of exploit tests you can reuse" },
    { focus: "Hard levels + read public write-ups after solving", deliverable: "Personal checklist of bug patterns" },
    { focus: "Graduate: join a beginner-friendly live contest", deliverable: "First contest submission" },
  ],
};

function buildPlan(c: Challenge, p: Profile, now: number): PlanStep[] {
  const tpl = PLAN_TEMPLATES[c.challenge_type];
  const labels = phaseHours(p, c, now, tpl.length);
  return tpl.map((t, i) => ({ week: labels[i], ...t }));
}

export function candidatePool(all: Challenge[], p: Profile): Challenge[] {
  const allowPractice = p.experience === "newcomer" || p.goal === "learn" || p.types.includes("practice");
  return all.filter((c) => allowPractice || c.challenge_type !== "practice");
}

export function rankLocally(all: Challenge[], p: Profile, now: number, topN = 4): RecommendationResult {
  const scored = candidatePool(all, p)
    .map((c) => ({ c, ...score(c, p, now) }))
    .sort((a, b) => b.s - a.s);

  // Diversity: avoid four near-identical picks from the same platform+type
  const picks: typeof scored = [];
  const seen = new Map<string, number>();
  for (const item of scored) {
    const key = `${item.c.platform}|${item.c.challenge_type}`;
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    picks.push(item);
    if (picks.length >= topN) break;
  }

  const top = picks[0]?.s ?? 1;
  const recommendations = picks.map(({ c, s, reasons, watch }) => ({
    id: c.id,
    match_score: Math.max(55, Math.min(98, Math.round(70 + ((s - top * 0.5) / (top || 1)) * 28))),
    headline: `${TYPE_META[c.challenge_type].label} · ${c.category}`,
    fit_reasons: reasons,
    watch_outs: watch[0] ?? "Read the scope and known-issues list carefully before investing time.",
    weekly_plan: buildPlan(c, p, now),
  }));

  const types = [...new Set(picks.map((x) => TYPE_META[x.c.challenge_type].label.toLowerCase()))].join(", ");
  return {
    summary: picks.length
      ? `Ranked ${scored.length} live opportunities against your ${p.languages.join("/") || "any-language"} stack, ${p.experience} level and ${p.hoursPerWeek}h/week budget. Best fits right now are ${types}.`
      : "No candidates matched — try widening the challenge types or languages.",
    recommendations,
    source: "local-ranker",
  };
}

const WORKER_KEY = "wunderaudit_worker_url";
const PROFILE_KEY = "wunderaudit_profile_v1";

export function getWorkerUrl(): string {
  return (localStorage.getItem(WORKER_KEY) || (import.meta.env.VITE_RECOMMENDER_URL as string | undefined) || "").trim();
}

export function setWorkerUrl(url: string) {
  if (url.trim()) localStorage.setItem(WORKER_KEY, url.trim());
  else localStorage.removeItem(WORKER_KEY);
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Ask the optional Gemini Cloudflare Worker; falls back to the local ranker on any failure. */
export async function recommend(all: Challenge[], p: Profile, now: number): Promise<RecommendationResult & { fallbackReason?: string }> {
  const local = rankLocally(all, p, now);
  const url = getWorkerUrl();
  if (!url) return local;

  // Send a pre-ranked shortlist so the LLM reasons over the most relevant ~30 candidates
  const shortlist = candidatePool(all, p)
    .map((c) => ({ c, s: score(c, p, now).s }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 30)
    .map(({ c }) => ({
      id: c.id,
      name: c.title,
      platform: c.platform,
      type: c.challenge_type,
      category: c.category,
      ecosystem: c.ecosystem,
      languages: c.languages,
      difficulty: c.difficulty,
      prize_usd: c.prize_usd,
      prize_label: c.prize,
      status: c.status,
      end_date: c.end_date,
      days_left: (() => {
        const ms = msUntil(c, now);
        return ms === null ? null : Math.round(ms / 86400_000);
      })(),
      kyc_required: c.kyc_required,
      tags: c.tags.slice(0, 8),
      description: c.description.slice(0, 260),
    }));

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: p, candidates: shortlist }),
    });
    const data = (await res.json()) as RecommendationResult & { error?: string };
    if (!res.ok || !Array.isArray(data.recommendations)) throw new Error(data.error || `HTTP ${res.status}`);
    const ids = new Set(all.map((c) => c.id));
    const recs = data.recommendations.filter((r) => ids.has(r.id));
    if (!recs.length) throw new Error("Worker returned no valid ids");
    return { ...data, recommendations: recs, source: "gemini-worker" };
  } catch (err) {
    return { ...local, fallbackReason: err instanceof Error ? err.message : String(err) };
  }
}

