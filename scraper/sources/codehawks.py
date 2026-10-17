"""Cyfrin CodeHawks competitive audits & First Flights from the SvelteKit-embedded tRPC payload."""

from __future__ import annotations

import html as html_lib
import json
import logging
import re
from typing import Any, Dict, List

from scraper.http import create_session, safe_get, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "codehawks"
CONTESTS_URL = "https://codehawks.cyfrin.io/contests"
_SCRIPT_RE = re.compile(
    r'<script type="application/json" data-sveltekit-fetched data-url="([^"]*competitions[^"]*)"[^>]*>(.*?)</script>',
    re.S,
)


def _unwrap(node: Any) -> Any:
    if isinstance(node, dict) and "json" in node and len(node) <= 2:
        return node["json"]
    return node


def extract_competitions(page_html: str) -> List[Dict[str, Any]]:
    comps: List[Dict[str, Any]] = []
    for data_url, payload in _SCRIPT_RE.findall(page_html or ""):
        try:
            outer = json.loads(html_lib.unescape(payload))
            body = json.loads(outer.get("body") or "[]")
        except (json.JSONDecodeError, AttributeError):
            continue
        for entry in body if isinstance(body, list) else [body]:
            data = _unwrap(((entry or {}).get("result") or {}).get("data"))
            if isinstance(data, list):
                comps.extend(d for d in data if isinstance(d, dict) and d.get("urlSlug"))
    return comps


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    resp = safe_get(session, CONTESTS_URL, timeout=40)
    if resp is None:
        return []
    comps = extract_competitions(resp.text)
    live = [c for c in comps if not c.get("finalised")]
    save_source_cache(SOURCE_NAME, live)

    records: List[ChallengeRecord] = []
    for c in live:
        if c.get("inviteOnly"):
            continue
        currency = str(c.get("currency") or "usdc").upper()
        reward = c.get("reward") or 0
        first_flight = str(c.get("firstFlightType") or "NONE").upper() != "NONE"
        tags = [t.strip() for t in str(c.get("protocolTags") or "").split(",") if t.strip()]
        rec = build_record(
            title=str(c.get("name")),
            platform="CodeHawks",
            source=SOURCE_NAME,
            url=f"https://codehawks.cyfrin.io/c/{c['urlSlug']}",
            challenge_type="audit_contest",
            prize=f"{reward} {currency}" if reward else None,
            prize_currency=currency,
            start_date=c.get("startDate"),
            end_date=c.get("endDate"),
            tags=["codehawks", "first-flight" if first_flight else "competitive-audit", *tags],
            description=f"{c.get('company') or 'Cyfrin'} competitive audit · {c.get('nsloc') or '?'} nSLOC in scope."
            + (" First Flight — beginner-friendly, XP-focused." if first_flight else ""),
            organizer=str(c.get("company") or ""),
            difficulty="Beginner" if first_flight else None,
            kyc_required=c.get("requiresKyc") or c.get("kycRewards"),
            repo_url=c.get("githubUrl"),
            nsloc=c.get("nsloc"),
        )
        if rec:
            records.append(rec)

    logger.info("CodeHawks yielded %d live/upcoming audits", len(records))
    return records

