"""Sherlock audit contests & public bug bounties via the public contests API."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from scraper.http import create_session, safe_get_json, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "sherlock"
API_URL = "https://audits.sherlock.xyz/api/contests"
LIVE_STATUSES = {"CREATED": "upcoming", "RUNNING": "", "SCHEDULED": "upcoming"}
MAX_PAGES = 40


def _fetch_by_status(session, status: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for page in range(1, 6):
        data = safe_get_json(session, API_URL, params={"status": status, "page": page})
        if not isinstance(data, dict):
            break
        batch = data.get("items") or []
        items.extend(batch)
        if not data.get("has_next"):
            break
    return items


def _fetch_all(session) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        data = safe_get_json(session, API_URL, params={"page": page}, delay=0.15)
        if not isinstance(data, dict):
            break
        items.extend(data.get("items") or [])
        if not data.get("has_next"):
            break
    return items


def scrape() -> List[ChallengeRecord]:
    session = create_session()

    raw: List[Dict[str, Any]] = []
    for status in LIVE_STATUSES:
        raw.extend(_fetch_by_status(session, status))
    # If the server ignored the status filter, finished contests leak in -> scan everything instead.
    if any(str(i.get("status")).upper() not in LIVE_STATUSES for i in raw) or not raw:
        raw = [i for i in _fetch_all(session) if str(i.get("status")).upper() in LIVE_STATUSES]

    seen = set()
    unique = []
    for item in raw:
        if item.get("id") in seen:
            continue
        seen.add(item.get("id"))
        unique.append(item)
    save_source_cache(SOURCE_NAME, unique)

    records: List[ChallengeRecord] = []
    for c in unique:
        if c.get("private"):
            continue
        type_label = str(c.get("type_label") or "Public")
        is_bounty = "bounty" in type_label.lower()
        amount = c.get("rewards") or c.get("prize_pool") or 0
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            amount = 0.0
        token = str(c.get("token") or "USDC")
        rec = build_record(
            title=str(c.get("title")),
            platform="Sherlock",
            source=SOURCE_NAME,
            url=f"https://audits.sherlock.xyz/contests/{c.get('id')}",
            challenge_type="bug_bounty" if is_bounty else "audit_contest",
            prize=f"{amount} {token}",
            prize_currency=token,
            start_date=c.get("starts_at"),
            end_date=c.get("ends_at"),
            raw_status=LIVE_STATUSES.get(str(c.get("status")).upper(), ""),
            tags=["sherlock", type_label.lower(), "best-efforts" if c.get("is_best_efforts") else "fixed-pool"],
            description=str(c.get("short_description") or c.get("description") or ""),
            organizer=str(c.get("title")),
            logo_url=c.get("logo_url"),
        )
        if rec:
            records.append(rec)

    logger.info("Sherlock yielded %d live/upcoming contests", len(records))
    return records

