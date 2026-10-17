import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiMatchmaker } from "./components/AiMatchmaker";
import { AsciiBackdrop } from "./components/AsciiBackdrop";
import { ChallengeTable } from "./components/ChallengeTable";
import { Charts } from "./components/Charts";
import { FilterBar } from "./components/FilterBar";
import { SourceStatus } from "./components/SourceStatus";
import { StatCards } from "./components/StatCards";
import { TYPE_META, countdown, exportCsv, formatUSD, matchesFilters, msUntil, platformColor, relativeTime } from "./lib/format";
import { readFiltersFromUrl, useBookmarks, useDataset, useNow, useSyncFiltersToUrl } from "./lib/hooks";
import type { Challenge, Filters } from "./types";

const REPO_URL = "https://github.com/OogwaySeinse/ActiveCryptoAuditChallenges";
const SIBLINGS = [
  { label: "Quant Arena", href: "https://oogwayseinse.github.io/ActiveQuantCompetitions/" },
  { label: "ML Arena", href: "https://oogwayseinse.github.io/ActiveMLCompetitions/" },
];

type Tab = "table" | "insights";

export default function App() {
  const { state, refreshing, reload } = useDataset();
  const now = useNow(30_000);
  const [filters, setFilters] = useState<Filters>(readFiltersFromUrl);
  const [tab, setTab] = useState<Tab>("table");
  const { bookmarks, toggle } = useBookmarks();
  const searchRef = useRef<HTMLInputElement>(null);
  useSyncFiltersToUrl(filters);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        document.getElementById("live-arena")?.scrollIntoView({ behavior: "smooth" });
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all: Challenge[] = useMemo(() => (state.status === "ready" ? state.data.challenges : []), [state]);
  const meta = state.status === "ready" ? state.data.metadata : null;

  // Drop anything whose deadline passed since the last sync (the page may stay open for days)
  const live = useMemo(() => all.filter((c) => !c.end_date || Date.parse(c.end_date) > now), [all, now]);
  const filtered = useMemo(() => live.filter((c) => matchesFilters(c, filters, bookmarks, now)), [live, filters, bookmarks, now]);

  const timeboxed = useMemo(() => live.filter((c) => c.challenge_type !== "bug_bounty" && c.challenge_type !== "practice"), [live]);

  const closingSoon = useMemo(
    () =>
      timeboxed
        .filter((c) => c.status !== "upcoming" && msUntil(c, now) !== null)
        .sort((a, b) => (msUntil(a, now) ?? 0) - (msUntil(b, now) ?? 0))
        .slice(0, 12),
    [timeboxed, now],
  );

  const flagships = useMemo(() => {
    const contests = [...timeboxed].filter((c) => c.prize_usd > 0).sort((a, b) => b.prize_usd - a.prize_usd);
    const bounties = live.filter((c) => c.challenge_type === "bug_bounty").sort((a, b) => b.prize_usd - a.prize_usd);
    return [...contests.slice(0, 3), ...bounties].slice(0, 3);
  }, [timeboxed, live]);

  const onTag = useCallback((tag: string) => setFilters((f) => ({ ...f, search: tag })), []);
  const contestPool = timeboxed.reduce((s, c) => s + (c.prize_usd || 0), 0);

  return (
    <div className="relative min-h-[calc(100vh-22px)] overflow-hidden rounded-2xl border border-black/25 bg-[#0d0c10] text-[#faf6e8] shadow-2xl">
      <AsciiBackdrop />

      <div className="relative z-10 mx-auto max-w-[1600px] space-y-8 px-4 pb-28 pt-5 sm:px-7">
        {/* Corner pills */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <a href="#top" className="wunder-pill inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2 font-mono text-xs font-semibold tracking-wider">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_#f5b544]" />
              WUNDERAUDIT // CRYPTO ARENA
            </a>
            {meta && (
              <button
                onClick={reload}
                title="Re-fetch the latest snapshot"
                className="wunder-pill hidden items-center gap-2 rounded-xl px-3 py-2 font-mono text-[11px] text-[#faf6e8]/70 transition hover:text-[#faf6e8] sm:inline-flex"
              >
                <span className={`text-amber-200 ${refreshing ? "animate-pulse-soft" : ""}`}>SYNC:</span>
                <span>{relativeTime(meta.generated_at, now)}</span>
                <span className="text-white/20">·</span>
                <span>06:00 UTC CRON</span>
              </button>
            )}
          </div>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <a href="#ai-matchmaker" className="wunder-pill rounded-xl px-3.5 py-2 text-amber-200 transition hover:border-amber-300/50">
              ✦ Matchmaker
            </a>
            <a href="#live-arena" onClick={() => setTab("table")} className="wunder-pill rounded-xl px-3.5 py-2 text-[#faf6e8]/85 transition hover:border-white/30">
              Arena ({live.length || "…"})
            </a>
            <a href="#live-arena" onClick={() => setTab("insights")} className="wunder-pill rounded-xl px-3.5 py-2 text-[#faf6e8]/85 transition hover:border-white/30">
              Telemetry
            </a>
            <a href="./data/challenges.csv" download className="wunder-pill rounded-xl px-3 py-2 text-[#faf6e8]/80 transition hover:border-white/30">
              ⬇ CSV
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="wunder-pill rounded-xl px-3 py-2 text-[#faf6e8]/80 transition hover:border-white/30">
              GitHub ↗
            </a>
          </nav>
        </header>

        {/* Hero */}
        <section id="top" className="relative pt-4 sm:pt-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="wunder-pill mx-auto inline-flex flex-wrap items-center justify-center gap-2.5 rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-[#faf6e8]/80">
              <span className="text-amber-200">● LIVE MONITOR</span>
              <span className="text-white/25">|</span>
              <span>C4 · SHERLOCK · CANTINA · CODEHAWKS · IMMUNEFI · CTFTIME · ETHGLOBAL · DEVPOST</span>
            </div>
            <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-tight sm:text-7xl lg:text-[82px]">
              Every live audit, bounty &amp; CTF — <span className="italic text-amber-200">on one clock.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl font-mono text-xs leading-relaxed text-[#faf6e8]/70 sm:text-sm">
              Smart-contract audit contests, Web3 bug bounties, crypto CTFs and blockchain hackathons — scraped every morning,
              deduplicated, priced in USD and counted down to the minute.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 font-mono text-xs sm:text-sm">
              <a href="#live-arena" className="wunder-cta-glow inline-flex items-center gap-2.5 rounded-full bg-[#faf6e8] px-6 py-3.5 font-semibold text-[#141218] transition hover:bg-white">
                Open the Live Arena <span aria-hidden="true">↓</span>
              </a>
              <a href="#ai-matchmaker" className="wunder-pill inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[#faf6e8]/90 transition hover:border-white/35">
                ✦ Match me to a challenge <span aria-hidden="true">→</span>
              </a>
            </div>
            {meta && (
              <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 font-mono text-[11px] text-[#faf6e8]/55">
                <span>
                  <b className="text-[#faf6e8]">{timeboxed.length}</b> time-boxed live
                </span>
                <span>
                  <b className="text-[#faf6e8]">{formatUSD(contestPool)}</b> in contest pools
                </span>
                <span>
                  <b className="text-[#faf6e8]">{live.filter((c) => c.challenge_type === "bug_bounty").length}</b> bug bounties up to{" "}
                  <b className="text-[#faf6e8]">{formatUSD(meta.max_bounty_usd)}</b>
                </span>
              </div>
            )}
          </div>

          {/* Closing-soon ticker */}
          {closingSoon.length > 0 && (
            <div className="wunder-pill mt-8 overflow-hidden rounded-2xl" aria-label="Closing soon">
              <div className="flex items-center">
                <div className="shrink-0 border-r border-white/10 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-amber-200">⏳ Closing next</div>
                <div className="relative flex-1 overflow-hidden">
                  <div className="ticker-track flex w-max gap-8 py-2.5 pl-6">
                    {[...closingSoon, ...closingSoon].map((c, i) => (
                      <a
                        key={`${c.id}-${i}`}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-hidden={i >= closingSoon.length}
                        tabIndex={i >= closingSoon.length ? -1 : 0}
                        className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-[#faf6e8]/75 hover:text-amber-100"
                      >
                        <span style={{ color: TYPE_META[c.challenge_type].color }}>{TYPE_META[c.challenge_type].icon}</span>
                        <span className="text-[#faf6e8]">{c.title}</span>
                        <span className="text-[#faf6e8]/40">{c.platform}</span>
                        <span className="rounded bg-amber-300/15 px-1.5 text-amber-200">{countdown(c, now)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Flagships */}
          {flagships.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {flagships.map((c, i) => {
                const col = platformColor(c.platform);
                return (
                  <a
                    key={c.id}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wunder-glass group flex flex-col justify-between rounded-2xl border border-white/12 p-4 transition hover:-translate-y-0.5 hover:border-amber-300/45"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#faf6e8]/50">
                          FLAGSHIP // 0{i + 1} · {TYPE_META[c.challenge_type].label.toUpperCase()}
                        </span>
                        <span className="rounded px-2 py-0.5 font-medium" style={{ backgroundColor: `${col}24`, color: col }}>
                          {c.platform}
                        </span>
                      </div>
                      <div className="mt-2 line-clamp-2 font-medium text-[#faf6e8] group-hover:text-amber-200">{c.title}</div>
                      <div className="mt-1 font-mono text-[10px] text-[#faf6e8]/45">
                        {c.category} · {c.ecosystem}
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-2.5 font-mono text-xs">
                      <span className="text-base font-bold text-amber-200">
                        {c.challenge_type === "bug_bounty" ? "≤ " : ""}
                        {formatUSD(c.prize_usd)}
                      </span>
                      <span className="text-[11px] text-[#faf6e8]/60">⏳ {countdown(c, now)}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {state.status === "loading" && (
          <div className="wunder-glass rounded-2xl border border-white/10 py-24 text-center font-mono text-sm text-[#faf6e8]/60">
            SYNCHRONISING LIVE CRYPTO CHALLENGE TELEMETRY…
          </div>
        )}
        {state.status === "error" && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-6 font-mono text-sm text-rose-200">
            Couldn&apos;t load <code>data/challenges.json</code> ({state.error}). Run <code>python -m scraper</code> first.
          </div>
        )}

        {state.status === "ready" && meta && (
          <>
            <AiMatchmaker all={live} now={now} />

            <section id="live-arena" className="scroll-mt-6 space-y-4 pt-2">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-xs uppercase tracking-widest text-amber-200/90">// GLOBAL CHALLENGE INDEX</div>
                  <h2 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">Live Crypto Security Arena</h2>
                </div>
                <div className="wunder-pill inline-flex rounded-xl p-1 font-mono text-xs" role="tablist" aria-label="Arena view">
                  {(
                    [
                      ["table", "📋 Arena Index"],
                      ["insights", "📊 Telemetry"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                      className={`rounded-lg px-4 py-1.5 font-medium transition ${
                        tab === id ? "bg-[#faf6e8] text-[#141218] shadow" : "text-[#faf6e8]/65 hover:text-[#faf6e8]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <StatCards rows={filtered} all={live} meta={meta} now={now} />
              <FilterBar
                all={live}
                filters={filters}
                setFilters={setFilters}
                resultCount={filtered.length}
                savedCount={bookmarks.size}
                onExport={() => exportCsv(filtered)}
                searchRef={searchRef}
              />
              {tab === "table" ? (
                <ChallengeTable rows={filtered} now={now} bookmarks={bookmarks} onToggleBookmark={toggle} onTag={onTag} />
              ) : (
                <Charts rows={filtered} trend={meta.trend ?? []} now={now} />
              )}
              <SourceStatus meta={meta} now={now} />
            </section>
          </>
        )}

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 font-mono text-[11px] text-[#faf6e8]/45 sm:flex-row">
          <div>
            Aggregated daily from Code4rena, Sherlock, Cantina, CodeHawks, Immunefi, CTFtime, ETHGlobal &amp; Devpost. Always verify scope
            and rules on the official page. Press <kbd className="rounded bg-white/10 px-1.5 text-[#faf6e8]/75">/</kbd> to search.
          </div>
          <div className="flex items-center gap-3">
            {SIBLINGS.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-[#faf6e8]">
                {s.label} ↗
              </a>
            ))}
            <a href="./data/challenges.json" target="_blank" rel="noopener noreferrer" className="text-amber-200/80 hover:text-amber-200">
              challenges.json
            </a>
          </div>
        </footer>
      </div>

      {/* Floating bottom CTA */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="wunder-cta-glow pointer-events-auto flex items-center gap-1.5 rounded-full border border-black/15 bg-[#faf6e8] p-1.5 font-mono text-xs font-semibold text-[#141218]">
          <a href="#ai-matchmaker" className="rounded-full bg-[#141218] px-4 py-2 text-[#faf6e8] transition hover:bg-black">
            ✦ Matchmaker
          </a>
          <a href="#live-arena" className="rounded-full px-4 py-2 transition hover:bg-black/10">
            Live Arena ({timeboxed.length} live · {live.length} total) →
          </a>
        </div>
      </div>
    </div>
  );
}

