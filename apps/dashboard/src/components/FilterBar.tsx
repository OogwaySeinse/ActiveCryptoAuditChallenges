import type { RefObject } from "react";
import type { Challenge, ChallengeStatus, Difficulty, Filters, QuickPreset, View } from "../types";
import { DEFAULT_FILTERS } from "../types";
import { optionCounts, TYPE_META, VIEW_TYPES } from "../lib/format";
import { MultiSelect } from "./MultiSelect";

interface Props {
  all: Challenge[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  resultCount: number;
  savedCount: number;
  onExport: () => void;
  searchRef: RefObject<HTMLInputElement>;
}

const VIEWS: { id: View; label: string }[] = [
  { id: "live", label: "⚡ Live Contests" },
  { id: "audit_contest", label: `${TYPE_META.audit_contest.icon} Audits` },
  { id: "bug_bounty", label: `${TYPE_META.bug_bounty.icon} Bug Bounties` },
  { id: "ctf", label: `${TYPE_META.ctf.icon} CTFs` },
  { id: "hackathon", label: `${TYPE_META.hackathon.icon} Hackathons` },
  { id: "practice", label: `${TYPE_META.practice.icon} Practice` },
  { id: "all", label: "All" },
];

const PRESETS: { id: QuickPreset; label: string }[] = [
  { id: "ending_soon", label: "🔥 Closing ≤ 7d" },
  { id: "high_prize", label: "💰 ≥ $50K" },
  { id: "beginner", label: "🌱 Beginner-friendly" },
  { id: "new", label: "✦ New" },
  { id: "saved", label: "★ Saved" },
];

const STATUSES: { id: ChallengeStatus; label: string }[] = [
  { id: "active", label: "Live" },
  { id: "ending_soon", label: "Closing" },
  { id: "upcoming", label: "Upcoming" },
  { id: "ongoing", label: "Always-on" },
];

const DIFFICULTIES: Difficulty[] = ["Beginner", "Intermediate", "Advanced", "Expert"];

export function FilterBar({ all, filters, setFilters, resultCount, savedCount, onExport, searchRef }: Props) {
  const scoped = all.filter((c) => VIEW_TYPES[filters.view].includes(c.challenge_type));
  const viewCounts = Object.fromEntries(
    VIEWS.map((v) => [v.id, all.filter((c) => VIEW_TYPES[v.id].includes(c.challenge_type)).length]),
  ) as Record<View, number>;

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const toggleIn = <T extends string>(key: "statuses" | "difficulties", value: T) =>
    setFilters((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
    });

  const dirty =
    filters.search ||
    filters.preset !== "none" ||
    filters.platforms.length ||
    filters.categories.length ||
    filters.ecosystems.length ||
    filters.languages.length ||
    filters.statuses.length ||
    filters.difficulties.length ||
    filters.minPrizeUsd > 0;

  return (
    <div className="wunder-glass space-y-3 rounded-2xl border border-white/10 p-3 sm:p-4">
      {/* View segments */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Challenge type">
        {VIEWS.map((v) => {
          const on = filters.view === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={on}
              onClick={() => set("view", v.id)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-medium transition ${
                on ? "bg-[#faf6e8] text-[#141218] shadow" : "bg-white/5 text-[#faf6e8]/70 hover:bg-white/10 hover:text-[#faf6e8]"
              }`}
            >
              {v.label} <span className={on ? "text-[#141218]/55" : "text-[#faf6e8]/40"}>{viewCounts[v.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Presets + search */}
      <div className="flex flex-col gap-2 border-t border-white/8 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => {
            const on = filters.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => set("preset", on ? "none" : p.id)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
                  on
                    ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                    : "border-white/10 text-[#faf6e8]/65 hover:border-white/25 hover:text-[#faf6e8]"
                }`}
              >
                {p.label}
                {p.id === "saved" ? ` (${savedCount})` : ""}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-80">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#faf6e8]/40">
              ⌕
            </span>
            <input
              ref={searchRef}
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="Search protocol, chain, language…  ( / )"
              aria-label="Search challenges"
              className="w-full rounded-lg border border-white/12 bg-black/35 py-1.5 pl-8 pr-7 font-mono text-xs text-[#faf6e8] placeholder:text-[#faf6e8]/35 focus:border-amber-300/60 focus:outline-none"
            />
            {filters.search && (
              <button
                aria-label="Clear search"
                onClick={() => set("search", "")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#faf6e8]/45 hover:text-[#faf6e8]"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={onExport}
            className="rounded-lg border border-white/12 bg-black/30 px-3 py-1.5 font-mono text-[11px] text-[#faf6e8]/75 transition hover:border-white/25 hover:text-[#faf6e8]"
          >
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* Facets */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
        <MultiSelect label="Platform" options={optionCounts(scoped, (c) => c.platform)} selected={filters.platforms} onChange={(v) => set("platforms", v)} />
        <MultiSelect label="Domain" options={optionCounts(scoped, (c) => c.category)} selected={filters.categories} onChange={(v) => set("categories", v)} />
        <MultiSelect label="Ecosystem" options={optionCounts(scoped, (c) => c.ecosystem)} selected={filters.ecosystems} onChange={(v) => set("ecosystems", v)} />
        <MultiSelect label="Language" options={optionCounts(scoped, (c) => c.languages)} selected={filters.languages} onChange={(v) => set("languages", v)} />

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/25 p-0.5">
          {STATUSES.map((s) => {
            const on = filters.statuses.includes(s.id);
            return (
              <button
                key={s.id}
                aria-pressed={on}
                onClick={() => toggleIn("statuses", s.id)}
                className={`rounded-md px-2 py-1 font-mono text-[10px] transition ${on ? "bg-emerald-400/20 text-emerald-100" : "text-[#faf6e8]/55 hover:text-[#faf6e8]"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/25 p-0.5">
          {DIFFICULTIES.map((d) => {
            const on = filters.difficulties.includes(d);
            return (
              <button
                key={d}
                aria-pressed={on}
                onClick={() => toggleIn("difficulties", d)}
                className={`rounded-md px-2 py-1 font-mono text-[10px] transition ${on ? "bg-violet-400/20 text-violet-100" : "text-[#faf6e8]/55 hover:text-[#faf6e8]"}`}
              >
                {d}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1 font-mono text-[10px] text-[#faf6e8]/55">
          Min pool
          <select
            value={filters.minPrizeUsd}
            onChange={(e) => set("minPrizeUsd", Number(e.target.value))}
            className="cursor-pointer bg-transparent text-[#faf6e8] focus:outline-none"
          >
            {[0, 1000, 10000, 50000, 100000, 1000000].map((v) => (
              <option key={v} value={v} className="bg-[#141218]">
                {v === 0 ? "Any" : v >= 1_000_000 ? "$1M+" : `$${v / 1000}K+`}
              </option>
            ))}
          </select>
        </label>

        <span className="ml-auto font-mono text-[11px] text-[#faf6e8]/50">
          {resultCount} match{resultCount === 1 ? "" : "es"}
        </span>
        {dirty ? (
          <button
            onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, view: f.view }))}
            className="rounded-lg px-2 py-1 font-mono text-[11px] text-rose-300 transition hover:bg-rose-400/10"
          >
            ↺ Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

