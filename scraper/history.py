"""First-seen registry, NEW badges, prize/deadline diffs and daily snapshots."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from scraper.models import ChallengeRecord
from scraper.normalize import canonicalize_url

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HISTORY_DIR = DATA_DIR / "history"
FIRST_SEEN_PATH = HISTORY_DIR / "first_seen.json"
SNAPSHOT_DIR = HISTORY_DIR / "snapshots"
NEW_BADGE_WINDOW_DAYS = 3
SNAPSHOT_RETENTION_DAYS = 120


def load_first_seen() -> Dict[str, Dict[str, Any]]:
    if not FIRST_SEEN_PATH.exists():
        return {}
    try:
        payload = json.loads(FIRST_SEEN_PATH.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load first_seen.json: %s", exc)
        return {}


def save_first_seen(registry: Dict[str, Dict[str, Any]]) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    FIRST_SEEN_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def _date_part(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def annotate_with_history(records: List[ChallengeRecord], today: Optional[date] = None) -> Dict[str, Any]:
    """Enrich records with first_seen_at / is_new / prize_delta_usd / days_shift."""
    ref_today = today or datetime.now(timezone.utc).date()
    today_iso = ref_today.isoformat()
    registry = load_first_seen()
    is_bootstrap = len(registry) == 0

    new_count = prize_changes = deadline_changes = 0
    for rec in records:
        key = canonicalize_url(rec.url) or rec.id
        entry = registry.get(key)
        if entry is None:
            rec.first_seen_at = today_iso
            rec.is_new = not is_bootstrap
            new_count += int(rec.is_new)
            registry[key] = {
                "id": rec.id,
                "title": rec.title,
                "platform": rec.platform,
                "challenge_type": rec.challenge_type,
                "first_seen_at": today_iso,
                "initial_prize_usd": rec.prize_usd,
                "last_prize_usd": rec.prize_usd,
                "initial_end_date": rec.end_date,
                "last_end_date": rec.end_date,
                "last_seen_at": today_iso,
                "bootstrap": is_bootstrap,
            }
            continue

        rec.first_seen_at = str(entry.get("first_seen_at") or today_iso)
        seen = _date_part(rec.first_seen_at)
        rec.is_new = (
            bool(seen)
            and not is_bootstrap
            and not entry.get("bootstrap")
            and 0 <= (ref_today - seen).days <= NEW_BADGE_WINDOW_DAYS
        )
        new_count += int(rec.is_new)

        prev_prize = float(entry.get("last_prize_usd") or 0.0)
        # Ignore tiny FX drift on token-denominated pools (<2%)
        if prev_prize > 0 and rec.prize_usd > 0 and abs(rec.prize_usd - prev_prize) / prev_prize >= 0.02:
            rec.prize_delta_usd = round(rec.prize_usd - prev_prize, 2)
            prize_changes += 1

        d_old, d_new = _date_part(entry.get("last_end_date")), _date_part(rec.end_date)
        if d_old and d_new and d_old != d_new:
            rec.days_shift = (d_new - d_old).days
            deadline_changes += 1

        entry.update({"last_prize_usd": rec.prize_usd, "last_end_date": rec.end_date, "last_seen_at": today_iso})
        registry[key] = entry

    try:
        save_first_seen(registry)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to save first_seen.json: %s", exc)

    try:
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        by_type: Dict[str, int] = {}
        for r in records:
            by_type[r.challenge_type] = by_type.get(r.challenge_type, 0) + 1
        (SNAPSHOT_DIR / f"{today_iso}.json").write_text(
            json.dumps(
                {
                    "date": today_iso,
                    "total_active": len(records),
                    "by_type": by_type,
                    "contest_prize_usd": round(sum(r.prize_usd for r in records if r.challenge_type != "bug_bounty"), 2),
                    "new_count": new_count,
                    "prize_changes": prize_changes,
                    "deadline_changes": deadline_changes,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        cutoff = ref_today - timedelta(days=SNAPSHOT_RETENTION_DAYS)
        for snap in SNAPSHOT_DIR.glob("*.json"):
            d = _date_part(snap.stem)
            if d and d < cutoff:
                snap.unlink(missing_ok=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Snapshot write skipped: %s", exc)

    return {
        "new_challenges": new_count,
        "prize_changes": prize_changes,
        "deadline_changes": deadline_changes,
        "tracked_total": len(registry),
    }


def load_snapshots(limit: int = 60) -> List[Dict[str, Any]]:
    """Return the most recent daily snapshot summaries (oldest first) for trend charts."""
    if not SNAPSHOT_DIR.exists():
        return []
    snaps: List[Dict[str, Any]] = []
    for path in sorted(SNAPSHOT_DIR.glob("*.json"))[-limit:]:
        try:
            snaps.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            continue
    return snaps

