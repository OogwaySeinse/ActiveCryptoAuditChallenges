import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Challenge, TrendPoint } from "../types";
import { formatUSD, platformColor, TYPE_META } from "../lib/format";

interface Props {
  rows: Challenge[];
  trend: TrendPoint[];
  now: number;
}

const PALETTE = ["#f5b544", "#5eead4", "#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fb923c", "#e879f9", "#facc15", "#94a3b8"];

const tooltipStyle = {
  backgroundColor: "#141218",
  border: "1px solid rgba(250,246,232,0.15)",
  borderRadius: 10,
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
  color: "#faf6e8",
};

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="wunder-glass rounded-2xl border border-white/10 p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-amber-200/80">{title}</div>
      <div className="mb-3 font-mono text-[11px] text-[#faf6e8]/45">{subtitle}</div>
      <div className="h-60">{children}</div>
    </div>
  );
}

export function Charts({ rows, trend, now }: Props) {
  const byPlatform = useMemo(() => {
    const m = new Map<string, { count: number; pool: number }>();
    rows.forEach((c) => {
      const v = m.get(c.platform) ?? { count: 0, pool: 0 };
      v.count += 1;
      v.pool += c.prize_usd || 0;
      m.set(c.platform, v);
    });
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [rows]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((c) => m.set(c.category, (m.get(c.category) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [rows]);

  const byEcosystem = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((c) => m.set(c.ecosystem, (m.get(c.ecosystem) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [rows]);

  // Deadline calendar: time-boxed challenges closing in each of the next 8 weeks, stacked by type
  const deadlineWeeks = useMemo(() => {
    const weeks = Array.from({ length: 8 }, (_, i) => ({
      week: i === 0 ? "This wk" : `+${i}w`,
      audit_contest: 0,
      ctf: 0,
      hackathon: 0,
      bug_bounty: 0,
    }));
    rows.forEach((c) => {
      if (!c.end_date || c.challenge_type === "practice") return;
      const diff = Date.parse(c.end_date) - now;
      if (diff < 0) return;
      const idx = Math.floor(diff / (7 * 86400_000));
      const t = c.challenge_type as "audit_contest" | "ctf" | "hackathon" | "bug_bounty";
      if (idx < 8) weeks[idx][t] += 1;
    });
    return weeks;
  }, [rows, now]);

  const trendData = useMemo(
    () =>
      trend.map((t) => ({
        date: t.date.slice(5),
        contests: (t.by_type?.audit_contest ?? 0) + (t.by_type?.ctf ?? 0) + (t.by_type?.hackathon ?? 0),
        bounties: t.by_type?.bug_bounty ?? 0,
        pool: t.contest_prize_usd ?? 0,
      })),
    [trend],
  );

  if (rows.length === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="// Venues" subtitle="Challenges in view by platform">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byPlatform} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#faf6e8b3", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(250,246,232,0.05)" }}
              contentStyle={tooltipStyle}
              formatter={(v: number, k: string) => (k === "pool" ? formatUSD(v) : v)}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {byPlatform.map((d) => (
                <Cell key={d.name} fill={platformColor(d.name)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="// Deadline Calendar" subtitle="Time-boxed challenges closing per week (next 8 weeks)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={deadlineWeeks} margin={{ left: -18, right: 8 }}>
            <CartesianGrid stroke="rgba(250,246,232,0.06)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: "#faf6e8b3", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#faf6e899", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(250,246,232,0.05)" }} contentStyle={tooltipStyle} />
            {(["audit_contest", "ctf", "hackathon", "bug_bounty"] as const).map((t) => (
              <Bar key={t} dataKey={t} name={TYPE_META[t].label} stackId="a" fill={TYPE_META[t].color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="// Protocol Domains" subtitle="What you'd be auditing / building">
        <div className="grid h-full grid-cols-2 items-center gap-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="80%" paddingAngle={2}>
                {byCategory.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} stroke="rgba(20,18,24,0.9)" />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto pr-1">
            {byCategory.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2 font-mono text-[11px] text-[#faf6e8]/75">
                <span className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="tabular-nums text-[#faf6e8]/45">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="// Ecosystems" subtitle="Chains & VMs represented">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byEcosystem} margin={{ left: -18, right: 8, bottom: 24 }}>
            <XAxis dataKey="name" tick={{ fill: "#faf6e8b3", fontSize: 10 }} angle={-25} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#faf6e899", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(250,246,232,0.05)" }} contentStyle={tooltipStyle} />
            <Bar dataKey="value" name="Challenges" radius={[6, 6, 0, 0]}>
              {byEcosystem.map((d, i) => (
                <Cell key={d.name} fill={PALETTE[(i + 1) % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {trendData.length > 1 && (
        <div className="lg:col-span-2">
          <Panel title="// Daily Telemetry" subtitle="Live contests vs. bug bounties tracked per daily sync">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: -18, right: 8 }}>
                <CartesianGrid stroke="rgba(250,246,232,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#faf6e8b3", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#faf6e899", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="contests" name="Live contests" stroke="#f5b544" fill="#f5b54433" />
                <Area type="monotone" dataKey="bounties" name="Bug bounties" stroke="#5eead4" fill="#5eead422" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  );
}
