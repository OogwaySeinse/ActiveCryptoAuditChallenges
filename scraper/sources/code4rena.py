"""Code4rena competitive audits (Active + Upcoming) parsed from the /audits RSC payload."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from scraper.flight import extract_flight_text, iter_objects_with_prefix, parse_rows, resolve
from scraper.http import create_session, safe_get, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "code4rena"
AUDITS_URL = "https://code4rena.com/audits"
LIVE_BUCKETS = ("Active", "Upcoming")

LEAGUE_ECOSYSTEM = {
    "evm": "EVM",
    "solana": "Solana",
    "svm": "Solana",
    "cosmos": "Cosmos",
    "stellar": "Stellar / Soroban",
    "move": "Move (Sui / Aptos)",
    "sui": "Move (Sui / Aptos)",
    "aptos": "Move (Sui / Aptos)",
    "starknet": "Starknet / Cairo",
    "hyperliquid": "Hyperliquid",
    "zk": "EVM",
    "bitcoin": "Bitcoin",
    "near": "NEAR",
    "polkadot": "Polkadot / Substrate",
    "ton": "TON",
}


def _extract_live_contests(html: str) -> List[Dict[str, Any]]:
    flight = extract_flight_text(html)
    rows = parse_rows(flight)
    contests: List[Dict[str, Any]] = []

    # Preferred: the {"Active": "$15", "Upcoming": "$16", ...} bucket map
    for value in rows.values():
        if isinstance(value, dict) and "Active" in value and "Upcoming" in value:
            for bucket in LIVE_BUCKETS:
                items = resolve(value.get(bucket), rows)
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict) and it.get("slug"):
                            it["_bucket"] = bucket
                            contests.append(it)
            return contests

    # Fallback: scan all contest objects and keep those flagged active/upcoming
    for obj in iter_objects_with_prefix(flight, '{"auditType"'):
        status = str(obj.get("status", ""))
        if status in LIVE_BUCKETS:
            obj = resolve(obj, rows)
            obj["_bucket"] = status
            contests.append(obj)
    return contests


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    resp = safe_get(session, AUDITS_URL)
    if resp is None:
        return []

    raw = _extract_live_contests(resp.text)
    save_source_cache(SOURCE_NAME, raw)

    records: List[ChallengeRecord] = []
    for c in raw:
        org = c.get("org") if isinstance(c.get("org"), dict) else {}
        league = str(c.get("league") or "")
        audit_type = str(c.get("auditType") or "Audit")
        title = str(c.get("title") or c.get("slug"))
        if audit_type and audit_type.lower() not in ("audit",):
            title = f"{title} ({audit_type})"
        rec = build_record(
            title=title,
            platform="Code4rena",
            source=SOURCE_NAME,
            url=f"https://code4rena.com/audits/{c['slug']}",
            challenge_type="audit_contest",
            prize=c.get("formattedAmount"),
            prize_currency="USDC",
            start_date=c.get("startTime"),
            end_date=c.get("endTime"),
            raw_status="upcoming" if c.get("_bucket") == "Upcoming" else "",
            ecosystem=LEAGUE_ECOSYSTEM.get(league.lower()) if league else None,
            tags=["code4rena", league.lower() or "evm", audit_type.lower(), str(c.get("codeAccess") or "")],
            description=str(c.get("details") or ""),
            organizer=str(org.get("name") or title),
            repo_url=c.get("repo"),
            logo_url=org.get("image"),
            category_hint=league,
        )
        if rec:
            records.append(rec)

    logger.info("Code4rena yielded %d live/upcoming audits", len(records))
    return records

