"""Immunefi bug bounties and audit competitions from the RSC page payloads."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from scraper.flight import decode_array_after, extract_flight_text, iter_objects_with_prefix
from scraper.http import create_session, safe_get, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "immunefi"
BOUNTIES_URL = "https://immunefi.com/bug-bounty/"
COMPETITIONS_URL = "https://immunefi.com/audit-competition/"
MIN_BOUNTY_USD = 10_000  # skip tiny programs to keep the index signal-rich
LIVE_COMP_STATUS = {"LIVE", "ACTIVE", "IN_PROGRESS", "ONGOING", "UPCOMING", "SCHEDULED", "PRE_LAUNCH"}

PROJECT_TYPE_HINTS = {
    "Bridge": "bridge",
    "Crosschain Liquidity": "cross-chain",
    "Lending": "lending",
    "DEX": "dex",
    "Staking": "staking",
    "Stablecoin": "stablecoin",
    "Derivatives": "derivatives",
    "Wallet": "wallet",
    "Oracle": "oracle",
}


def _hint(tags: Dict[str, Any]) -> str:
    parts: List[str] = []
    for key in ("productType", "projectType"):
        for v in tags.get(key) or []:
            parts.append(PROJECT_TYPE_HINTS.get(v, str(v)).lower())
    return " ".join(parts)


def _ecosystem(tags: Dict[str, Any], languages: List[str]) -> str | None:
    eco = [str(e).lower() for e in (tags.get("ecosystem") or [])]
    langs = [lang.lower() for lang in languages]
    if "solana" in eco or ("rust" in langs and not eco):
        return "Solana" if "solana" in eco else None
    for needle, label in (
        ("sui", "Move (Sui / Aptos)"),
        ("aptos", "Move (Sui / Aptos)"),
        ("starknet", "Starknet / Cairo"),
        ("cosmos", "Cosmos"),
        ("stellar", "Stellar / Soroban"),
        ("near", "NEAR"),
        ("ton", "TON"),
        ("bitcoin", "Bitcoin"),
        ("polkadot", "Polkadot / Substrate"),
        ("hyperliquid", "Hyperliquid"),
    ):
        if needle in eco and len(eco) <= 3:
            return label
    if len(eco) > 3 or any(e in eco for e in ("eth", "arbitrum", "base", "optimism", "polygon", "bsc")):
        return "EVM"
    return None


def _record_from_program(p: Dict[str, Any], kind: str) -> ChallengeRecord | None:
    tags = p.get("tags") or {}
    languages = [str(x) for x in (tags.get("language") or [])][:4]
    project = str(p.get("project") or p.get("slug") or "").replace("Audit Comp | ", "").strip()
    general = [str(g).lower() for g in (tags.get("general") or [])]
    program_types = [str(t).lower() for t in (tags.get("programType") or [])]

    if kind == "bug_bounty":
        max_bounty = float(p.get("maxBounty") or 0)
        if max_bounty < MIN_BOUNTY_USD or p.get("pausedAt") or p.get("inviteOnly"):
            return None
        title = f"{project} Bug Bounty"
        prize = max_bounty
        start, end, raw_status = p.get("launchDate"), None, ""
        desc = (
            f"Up to ${max_bounty:,.0f} for critical findings. "
            f"Scope: {', '.join(tags.get('programType') or ['Smart Contract'])}. "
            f"{'PoC required. ' if p.get('proofOfConceptType') == 'required' else ''}"
            f"{'Triaged by Immunefi.' if p.get('premiumTriaging') else ''}"
        )
    else:
        status = str(p.get("auditCompetitionStatus") or "").upper()
        if status and status not in LIVE_COMP_STATUS:
            return None
        title = f"{project} Audit Competition"
        prize = float(p.get("rewardsPool") or p.get("maxBounty") or 0)
        start, end = p.get("launchDate"), p.get("endDate")
        raw_status = "upcoming" if status in ("UPCOMING", "SCHEDULED", "PRE_LAUNCH") else ""
        desc = f"Immunefi audit competition for {project} with a ${prize:,.0f} rewards pool."

    return build_record(
        title=title,
        platform="Immunefi",
        source=SOURCE_NAME,
        url=f"https://immunefi.com{p.get('url') or ''}",
        challenge_type=kind,
        prize=prize or None,
        prize_currency="USD",
        start_date=start,
        end_date=end,
        raw_status=raw_status,
        ecosystem=_ecosystem(tags, languages),
        languages=languages or None,
        tags=["immunefi", *program_types, *(t for t in general if t in ("poc required", "kyc required", "safe harbor"))],
        description=desc,
        organizer=project,
        kyc_required=p.get("kyc"),
        logo_url=p.get("logo"),
        category_hint=_hint(tags),
    )


def _programs(html: str, marker: str) -> List[Dict[str, Any]]:
    flight = extract_flight_text(html)
    items = decode_array_after(flight, marker)
    if not items:
        items = list(iter_objects_with_prefix(flight, '{"contentfulId"'))
    return [i for i in items if isinstance(i, dict)]


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    records: List[ChallengeRecord] = []
    cache: Dict[str, Any] = {}

    resp = safe_get(session, BOUNTIES_URL, timeout=40)
    if resp is not None:
        bounties = _programs(resp.text, '"bounties":')
        cache["bounties"] = [
            {k: b.get(k) for k in ("slug", "project", "maxBounty", "launchDate", "kyc", "tags", "url", "pausedAt")}
            for b in bounties
        ]
        for b in bounties:
            rec = _record_from_program(b, "bug_bounty")
            if rec:
                records.append(rec)

    resp = safe_get(session, COMPETITIONS_URL, timeout=40)
    if resp is not None:
        comps = [c for c in _programs(resp.text, '"competitions":') if "auditCompetitionStatus" in c or "rewardsPool" in c]
        cache["competitions"] = [
            {k: c.get(k) for k in ("slug", "project", "rewardsPool", "launchDate", "endDate", "auditCompetitionStatus", "url")}
            for c in comps
        ]
        for c in comps:
            rec = _record_from_program(c, "audit_contest")
            if rec:
                records.append(rec)

    save_source_cache(SOURCE_NAME, cache)
    logger.info("Immunefi yielded %d bounties/competitions", len(records))
    return records

