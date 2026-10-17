import type { Challenge, Metadata } from "../types";
import { formatUSD, msUntil } from "../lib/format";

interface Props {
  rows: Challenge[];
  all: Challenge[];
  meta: Metadata;
  now: number;
}

/** Segmented tick bar used for telemetry cards (shared WUNDER* motif). */
function TickBar({ ratio, color }: { ratio: number; color: string }) {
  const ticks = 28;
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * ticks);
  return (
    <div className="mt-3 flex h-3 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className="w-full rounded-[1px]"
          style={{
            height: i < filled ? "100%" : "45%",
            backgroundColor: i < filled ? color : "rgba(250,246,232,0.12)",
          }}
        />
      ))}
    </div>
  );
}

export function StatCards({ rows, all, meta, now }: Props) {
  const timeboxed = rows.filter((c) => c.challenge_type !== "bug_bounty" && c.challenge_type !== "practice");
  const contestPool = timeboxed.reduce((s, c) => s + (c.prize_usd || 0), 0);
  const closing48h = rows.filter((c) => {
    const ms = msUntil(c, now);
    return c.status !== "upcoming" && ms !== null && ms > 0 && ms <= 48 * 3600_000;
  }).length;
  const closing7d = rows.filter((c) => {
    const ms = msUntil(c, now);
    return c.status !== "upcoming" && ms !== null && ms > 0 && ms <= 7 * 86400_000;
  }).length;
  const upcoming = rows.filter((c) => c.status === "upcoming").length;
  const bounties = all.filter((c) => c.challenge_type === "bug_bounty");
  const topBounty = bounties.reduce<Challenge | null>((best, c) => (!best || c.prize_usd > best.prize_usd ? c : best), null);
  const okSources = meta.sources.filter((s) => s.status === "ok" || s.status === "cached").length;

  const cards = [
    {
      label: "In View",
      value: rows.length.toLocaleString("en-US"),
      sub: `${timeboxed.length} time-boxed · ${upcoming} upcoming`,
      ratio: all.length ? rows.length / all.length : 0,
      color: "#f5b544",
    },
    {
      label: "Contest Prize Pools",
      value: formatUSD(contestPool),
      sub: `Audits + CTFs + hackathons in view`,
      ratio: meta.contest_prize_usd ? contestPool / meta.contest_prize_usd : 0,
      color: "#5eead4",
    },
    {
      label: "Closing ≤ 7 Days",
      value: closing7d.toLocaleString("en-US"),
      sub: closing48h ? `${closing48h} closing within 48h ⚠` : "No 48h cliffs right now",
      ratio: rows.length ? closing7d / Math.max(1, timeboxed.length) : 0,
      color: "#fbbf24",
    },
    {
      label: "Largest Bug Bounty",
      value: formatUSD(meta.max_bounty_usd),
      sub: topBounty ? `${topBounty.organizer || topBounty.title} · ${bounties.length} live programs` : "—",
      ratio: 1,
      color: "#a78bfa",
    },
    {
      label: "Feeds Online",
      value: `${okSources}/${meta.sources.length}`,
      sub: `${meta.platforms_count} venues indexed daily`,
      ratio: meta.sources.length ? okSources / meta.sources.length : 0,
      color: "#34d399",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((card, i) => (
        <div key={card.label} className="wunder-glass rounded-2xl border border-white/10 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#faf6e8]/45">
            0{i + 1} // {card.label}
          </div>
          <div className="mt-1.5 font-display text-3xl tracking-tight text-[#faf6e8] tabular-nums sm:text-4xl">{card.value}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[#faf6e8]/55" title={card.sub}>
            {card.sub}
          </div>
          <TickBar ratio={card.ratio} color={card.color} />
        </div>
      ))}
    </div>
  );
}

