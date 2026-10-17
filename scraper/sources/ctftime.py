"""CTFtime: live and upcoming online CTFs (cryptography / blockchain / pwn) for the next few weeks."""

from __future__ import annotations

import logging
import time
from typing import List

from scraper.http import create_session, safe_get_json, save_source_cache
from scraper.models import ChallengeRecord
from scraper.normalize import build_record

logger = logging.getLogger(__name__)

SOURCE_NAME = "ctftime"
API_URL = "https://ctftime.org/api/v1/events/"
LOOKAHEAD_DAYS = 21
LOOKBACK_DAYS = 7  # catch long-running CTFs that started recently
BLOCKCHAIN_HINTS = ("blockchain", "web3", "smart contract", "solidity", "ethereum", "defi", "evm", "cryptocurrency")


def scrape() -> List[ChallengeRecord]:
    session = create_session()
    now = int(time.time())
    events = safe_get_json(
        session,
        API_URL,
        params={"limit": 120, "start": now - LOOKBACK_DAYS * 86400, "finish": now + LOOKAHEAD_DAYS * 86400},
    )
    if not isinstance(events, list):
        return []
    save_source_cache(SOURCE_NAME, events)

    records: List[ChallengeRecord] = []
    for e in events:
        if e.get("onsite") or str(e.get("restrictions", "Open")).lower() not in ("open", ""):
            continue
        desc = str(e.get("description") or "")
        hay = f"{e.get('title', '')} {desc}".lower()
        has_web3 = any(h in hay for h in BLOCKCHAIN_HINTS)
        weight = float(e.get("weight") or 0)
        organizers = ", ".join(o.get("name", "") for o in (e.get("organizers") or []) if o.get("name"))
        tags = ["ctftime", str(e.get("format") or "jeopardy").lower(), "cryptography"]
        if has_web3:
            tags.append("blockchain")
        rec = build_record(
            title=str(e.get("title")),
            platform="CTFtime",
            source=SOURCE_NAME,
            url=str(e.get("ctftime_url") or e.get("url")),
            challenge_type="ctf",
            prize=e.get("prizes") or None,
            start_date=e.get("start"),
            end_date=e.get("finish"),
            category="Blockchain CTF" if has_web3 else "Cryptography & CTF",
            ecosystem="Multi-chain / General",
            languages=["Python", "Solidity"] if has_web3 else ["Python"],
            tags=tags,
            description=desc,
            organizer=organizers,
            difficulty="Advanced" if weight >= 50 else ("Intermediate" if weight >= 20 else "Beginner"),
            participants_count=e.get("participants") or None,
        )
        if rec:
            records.append(rec)

    logger.info("CTFtime yielded %d live/upcoming open CTFs", len(records))
    return records

