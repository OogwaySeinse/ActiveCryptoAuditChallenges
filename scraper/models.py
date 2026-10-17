from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ChallengeRecord:
    """Canonical representation of an active crypto / Web3 security challenge."""

    id: str
    title: str
    platform: str
    source: str
    url: str
    prize: str = "Leaderboard / Non-cash"
    prize_usd: float = 0.0
    prize_currency: str = "USD"
    prize_raw: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days_remaining: Optional[int] = None
    status: str = "active"  # active | ending_soon | upcoming | judging | ongoing
    # audit_contest | bug_bounty | ctf | hackathon | practice
    challenge_type: str = "audit_contest"
    category: str = "DeFi & Lending"
    ecosystem: str = "EVM"
    languages: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    description: str = ""
    organizer: str = ""
    difficulty: str = "Intermediate"
    kyc_required: Optional[bool] = None
    participants_count: Optional[int] = None
    findings_count: Optional[int] = None
    repo_url: Optional[str] = None
    logo_url: Optional[str] = None
    first_seen_at: Optional[str] = None
    is_new: bool = False
    prize_delta_usd: float = 0.0
    days_shift: int = 0
    scraped_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SourceStatus:
    """Status telemetry for a single scraper source."""

    name: str
    status: str  # "ok", "cached", "degraded", "error"
    count: int = 0
    duration_ms: int = 0
    error: Optional[str] = None
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

