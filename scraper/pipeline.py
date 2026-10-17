from __future__ import annotations

import csv
import json
import logging
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from scraper.dedupe import deduplicate_records
from scraper.history import annotate_with_history, load_snapshots
from scraper.models import ChallengeRecord, SourceStatus
from scraper.normalize import refresh_status
from scraper.sources import ALL_SCRAPERS

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
DASHBOARD_PUBLIC_DATA = ROOT_DIR / "apps" / "dashboard" / "public" / "data"

CSV_COLUMNS = [
    "id",
    "title",
    "platform",
    "source",
    "url",
    "challenge_type",
    "prize",
    "prize_usd",
    "prize_currency",
    "start_date",
    "end_date",
    "days_remaining",
    "status",
    "category",
    "ecosystem",
    "languages",
    "difficulty",
    "organizer",
    "kyc_required",
    "participants_count",
    "findings_count",
    "repo_url",
    "first_seen_at",
    "is_new",
    "prize_delta_usd",
    "days_shift",
    "tags",
    "description",
    "scraped_at",
]

TYPE_ORDER = {"audit_contest": 0, "bug_bounty": 3, "ctf": 1, "hackathon": 2, "practice": 4}
STATUS_ORDER = {"ending_soon": 0, "active": 1, "upcoming": 2, "ongoing": 3}


def _save_records_cache(source_name: str, records: List[ChallengeRecord]) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{source_name}.records.json").write_text(
            json.dumps([r.to_dict() for r in records], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to write records cache for %s: %s", source_name, exc)


def _load_records_cache(source_name: str) -> List[ChallengeRecord]:
    path = CACHE_DIR / f"{source_name}.records.json"
    if not path.exists():
        return []
    try:
        restored: List[ChallengeRecord] = []
        known = set(ChallengeRecord.__dataclass_fields__)
        for item in json.loads(path.read_text(encoding="utf-8")):
            if not isinstance(item, dict):
                continue
            rec = ChallengeRecord(**{k: v for k, v in item.items() if k in known})
            if refresh_status(rec):
                restored.append(rec)
        return restored
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to load records cache for %s: %s", source_name, exc)
        return []


def _run_source(name: str) -> Tuple[str, List[ChallengeRecord], SourceStatus]:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    t0 = time.perf_counter()
    try:
        records = ALL_SCRAPERS[name]()
        dt_ms = int((time.perf_counter() - t0) * 1000)
        if records:
            _save_records_cache(name, records)
            return name, records, SourceStatus(name, "ok", len(records), dt_ms, None, now_iso)
        # A live scrape returning zero is legitimate (e.g. no running contests), but fall back to cache if any.
        cached = _load_records_cache(name)
        if cached:
            return name, cached, SourceStatus(
                name, "cached", len(cached), dt_ms, "Live scrape returned 0 records; used still-valid cached snapshot", now_iso
            )
        return name, [], SourceStatus(name, "ok", 0, dt_ms, "No live challenges right now", now_iso)
    except Exception as exc:  # noqa: BLE001
        dt_ms = int((time.perf_counter() - t0) * 1000)
        logger.exception("Scraper '%s' raised an error", name)
        cached = _load_records_cache(name)
        if cached:
            return name, cached, SourceStatus(name, "cached", len(cached), dt_ms, str(exc)[:300], now_iso)
        return name, [], SourceStatus(name, "error", 0, dt_ms, str(exc)[:300], now_iso)


def run_pipeline(selected_sources: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Run all (or selected) scrapers in parallel, deduplicate, annotate history and write outputs."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    names = [n for n in (selected_sources or ALL_SCRAPERS.keys()) if n in ALL_SCRAPERS]

    all_records: List[ChallengeRecord] = []
    statuses: List[SourceStatus] = []
    with ThreadPoolExecutor(max_workers=min(8, len(names) or 1)) as pool:
        for name, records, status in pool.map(_run_source, names):
            all_records.extend(records)
            statuses.append(status)

    deduped = deduplicate_records(all_records)
    history_meta = annotate_with_history(deduped)

    deduped.sort(
        key=lambda r: (
            TYPE_ORDER.get(r.challenge_type, 9),
            STATUS_ORDER.get(r.status, 9),
            r.days_remaining if r.days_remaining is not None else 999_999,
            -r.prize_usd,
            r.title.lower(),
        )
    )

    def _count(attr: str) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for r in deduped:
            key = getattr(r, attr)
            out[key] = out.get(key, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))

    contests = [r for r in deduped if r.challenge_type in ("audit_contest", "ctf", "hackathon")]
    bounties = [r for r in deduped if r.challenge_type == "bug_bounty"]

    payload: Dict[str, Any] = {
        "metadata": {
            "generated_at": now_iso,
            "total_active": len(deduped),
            "contest_prize_usd": round(sum(r.prize_usd for r in contests), 2),
            "max_bounty_usd": round(max((r.prize_usd for r in bounties), default=0.0), 2),
            "bounty_pool_usd": round(sum(r.prize_usd for r in bounties), 2),
            "ending_soon_count": sum(1 for r in deduped if r.status == "ending_soon"),
            "platforms_count": len({r.platform for r in deduped}),
            "by_type": _count("challenge_type"),
            "platforms": _count("platform"),
            "categories": _count("category"),
            "ecosystems": _count("ecosystem"),
            "history": history_meta,
            "trend": load_snapshots(60),
            "sources": [s.to_dict() for s in statuses],
        },
        "challenges": [r.to_dict() for r in deduped],
    }
    write_outputs(payload, deduped)
    return payload


def write_outputs(payload: Dict[str, Any], records: List[ChallengeRecord]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    json_path = DATA_DIR / "challenges.json"
    csv_path = DATA_DIR / "challenges.csv"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for rec in records:
            row = rec.to_dict()
            row["tags"] = "; ".join(rec.tags or [])
            row["languages"] = "; ".join(rec.languages or [])
            writer.writerow({col: row.get(col, "") for col in CSV_COLUMNS})

    if DASHBOARD_PUBLIC_DATA.parent.parent.exists():
        DASHBOARD_PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(json_path, DASHBOARD_PUBLIC_DATA / "challenges.json")
        shutil.copyfile(csv_path, DASHBOARD_PUBLIC_DATA / "challenges.csv")

    logger.info("Wrote %d active crypto challenges to %s and %s", len(records), json_path, csv_path)

