"""Devpost: open & upcoming Blockchain-themed hackathons via the public hackathons API."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import List, Optional, Tuple

from scraper.http import create_session, safe_get_json, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "devpost"
API_URL = "https://devpost.com/api/hackathons"
MAX_PAGES = 6

_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"


def parse_submission_period(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse Devpost ranges such as 'Oct 05 - 25, 2026', 'Sep 20 - Nov 05, 2026', 'Dec 20, 2026 - Jan 10, 2027'."""
    if not text:
        return None, None
    t = re.sub(r"\s+", " ", text.strip())
    m = re.match(rf"(?i)({_MONTHS})\w* (\d{{1,2}})(?:, (\d{{4}}))? - (?:({_MONTHS})\w* )?(\d{{1,2}}), (\d{{4}})", t)
    if not m:
        return None, None
    m1, d1, y1, m2, d2, y2 = m.groups()
    y2i = int(y2)
    m2 = m2 or m1
    y1i = int(y1) if y1 else y2i
    try:
        start = datetime.strptime(f"{m1[:3]} {d1} {y1i}", "%b %d %Y")
        end = datetime.strptime(f"{m2[:3]} {d2} {y2i}", "%b %d %Y")
        if start > end and not y1:
            start = start.replace(year=y2i - 1)
        return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%dT23:59:00Z")
    except ValueError:
        return None, None


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    hackathons = []
    for page in range(1, MAX_PAGES + 1):
        data = safe_get_json(
            session,
            API_URL,
            params=[("status[]", "open"), ("status[]", "upcoming"), ("themes[]", "Blockchain"), ("page", page)],
        )
        if not isinstance(data, dict):
            break
        batch = data.get("hackathons") or []
        hackathons.extend(batch)
        total = (data.get("meta") or {}).get("total_count") or 0
        if not batch or len(hackathons) >= total:
            break
    save_source_cache(SOURCE_NAME, hackathons)

    records: List[ChallengeRecord] = []
    for h in hackathons:
        if h.get("invite_only"):
            continue
        start, end = parse_submission_period(str(h.get("submission_period_dates") or ""))
        themes = [t.get("name", "") for t in (h.get("themes") or []) if isinstance(t, dict)]
        location = (h.get("displayed_location") or {}).get("location", "Online")
        rec = build_record(
            title=str(h.get("title")),
            platform="Devpost",
            source=SOURCE_NAME,
            url=str(h.get("url")),
            challenge_type="hackathon",
            prize=h.get("prize_amount"),
            start_date=start,
            end_date=end,
            raw_status="upcoming" if h.get("open_state") == "upcoming" else "",
            ecosystem=None,
            tags=["devpost", "hackathon", *[t.lower() for t in themes], str(location).lower()],
            description=f"{h.get('organization_name') or 'Devpost'} hackathon · {location} · themes: {', '.join(themes)}.",
            organizer=str(h.get("organization_name") or ""),
            participants_count=h.get("registrations_count") or None,
            logo_url=("https:" + h["thumbnail_url"]) if str(h.get("thumbnail_url", "")).startswith("//") else h.get("thumbnail_url"),
            category_hint=" ".join(themes),
        )
        if rec:
            records.append(rec)

    logger.info("Devpost yielded %d blockchain hackathons", len(records))
    return records

