import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FILTERS, type Filters, type Payload, type QuickPreset, type View } from "../types";

type DatasetState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: Payload };

/** Loads ./data/challenges.json and re-polls every 10 minutes so an open tab picks up new daily syncs. */
export function useDataset() {
  const [state, setState] = useState<DatasetState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true);
    try {
      const res = await fetch(`./data/challenges.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Payload;
      setState({ status: "ready", data });
    } catch (err) {
      setState((prev) =>
        prev.status === "ready" ? prev : { status: "error", error: err instanceof Error ? err.message : String(err) },
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = window.setInterval(() => load(false), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  return { state, refreshing, reload: () => load(false) };
}

/** Ticking clock for live countdowns. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const BOOKMARKS_KEY = "wunderaudit_bookmarks_v1";

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(BOOKMARKS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);
  return { bookmarks, toggle };
}

const VIEWS: View[] = ["live", "audit_contest", "bug_bounty", "ctf", "hackathon", "practice", "all"];
const PRESETS: QuickPreset[] = ["none", "ending_soon", "high_prize", "new", "beginner", "saved"];

export function readFiltersFromUrl(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const list = (key: string) => p.get(key)?.split(",").filter(Boolean) ?? [];
  const view = p.get("view") as View | null;
  const preset = p.get("preset") as QuickPreset | null;
  return {
    ...DEFAULT_FILTERS,
    view: view && VIEWS.includes(view) ? view : DEFAULT_FILTERS.view,
    preset: preset && PRESETS.includes(preset) ? preset : "none",
    search: p.get("q") ?? "",
    platforms: list("platforms"),
    categories: list("categories"),
    ecosystems: list("ecosystems"),
    languages: list("languages"),
    statuses: list("statuses") as Filters["statuses"],
    difficulties: list("difficulties") as Filters["difficulties"],
    minPrizeUsd: Number(p.get("minPrize") ?? 0) || 0,
  };
}

export function useSyncFiltersToUrl(f: Filters) {
  useEffect(() => {
    const p = new URLSearchParams();
    if (f.view !== DEFAULT_FILTERS.view) p.set("view", f.view);
    if (f.preset !== "none") p.set("preset", f.preset);
    if (f.search.trim()) p.set("q", f.search.trim());
    (["platforms", "categories", "ecosystems", "languages", "statuses", "difficulties"] as const).forEach((k) => {
      if (f[k].length) p.set(k, f[k].join(","));
    });
    if (f.minPrizeUsd > 0) p.set("minPrize", String(f.minPrizeUsd));
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [f]);
}

