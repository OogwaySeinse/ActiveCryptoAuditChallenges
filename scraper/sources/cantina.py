"""Cantina public competitions and bug bounties via the v0 JSON API."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from scraper.http import create_session, safe_get_json, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "cantina"
COMPETITIONS_URL = "https://cantina.xyz/api/v0/competitions"
BOUNTIES_URL = "https://cantina.xyz/api/v0/bounties"
LIVE = {"live": "", "upcoming": "upcoming", "scheduled": "upcoming", "registration": "upcoming"}


def _slim(item: Dict[str, Any]) -> Dict[str, Any]:
    slim = {k: v for k, v in item.items() if k not in ("instructions", "assetGroups")}
    slim["instructions"] = str(item.get("instructions") or "")[:600]
    return slim


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    comps = safe_get_json(session, COMPETITIONS_URL, timeout=40) or []
    bounties = safe_get_json(session, BOUNTIES_URL, timeout=40) or []
    if not isinstance(comps, list):
        comps = []
    if not isinstance(bounties, list):
        bounties = []

    live_items = [
        (_slim(i), kind)
        for items, kind in ((comps, "audit_contest"), (bounties, "bug_bounty"))
        for i in items
        if str(i.get("status", "")).lower() in LIVE and "private" not in str(i.get("kind", ""))
    ]
    save_source_cache(SOURCE_NAME, [dict(item, _type=kind) for item, kind in live_items])

    records: List[ChallengeRecord] = []
    for item, kind in live_items:
        company = item.get("company") or {}
        timeframe = item.get("timeframe") or {}
        currency = str(item.get("currencyCode") or "USDC")
        try:
            pot = float(item.get("totalRewardPot") or 0)
        except (TypeError, ValueError):
            pot = 0.0
        name = str(item.get("name") or company.get("name") or "Cantina Program")
        if kind == "bug_bounty" and "bounty" not in name.lower():
            name = f"{name} Bug Bounty"
        rec = build_record(
            title=name,
            platform="Cantina",
            source=SOURCE_NAME,
            url=str(item.get("url")),
            challenge_type=kind,
            prize=f"{pot} {currency}" if pot else None,
            prize_currency=currency,
            start_date=timeframe.get("start"),
            end_date=timeframe.get("end"),
            raw_status=LIVE.get(str(item.get("status")).lower(), ""),
            tags=["cantina", str(item.get("kind") or ""), "cantina-triaged" if item.get("cantinaTriaged") else ""],
            description=str(item.get("instructions") or ""),
            organizer=str(company.get("name") or ""),
            kyc_required=item.get("kycRequired"),
            findings_count=item.get("totalFindings"),
            logo_url=company.get("logo"),
        )
        if rec:
            records.append(rec)

    logger.info("Cantina yielded %d live competitions/bounties", len(records))
    return records

