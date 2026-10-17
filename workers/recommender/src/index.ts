/**
 * Cloudflare Worker: WUNDERAUDIT Auditor Matchmaker proxy
 *
 * Keeps GEMINI_API_KEY in Cloudflare secrets, applies per-IP sliding-window rate
 * limiting, and asks Gemini (Interactions API) to pick the best live crypto
 * security challenges for a user profile, returning structured JSON.
 * Mirrors the worker used by ActiveMLCompetitions / ActiveQuantCompetitions.
 */

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
}

interface Profile {
  prompt: string;
  experience: "newcomer" | "intermediate" | "senior";
  languages: string[];
  goal: "earn" | "learn" | "reputation" | "build";
  types: string[];
  hoursPerWeek: number;
}

interface Candidate {
  id: string;
  name: string;
  platform: string;
  type: string;
  category: string;
  ecosystem: string;
  languages: string[];
  difficulty: string;
  prize_usd: number;
  prize_label: string;
  status: string;
  end_date: string | null;
  days_left: number | null;
  kyc_required: boolean | null;
  tags: string[];
  description: string;
}

const DEFAULT_MODEL = "gemini-3.8-flash";
const ipBuckets = new Map<string, number[]>();

function rateLimit(ip: string, max: number, windowSec: number) {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const hits = (ipBuckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    ipBuckets.set(ip, hits);
    return { allowed: false, remaining: 0, reset: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  ipBuckets.set(ip, hits);
  if (ipBuckets.size > 2000) {
    for (const [k, v] of ipBuckets) if (!v.some((t) => now - t < windowMs)) ipBuckets.delete(k);
  }
  return { allowed: true, remaining: max - hits.length, reset: windowSec };
}

function cors(origin: string | null, allowed = "*"): Record<string, string> {
  const list = allowed.split(",").map((s) => s.trim());
  const value = allowed === "*" ? "*" : list.includes(origin ?? "") ? (origin as string) : list[0];
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two-sentence strategy addressed to the user." },
    recommendations: {
      type: "array",
      description: "Top 3-4 challenges ordered by fit.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Exact id from the candidates list." },
          match_score: { type: "integer", description: "65-99 fit score." },
          headline: { type: "string", description: "5-10 word tagline." },
          fit_reasons: { type: "array", items: { type: "string" }, description: "3 specific reasons tied to the profile." },
          watch_outs: { type: "string", description: "One honest caveat (KYC, scope size, deadline, language)." },
          weekly_plan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                week: { type: "string" },
                focus: { type: "string" },
                deliverable: { type: "string" },
              },
              required: ["week", "focus", "deliverable"],
            },
          },
        },
        required: ["id", "match_score", "headline", "fit_reasons", "watch_outs", "weekly_plan"],
      },
    },
  },
  required: ["summary", "recommendations"],
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = cors(request.headers.get("Origin"), env.ALLOWED_ORIGIN ?? "*");
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (request.method === "GET") {
      return Response.json({ ok: true, service: "wunderaudit-recommender", model, configured: Boolean(env.GEMINI_API_KEY) }, { headers });
    }
    if (request.method !== "POST" || url.pathname !== "/recommend") {
      return Response.json({ error: "POST /recommend with { profile, candidates }" }, { status: 404, headers });
    }
    if (!env.GEMINI_API_KEY) {
      return Response.json({ error: "GEMINI_API_KEY not configured (npx wrangler secret put GEMINI_API_KEY)" }, { status: 503, headers });
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "anonymous";
    const max = Number.parseInt(env.RATE_LIMIT_MAX_REQUESTS ?? "12", 10) || 12;
    const win = Number.parseInt(env.RATE_LIMIT_WINDOW_SECONDS ?? "600", 10) || 600;
    const rl = rateLimit(ip, max, win);
    const rlHeaders = { ...headers, "X-RateLimit-Limit": String(max), "X-RateLimit-Remaining": String(rl.remaining), "X-RateLimit-Reset": String(rl.reset) };
    if (!rl.allowed) return Response.json({ error: `Rate limit exceeded; retry in ${rl.reset}s` }, { status: 429, headers: rlHeaders });

    let body: { profile?: Profile; candidates?: Candidate[] };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: rlHeaders });
    }
    if (!body.profile || !Array.isArray(body.candidates) || body.candidates.length === 0) {
      return Response.json({ error: "Body must include profile and non-empty candidates" }, { status: 400, headers: rlHeaders });
    }

    const candidates = body.candidates.slice(0, 40).map((c) => ({
      ...c,
      name: String(c.name).slice(0, 160),
      description: String(c.description ?? "").slice(0, 260),
      tags: (c.tags ?? []).slice(0, 8),
    }));

    const system = [
      "You are a top-ranked smart contract security researcher and competitive auditor (Code4rena, Sherlock, Cantina, Immunefi).",
      "Pick the 4 best live opportunities for the user from `candidates`.",
      "Rules:",
      "1. Only use ids that appear verbatim in `candidates`.",
      "2. Tie fit_reasons to the user's languages, experience, goal, preferred types, hours/week and free-text brief.",
      "3. Respect time: days_left × hoursPerWeek/7 is their realistic review budget; flag anything too tight.",
      "4. weekly_plan: 3-4 phases specific to the challenge type (audits: scoping → invariants/threat model → manual review + fuzzing PoCs → write-ups; bounties: scope → diff recent upgrades → fork PoC → report; CTFs; hackathons).",
      "5. Mention concrete tooling (Foundry, Echidna/Medusa, Slither, Halmos, anchor test, sage, pwntools) where relevant.",
    ].join("\n");

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model,
        system_instruction: system,
        input: JSON.stringify({ user_profile: body.profile, candidates }),
        store: false,
        generation_config: { temperature: 0.35, thinking_level: "low" },
        response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
      }),
    });
    if (!res.ok) {
      return Response.json({ error: `Gemini API error (HTTP ${res.status})`, details: (await res.text()).slice(0, 400) }, { status: 502, headers: rlHeaders });
    }
    const interaction = (await res.json()) as { outputs?: { type: string; text?: string }[] };
    const text = interaction.outputs?.find((o) => o.type === "text")?.text;
    if (!text) return Response.json({ error: "Empty model output" }, { status: 502, headers: rlHeaders });
    try {
      const parsed = JSON.parse(text);
      return Response.json({ ...parsed, model, source: "gemini-worker" }, { headers: rlHeaders });
    } catch {
      return Response.json({ error: "Model output was not valid JSON", raw: text.slice(0, 300) }, { status: 502, headers: rlHeaders });
    }
  },
};

