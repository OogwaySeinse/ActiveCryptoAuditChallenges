from __future__ import annotations

from typing import Callable, Dict, List

from scraper.models import ChallengeRecord
from scraper.sources import (
    cantina,
    code4rena,
    codehawks,
    ctftime,
    curated,
    devpost,
    ethglobal,
    immunefi,
    sherlock,
)

ScraperFn = Callable[[], List[ChallengeRecord]]

ALL_SCRAPERS: Dict[str, ScraperFn] = {
    "code4rena": code4rena.scrape,
    "sherlock": sherlock.scrape,
    "cantina": cantina.scrape,
    "codehawks": codehawks.scrape,
    "immunefi": immunefi.scrape,
    "ethglobal": ethglobal.scrape,
    "devpost": devpost.scrape,
    "ctftime": ctftime.scrape,
    "curated": curated.scrape,
}

