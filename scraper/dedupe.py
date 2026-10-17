from __future__ import annotations

from typing import Dict, List

from rapidfuzz import fuzz

from scraper.models import ChallengeRecord
from scraper.normalize import canonicalize_url, slugify_title

SOURCE_PRIORITY: Dict[str, int] = {
    "code4rena": 100,
    "sherlock": 99,
    "cantina": 98,
    "codehawks": 97,
    "immunefi": 96,
    "hackenproof": 90,
    "ethglobal": 88,
    "devpost": 84,
    "ctftime": 80,
    "curated": 70,
}


def _completeness_score(rec: ChallengeRecord) -> float:
    score = float(SOURCE_PRIORITY.get(rec.source, 50))
    if rec.prize_usd > 0:
        score += 15.0
    if rec.end_date:
        score += 10.0
    if rec.description:
        score += min(len(rec.description) / 50.0, 8.0)
    if rec.tags:
        score += min(len(rec.tags) * 1.5, 6.0)
    if rec.repo_url:
        score += 3.0
    return score


def merge_two(primary: ChallengeRecord, secondary: ChallengeRecord) -> ChallengeRecord:
    """Merge metadata from secondary into primary without overwriting richer fields."""
    if _completeness_score(secondary) > _completeness_score(primary):
        primary, secondary = secondary, primary

    if primary.prize_usd <= 0 < secondary.prize_usd:
        primary.prize = secondary.prize
        primary.prize_usd = secondary.prize_usd
        primary.prize_currency = secondary.prize_currency
        primary.prize_raw = secondary.prize_raw
    if not primary.start_date and secondary.start_date:
        primary.start_date = secondary.start_date
    if not primary.end_date and secondary.end_date:
        primary.end_date = secondary.end_date
        primary.days_remaining = secondary.days_remaining
        primary.status = secondary.status
    if len(secondary.description or "") > len(primary.description or ""):
        primary.description = secondary.description
    for attr in ("repo_url", "logo_url", "participants_count", "findings_count", "kyc_required"):
        if getattr(primary, attr) in (None, "") and getattr(secondary, attr) not in (None, ""):
            setattr(primary, attr, getattr(secondary, attr))
    primary.languages = list(dict.fromkeys((primary.languages or []) + (secondary.languages or [])))[:4]
    primary.tags = sorted(set(primary.tags or []) | set(secondary.tags or []))[:10]
    return primary


def deduplicate_records(records: List[ChallengeRecord], fuzzy_threshold: float = 92.0) -> List[ChallengeRecord]:
    """Deduplicate by canonical URL first, then by (platform, fuzzy title similarity)."""
    by_url: Dict[str, ChallengeRecord] = {}
    no_url: List[ChallengeRecord] = []
    for rec in records:
        canon = canonicalize_url(rec.url)
        if not canon:
            no_url.append(rec)
        elif canon in by_url:
            by_url[canon] = merge_two(by_url[canon], rec)
        else:
            by_url[canon] = rec

    deduped: List[ChallengeRecord] = []
    for candidate in list(by_url.values()) + no_url:
        cand_slug = slugify_title(candidate.title)
        matched_idx = None
        for idx, existing in enumerate(deduped):
            exist_slug = slugify_title(existing.title)
            if not cand_slug or not exist_slug:
                continue
            same_platform = existing.platform.lower() == candidate.platform.lower()
            same_type = existing.challenge_type == candidate.challenge_type
            if same_platform and same_type and cand_slug == exist_slug:
                matched_idx = idx
                break
            ratio = fuzz.token_set_ratio(cand_slug, exist_slug)
            if same_platform and same_type and ratio >= fuzzy_threshold and existing.end_date == candidate.end_date:
                matched_idx = idx
                break
        if matched_idx is not None:
            deduped[matched_idx] = merge_two(deduped[matched_idx], candidate)
        else:
            deduped.append(candidate)
    return deduped

