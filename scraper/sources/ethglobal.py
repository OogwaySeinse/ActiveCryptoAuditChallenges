"""ETHGlobal: upcoming & live hackathons parsed from the /events RSC payload."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from scraper.flight import extract_flight_text
from scraper.http import create_session, safe_get, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "ethglobal"
EVENTS_URL = "https://ethglobal.com/events"
LIVE_STATUSES = {"future", "upcoming", "live", "ongoing", "active", "in_progress"}


def extract_events(html: str) -> List[Dict[str, Any]]:
    flight = extract_flight_text(html)
    idx = flight.find('{"events":[')
    if idx < 0:
        return []
    try:
        obj, _ = json.JSONDecoder().raw_decode(flight, idx)
        return [e for e in obj.get("events", []) if isinstance(e, dict)]
    except json.JSONDecodeError:
        return []


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    resp = safe_get(session, EVENTS_URL, timeout=40)
    if resp is None:
        return []
    events = [
        e
        for e in extract_events(resp.text)
        if e.get("type") == "hackathon" and str(e.get("status", "")).lower() in LIVE_STATUSES
    ]
    save_source_cache(
        SOURCE_NAME,
        [{k: e.get(k) for k in ("name", "slug", "medium", "startTime", "endTime", "status", "tagline", "city")} for e in events],
    )

    records: List[ChallengeRecord] = []
    for e in events:
        city = e.get("city") or {}
        city_name = city.get("name") if isinstance(city, dict) else None
        medium = str(e.get("medium") or "virtual")
        where = f"{city_name} (in-person)" if medium == "physical" and city_name else ("In-person" if medium == "physical" else "Online")
        rec = build_record(
            title=str(e.get("name")),
            platform="ETHGlobal",
            source=SOURCE_NAME,
            url=f"https://ethglobal.com/events/{e.get('slug')}",
            challenge_type="hackathon",
            prize="Sponsor prize pool",
            start_date=e.get("startTime"),
            end_date=e.get("endTime"),
            raw_status="upcoming" if str(e.get("status")).lower() == "future" else "",
            ecosystem="EVM",
            languages=["Solidity", "TypeScript"],
            tags=["ethglobal", "hackathon", medium, "ethereum"],
            description=(e.get("tagline") or f"ETHGlobal {medium} hackathon") + f" · {where}. Apply as a hacker to join.",
            organizer="ETHGlobal",
            difficulty="Intermediate",
        )
        if rec:
            records.append(rec)

    logger.info("ETHGlobal yielded %d upcoming/live hackathons", len(records))
    return records
