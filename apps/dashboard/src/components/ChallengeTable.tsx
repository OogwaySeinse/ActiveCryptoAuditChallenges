import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Challenge } from "../types";
import {
  DIFFICULTY_CLS,
  STATUS_META,
  TYPE_META,
  countdown,
  downloadIcs,
  formatUSD,
  msUntil,
  platformColor,
  shortDate,
} from "../lib/format";

interface Props {
  rows: Challenge[];
  now: number;
  bookmarks: Set<string>;
  onToggleBookmark: (id: string) => void;
  onTag: (tag: string) => void;
}

function UrgencyMeter({ c, now }: { c: Challenge; now: number }) {
  if (!c.end_date || !c.start_date || c.status === "upcoming") return null;
  const start = Date.parse(c.start_date);
  const end = Date.parse(c.end_date);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const ticks = 14;
  const filled = Math.round(elapsed * ticks);
  const color = elapsed > 0.85 ? "#fb7185" : elapsed > 0.6 ? "#fbbf24" : "#34d399";
  return (
    <div className="mt-1 flex h-2 w-28 items-end gap-[2px]" title={`${Math.round(elapsed * 100)}% of window elapsed`}>
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          className="w-full rounded-[1px]"
          style={{ height: i < filled ? "100%" : "50%", backgroundColor: i < filled ? color : "rgba(250,246,232,0.12)" }}
        />
      ))}
    </div>
  );
}

export function ChallengeTable({ rows, now, bookmarks, onToggleBookmark, onTag }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Challenge>[]>(
    () => [
      {
        id: "save",
        header: () => <span className="sr-only">Save</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const on = bookmarks.has(row.original.id);
          return (
            <button
              onClick={() => onToggleBookmark(row.original.id)}
              aria-label={on ? "Remove bookmark" : "Bookmark challenge"}
              aria-pressed={on}
              className={`text-base leading-none transition ${on ? "text-amber-300" : "text-[#faf6e8]/25 hover:text-[#faf6e8]/70"}`}
            >
              {on ? "★" : "☆"}
            </button>
          );
        },
      },
      {
        accessorKey: "title",
        header: "Challenge",
        cell: ({ row }) => {
          const c = row.original;
          const meta = TYPE_META[c.challenge_type];
          return (
            <div className="min-w-[260px] max-w-md space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                >
                  {meta.icon} {meta.short}
                </span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium leading-snug text-[#faf6e8] transition hover:text-amber-200"
                >
                  {c.title}
                </a>
                {c.is_new && (
                  <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-200">
                    ✦ New
                  </span>
                )}
                {c.kyc_required && (
                  <span className="rounded border border-white/15 px-1 py-0.5 font-mono text-[9px] uppercase text-[#faf6e8]/55" title="KYC required to receive rewards">
                    KYC
                  </span>
                )}
              </div>
              {c.description && <p className="line-clamp-2 text-xs leading-relaxed text-[#faf6e8]/55">{c.description}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                {c.organizer && c.organizer !== c.title && c.organizer !== c.platform && (
                  <span className="font-mono text-[10px] text-[#faf6e8]/45">by {c.organizer}</span>
                )}
                {c.languages.map((l) => (
                  <button
                    key={l}
                    onClick={() => onTag(l)}
                    className="rounded bg-sky-400/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-200 transition hover:bg-sky-400/20"
                  >
                    {l}
                  </button>
                ))}
                {c.repo_url && (
                  <a
                    href={c.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[#faf6e8]/60 transition hover:bg-white/10 hover:text-[#faf6e8]"
                  >
                    ⌥ repo
                  </a>
                )}
                {typeof c.findings_count === "number" && c.findings_count > 0 && (
                  <span className="font-mono text-[10px] text-[#faf6e8]/40">{c.findings_count.toLocaleString()} findings</span>
                )}
                {typeof c.participants_count === "number" && c.participants_count > 0 && (
                  <span className="font-mono text-[10px] text-[#faf6e8]/40">{c.participants_count.toLocaleString()} participants</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "platform",
        header: "Venue",
        cell: ({ row }) => {
          const p = row.original.platform;
          const col = platformColor(p);
          return (
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[11px]"
              style={{ backgroundColor: `${col}1f`, color: col, border: `1px solid ${col}40` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col }} />
              {p}
            </span>
          );
        },
      },
      {
        id: "domain",
        accessorFn: (c) => `${c.category} ${c.ecosystem}`,
        header: "Domain / Chain",
        cell: ({ row }) => (
          <div className="space-y-1 whitespace-nowrap">
            <div className="text-xs text-[#faf6e8]/85">{row.original.category}</div>
            <div className="font-mono text-[10px] text-[#faf6e8]/45">{row.original.ecosystem}</div>
            <span
              className={`inline-block rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${DIFFICULTY_CLS[row.original.difficulty] ?? DIFFICULTY_CLS.Intermediate}`}
            >
              {row.original.difficulty}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "prize_usd",
        header: "Pool / Max Payout",
        cell: ({ row }) => {
          const c = row.original;
          const cash = c.prize_usd > 0;
          return (
            <div className="whitespace-nowrap">
              <div className={`font-mono tabular-nums ${cash ? "text-sm font-semibold text-amber-200" : "text-xs text-[#faf6e8]/50"}`}>
                {c.challenge_type === "bug_bounty" && cash ? `≤ ${formatUSD(c.prize_usd)}` : cash ? formatUSD(c.prize_usd) : c.prize}
              </div>
              {cash && c.prize_currency !== "USD" && <div className="font-mono text-[10px] text-[#faf6e8]/40">paid in {c.prize_currency}</div>}
              {c.prize_delta_usd !== 0 && (
                <div className={`font-mono text-[10px] ${c.prize_delta_usd > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {c.prize_delta_usd > 0 ? "▲" : "▼"} {formatUSD(Math.abs(c.prize_delta_usd))} since last sync
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "deadline",
        accessorFn: (c) => msUntil(c, now) ?? Number.MAX_SAFE_INTEGER,
        header: "Countdown",
        cell: ({ row }) => {
          const c = row.original;
          const st = STATUS_META[c.status] ?? STATUS_META.active;
          const ms = msUntil(c, now);
          const urgent = c.status !== "upcoming" && ms !== null && ms > 0 && ms < 48 * 3600_000;
          return (
            <div className="min-w-[150px] space-y-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums ${st.cls} ${urgent ? "animate-pulse-soft" : ""}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                {countdown(c, now)}
              </span>
              {(c.end_date || c.start_date) && (
                <div className="font-mono text-[10px] text-[#faf6e8]/40">
                  {c.status === "upcoming" && c.start_date ? `opens ${shortDate(c.start_date)}` : c.end_date ? `ends ${shortDate(c.end_date)}` : ""}
                  {c.days_shift ? (
                    <span className="ml-1 rounded bg-amber-400/15 px-1 text-amber-200" title="Deadline moved since previous sync">
                      {c.days_shift > 0 ? `+${c.days_shift}d` : `${c.days_shift}d`}
                    </span>
                  ) : null}
                </div>
              )}
              <UrgencyMeter c={c} now={now} />
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-1.5">
              {(c.end_date || c.start_date) && (
                <button
                  onClick={() => downloadIcs(c)}
                  title="Add deadline to calendar (.ics with 24h reminder)"
                  aria-label={`Add ${c.title} deadline to calendar`}
                  className="rounded-lg border border-white/12 px-2 py-1.5 font-mono text-[11px] text-[#faf6e8]/60 transition hover:border-white/30 hover:text-[#faf6e8]"
                >
                  📅
                </button>
              )}
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap rounded-lg bg-[#faf6e8] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#141218] transition hover:bg-white"
              >
                {c.challenge_type === "bug_bounty" ? "Hunt ↗" : c.challenge_type === "practice" ? "Train ↗" : "Enter ↗"}
              </a>
            </div>
          );
        },
      },
    ],
    [bookmarks, onToggleBookmark, onTag, now],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    autoResetPageIndex: true,
  });

  if (rows.length === 0) {
    return (
      <div className="wunder-glass rounded-2xl border border-white/10 px-6 py-16 text-center">
        <div className="font-display text-2xl text-[#faf6e8]">Nothing live matches these filters.</div>
        <p className="mt-2 font-mono text-xs text-[#faf6e8]/55">
          Audit contests are bursty — try the <span className="text-teal-200">◈ Bug Bounties</span> or{" "}
          <span className="text-[#faf6e8]/80">∞ Practice</span> views, or reset your filters.
        </p>
      </div>
    );
  }

  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div className="wunder-glass overflow-hidden rounded-2xl border border-white/10">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/10 bg-black/30">
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                      className="px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-[#faf6e8]/45"
                    >
                      {sortable ? (
                        <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase hover:text-[#faf6e8]">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span className={dir ? "text-amber-300" : "opacity-40"}>{dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕"}</span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-sm">
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="transition hover:bg-white/[0.03]">
                {r.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3.5 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-center justify-between gap-2 border-t border-white/10 bg-black/25 px-4 py-3 font-mono text-[11px] text-[#faf6e8]/55 sm:flex-row">
        <span>
          {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, rows.length)} of {rows.length}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-[#faf6e8]"
          >
            {[15, 25, 50, 100].map((s) => (
              <option key={s} value={s} className="bg-[#141218]">
                {s} / page
              </option>
            ))}
          </select>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
            className="rounded-lg border border-white/12 px-2.5 py-1 disabled:opacity-30"
          >
            ←
          </button>
          <span className="tabular-nums">
            {pageIndex + 1}/{Math.max(1, table.getPageCount())}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
            className="rounded-lg border border-white/12 px-2.5 py-1 disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

