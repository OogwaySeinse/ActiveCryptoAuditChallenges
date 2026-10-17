import { useState } from "react";
import type { Metadata } from "../types";
import { relativeTime } from "../lib/format";

const SOURCE_LABELS: Record<string, string> = {
  code4rena: "Code4rena",
  sherlock: "Sherlock",
  cantina: "Cantina",
  codehawks: "CodeHawks",
  immunefi: "Immunefi",
  ethglobal: "ETHGlobal",
  devpost: "Devpost",
  ctftime: "CTFtime",
  curated: "Practice (curated)",
};

export function SourceStatus({ meta, now }: { meta: Metadata; now: number }) {
  const [open, setOpen] = useState(false);
  const ok = meta.sources.filter((s) => s.status === "ok" || s.status === "cached").length;

  return (
    <div className="wunder-glass overflow-hidden rounded-2xl border border-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 font-mono text-[11px] text-[#faf6e8]/65 transition hover:text-[#faf6e8]"
      >
        <span className="flex items-center gap-2">
          <span className="text-emerald-300">●</span>
          Scraper feed health — {ok}/{meta.sources.length} operational · synced {relativeTime(meta.generated_at, now)}
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden gap-1 sm:flex">
            {meta.sources.map((s) => (
              <span
                key={s.name}
                title={`${s.name}: ${s.status} (${s.count})`}
                className={`h-2 w-2 rounded-full ${s.status === "ok" ? "bg-emerald-400" : s.status === "cached" ? "bg-amber-400" : "bg-rose-500"}`}
              />
            ))}
          </span>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {meta.sources.map((s) => (
            <div key={s.name} className="rounded-xl border border-white/8 bg-black/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#faf6e8]">{SOURCE_LABELS[s.name] ?? s.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    s.status === "ok"
                      ? "bg-emerald-400/15 text-emerald-200"
                      : s.status === "cached"
                        ? "bg-amber-400/15 text-amber-200"
                        : "bg-rose-400/15 text-rose-200"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-[#faf6e8]/50">
                {s.count} records · {(s.duration_ms / 1000).toFixed(1)}s
              </div>
              {s.error && (
                <div className="mt-0.5 truncate font-mono text-[10px] text-[#faf6e8]/40" title={s.error}>
                  {s.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

