"""Normalisation helpers: dates, prizes -> USD, URL canonicalisation, taxonomy inference."""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timezone
from typing import Iterable, List, Optional, Tuple, Union
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from dateutil import parser as date_parser

from scraper.fx import get_fx_rates
from scraper.models import ChallengeRecord

ENDING_SOON_DAYS = 7

TRACKING_QUERY_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "source",
    "fbclid",
    "gclid",
}

CHALLENGE_TYPES = ("audit_contest", "bug_bounty", "ctf", "hackathon", "practice")

CURRENCY_ALIASES = {
    "$": "USD",
    "us$": "USD",
    "usd": "USD",
    "usdc": "USDC",
    "usdt": "USDT",
    "dai": "DAI",
    "usds": "USDS",
    "rlusd": "USDC",  # Ripple USD stablecoin ~ $1
    "pyusd": "PYUSD",
    "€": "EUR",
    "eur": "EUR",
    "£": "GBP",
    "gbp": "GBP",
    "₹": "INR",
    "inr": "INR",
    "eth": "ETH",
    "weth": "WETH",
    "btc": "BTC",
    "sol": "SOL",
    "op": "OP",
    "arb": "ARB",
    "near": "NEAR",
    "sui": "SUI",
    "apt": "APT",
    "matic": "MATIC",
    "pol": "POL",
    "avax": "AVAX",
    "strk": "STRK",
}

# ---------------------------------------------------------------------------
# Taxonomy: protocol domain (category) and ecosystem
# ---------------------------------------------------------------------------

# Keywords are matched with a left word boundary; a trailing "*" allows prefix matches
# (e.g. "perp*" matches "perpetual"), otherwise a right word boundary is enforced too.
CATEGORY_RULES: List[Tuple[str, List[str]]] = [
    ("Bridges & Cross-chain", ["bridge*", "cross-chain", "crosschain", "interop*", "layerzero", "ccip", "wormhole", "omnichain", "hyperlane"]),
    ("ZK & Cryptography", ["zk", "zkp", "zero-knowledge", "zero knowledge", "snark*", "stark", "starks", "plonk*", "circuit*", "circom", "halo2", "cryptograph*", "noir", "fhe", "mpc", "prover*"]),
    ("L1 / L2 Infrastructure", ["rollup*", "layer2", "layer 2", "layer-2", "l2", "l1", "sequencer*", "consensus", "op stack", "fault proof*", "chain launch", "execution client", "consensus client", "evm implementation", "geth", "reth", "hard fork", "network upgrade", "appchain*"]),
    ("Staking & Restaking", ["staking", "restaking", "liquid staking", "lst", "lsts", "lrt", "lrts", "eigen*", "delegat*"]),
    ("Stablecoins & RWA", ["stablecoin*", "stable coin*", "rwa", "rwas", "real world asset*", "real-world asset*", "depeg*", "cdp", "cdps", "tokenized treasur*"]),
    ("DEX & AMM", ["dex", "dexes", "amm", "amms", "swap*", "uniswap", "liquidity pool*", "concentrated liquidity", "orderbook*", "order book*", "clob", "v4 hook*"]),
    ("Perps & Derivatives", ["perp*", "derivative*", "options", "futures", "margin trading", "leverag*"]),
    ("Lending & Credit", ["lending", "borrow*", "loan*", "credit", "money market*", "collateral*", "liquidation*", "isolated market*", "morpho", "aave", "compound"]),
    ("Yield & Vaults", ["vault*", "yield*", "erc4626", "erc-4626", "aggregator*", "farm*"]),
    ("Wallets & Account Abstraction", ["wallet*", "account abstraction", "erc-4337", "erc4337", "smart account*", "multisig*", "passkey*"]),
    ("Governance & DAO", ["governance", "dao", "daos", "voting", "vetoken*", "ve-token*", "timelock*"]),
    ("NFTs, Gaming & Social", ["nft", "nfts", "erc721", "erc-721", "erc1155", "gaming", "game*", "socialfi", "metaverse", "marketplace*"]),
    ("Oracles & Data", ["oracle*", "price feed*", "chainlink", "pyth", "data feed*"]),
    ("AI & Agents", ["ai agent*", "agents", "agentic", "ai", "llm*", "machine learning"]),
    ("Payments & Infra Apps", ["payment*", "payroll", "streaming", "launchpad*", "token sale*", "airdrop*", "vesting"]),
]

DEFAULT_CATEGORY_BY_TYPE = {
    "audit_contest": "DeFi (General)",
    "bug_bounty": "DeFi (General)",
    "hackathon": "Web3 Building (General)",
    "ctf": "Cryptography & CTF",
    "practice": "DeFi (General)",
}

ECOSYSTEM_RULES: List[Tuple[str, List[str]]] = [
    ("Solana", ["solana", "anchor", "spl token*", "sealevel", "svm"]),
    ("Move (Sui / Aptos)", ["sui", "aptos", "movement labs", "move language", "move-based", "movevm"]),
    ("Starknet / Cairo", ["starknet", "cairo"]),
    ("Cosmos", ["cosmos", "cosmwasm", "cosmos-sdk", "cosmos sdk", "ibc", "thorchain", "osmosis", "injective", "sei network", "celestia"]),
    ("Stellar / Soroban", ["stellar", "soroban"]),
    ("Bitcoin", ["bitcoin", "btc", "babylon", "lightning network", "ordinals", "stacks", "clarity"]),
    ("TON", ["ton", "the open network", "tact lang*", "func contract*"]),
    ("NEAR", ["near protocol", "near intents"]),
    ("Polkadot / Substrate", ["polkadot", "substrate", "ink!", "kusama"]),
    ("XRP Ledger", ["xrp", "xrpl", "xrp ledger"]),
    ("Hyperliquid", ["hyperliquid", "hyperevm"]),
    ("Algorand", ["algorand", "pyteal"]),
    ("Cardano", ["cardano", "plutus", "aiken"]),
    ("EVM", ["solidity", "vyper", "evm", "ethereum", "arbitrum", "optimism", "polygon", "zksync", "linea", "scroll", "foundry", "hardhat", "erc20", "erc-20", "erc4626", "uniswap", "eth"]),
]

LANGUAGE_RULES: List[Tuple[str, List[str]]] = [
    ("Solidity", ["solidity", "foundry", "hardhat", "evm", "erc20", "erc-20"]),
    ("Vyper", ["vyper"]),
    ("Rust", ["rust", "anchor", "solana", "cosmwasm", "soroban", "substrate", "ink!", "near protocol"]),
    ("Move", ["move", "sui", "aptos"]),
    ("Cairo", ["cairo", "starknet"]),
    ("Go", ["golang", "cosmos-sdk", "cosmos sdk", "geth", "op-node", "op-geth"]),
    ("Circom / ZK DSL", ["circom", "noir", "halo2", "plonky*", "gnark", "zk circuit*"]),
    ("TypeScript", ["typescript", "javascript", "node.js"]),
    ("Python", ["python"]),
]

_PATTERN_CACHE: dict = {}

LANGUAGE_CANON = {
    "typescript": "TypeScript",
    "javascript": "TypeScript",
    "solidity": "Solidity",
    "vyper": "Vyper",
    "rust": "Rust",
    "move": "Move",
    "cairo": "Cairo",
    "go": "Go",
    "golang": "Go",
    "python": "Python",
    "circom": "Circom / ZK DSL",
    "noir": "Circom / ZK DSL",
    "c++": "C / C++",
    "c": "C / C++",
    "c/c++": "C / C++",
    "nextjs": "TypeScript",
    "reactjs": "TypeScript",
}


def _kw_pattern(keyword: str) -> "re.Pattern[str]":
    pat = _PATTERN_CACHE.get(keyword)
    if pat is None:
        if keyword.endswith("*"):
            body = re.escape(keyword[:-1])
            pat = re.compile(rf"(?<![a-z0-9]){body}")
        else:
            pat = re.compile(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])")
        _PATTERN_CACHE[keyword] = pat
    return pat


def _matches(hay: str, keywords: Iterable[str]) -> bool:
    return any(_kw_pattern(k).search(hay) for k in keywords)


def _haystack(*parts: Union[str, Iterable[str], None]) -> str:
    chunks: List[str] = []
    for p in parts:
        if not p:
            continue
        if isinstance(p, str):
            chunks.append(p)
        else:
            chunks.extend(str(x) for x in p)
    return f" {' '.join(chunks).lower()} "


def infer_category(title: str, description: str = "", tags: Iterable[str] = (), hint: str = "") -> Optional[str]:
    # Title/hint/tags are strong signals; only fall back to the description afterwards.
    strong = _haystack(hint, title, tags)
    for category, keywords in CATEGORY_RULES:
        if _matches(strong, keywords):
            return category
    weak = _haystack(description[:500])
    for category, keywords in CATEGORY_RULES:
        if _matches(weak, keywords):
            return category
    return None


def infer_ecosystem(title: str, description: str = "", tags: Iterable[str] = (), hint: str = "") -> Optional[str]:
    strong = _haystack(hint, title, tags)
    for eco, keywords in ECOSYSTEM_RULES:
        if _matches(strong, keywords):
            return eco
    weak = _haystack(description[:500])
    for eco, keywords in ECOSYSTEM_RULES:
        if _matches(weak, keywords):
            return eco
    return None


def infer_languages(title: str, description: str = "", tags: Iterable[str] = (), ecosystem: str = "") -> List[str]:
    hay = _haystack(title, tags, description[:500])
    langs = [lang for lang, keys in LANGUAGE_RULES if _matches(hay, keys)]
    if not langs:
        defaults = {
            "EVM": ["Solidity"],
            "Solana": ["Rust"],
            "Move (Sui / Aptos)": ["Move"],
            "Starknet / Cairo": ["Cairo"],
            "Cosmos": ["Go", "Rust"],
            "Stellar / Soroban": ["Rust"],
            "NEAR": ["Rust"],
            "Polkadot / Substrate": ["Rust"],
            "Hyperliquid": ["Solidity"],
        }
        langs = list(defaults.get(ecosystem, []))
    return langs[:4]


# ---------------------------------------------------------------------------
# URL / ID helpers
# ---------------------------------------------------------------------------


def canonicalize_url(url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return ""
    if not parsed.netloc:
        return ""
    query = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() not in TRACKING_QUERY_KEYS]
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path.rstrip("/") or "/"
    return urlunparse(("https", netloc, path, "", urlencode(query), ""))


def slugify_title(title: str) -> str:
    t = re.sub(r"[^a-z0-9]+", " ", (title or "").lower())
    t = re.sub(r"\b(audit|contest|competition|competitive|bug bounty|bounty|the|security|review)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def make_record_id(platform: str, title: str, url: str) -> str:
    raw = f"{platform}|{title}|{canonicalize_url(url)}".lower()
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]


# ---------------------------------------------------------------------------
# Prize parsing
# ---------------------------------------------------------------------------


def to_usd(amount: float, currency: str) -> float:
    rates = get_fx_rates()
    rate = rates.get((currency or "USD").upper(), 0.0)
    return round(float(amount) * rate, 2) if rate else 0.0


def format_usd_label(amount_usd: float) -> str:
    if amount_usd >= 1_000_000:
        return f"${amount_usd / 1_000_000:,.2f}M".replace(".00M", "M")
    if amount_usd >= 10_000:
        return f"${amount_usd / 1_000:,.0f}K"
    if amount_usd >= 1_000:
        return f"${amount_usd / 1_000:,.1f}K".replace(".0K", "K")
    return f"${amount_usd:,.0f}"


def format_prize(amount: float, currency: str) -> Tuple[str, float]:
    """Return (display label, usd value) for a numeric amount in some currency."""
    cur = (currency or "USD").upper()
    usd = to_usd(amount, cur)
    if cur in ("USD", "USDC", "USDT", "DAI", "USDS", "PYUSD"):
        label = format_usd_label(usd)
        if cur != "USD":
            label = f"{label} {cur}"
        return label, usd
    pretty_amount = f"{amount:,.2f}".rstrip("0").rstrip(".") if amount < 100 else f"{amount:,.0f}"
    return f"{pretty_amount} {cur}", usd


_AMOUNT_RE = re.compile(
    r"(?<![a-z0-9])(?P<pre>[$€£₹¥]|us\$|usdc|usdt|usd|dai)?\s?"
    r"(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?"
    r"(?P<mult>k|m|mm|million|thousand)?(?![a-z0-9])\s?(?:in\s)?"
    r"(?P<post>usdc|usdt|usd|dai|eth|weth|op|arb|sol|eur|gbp|inr|jpy|cny|rmb|sgd|chf|rlusd)?(?![a-z0-9])",
    re.IGNORECASE,
)

CURRENCY_ALIASES.update({"¥": "JPY", "jpy": "JPY", "cny": "CNY", "rmb": "CNY", "sgd": "SGD", "chf": "CHF"})


def _fallback_label(text: str) -> str:
    first = next((ln.strip(" -•*:") for ln in text.splitlines() if ln.strip(" -•*:")), "")
    if not first:
        return "Leaderboard / Non-cash"
    if len(first) > 42:
        return "Prizes (see page)"
    return first


def parse_prize(raw: Optional[Union[str, float, int]], default_currency: str = "USD") -> Tuple[str, float, str]:
    """Parse free-text prize strings into (label, usd, currency). Picks the largest amount."""
    if raw is None or raw == "":
        return "Leaderboard / Non-cash", 0.0, default_currency
    if isinstance(raw, (int, float)):
        label, usd = format_prize(float(raw), default_currency)
        return (label, usd, default_currency) if usd > 0 else ("Leaderboard / Non-cash", 0.0, default_currency)

    text = re.sub(r"<[^>]+>", "", str(raw)).replace("$$", "$")
    best_usd = 0.0
    best = ("", 0.0, default_currency)
    for m in _AMOUNT_RE.finditer(text):
        pre = (m.group("pre") or "").lower()
        post = (m.group("post") or "").lower()
        if not pre and not post:
            continue
        try:
            num = float(m.group("num").replace(",", ""))
        except ValueError:
            continue
        mult = (m.group("mult") or "").lower()
        if mult in ("k", "thousand"):
            num *= 1_000
        elif mult in ("m", "mm", "million"):
            num *= 1_000_000
        cur = CURRENCY_ALIASES.get(post) or CURRENCY_ALIASES.get(pre) or default_currency
        usd = to_usd(num, cur)
        if usd > best_usd:
            best_usd = usd
            label, _ = format_prize(num, cur)
            best = (label, usd, cur)
    if best_usd <= 0:
        return _fallback_label(text), 0.0, default_currency
    return best


# ---------------------------------------------------------------------------
# Dates & status
# ---------------------------------------------------------------------------


def parse_date(raw: Optional[Union[str, int, float]]) -> Optional[str]:
    """Return an ISO-8601 UTC timestamp string (YYYY-MM-DDTHH:MM:SSZ) or None."""
    if raw is None or raw == "":
        return None
    try:
        if isinstance(raw, (int, float)) or (isinstance(raw, str) and raw.strip().isdigit()):
            ts = float(raw)
            if ts > 1e12:  # milliseconds
                ts /= 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        else:
            dt = date_parser.parse(str(raw))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, OverflowError, TypeError):
        return None


def _to_dt(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = date_parser.parse(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, OverflowError):
        return None


def compute_days_remaining(end_iso: Optional[str], now: Optional[datetime] = None) -> Optional[int]:
    end = _to_dt(end_iso)
    if end is None:
        return None
    ref = now or datetime.now(timezone.utc)
    seconds = (end - ref).total_seconds()
    return int(seconds // 86400) if seconds >= 0 else -1


def resolve_status(
    start_iso: Optional[str],
    end_iso: Optional[str],
    raw_status: str = "",
    now: Optional[datetime] = None,
) -> Tuple[bool, str, Optional[int]]:
    """Return (is_active, status, days_remaining).

    status in {"active", "ending_soon", "upcoming", "ongoing"}; inactive records are dropped.
    """
    ref = now or datetime.now(timezone.utc)
    raw = (raw_status or "").lower()
    if raw in ("ended", "finished", "complete", "completed", "closed", "cancelled", "canceled", "past", "paused"):
        return False, "ended", None

    start = _to_dt(start_iso)
    end = _to_dt(end_iso)
    days = compute_days_remaining(end_iso, ref)

    if end is not None and end < ref:
        return False, "ended", days
    if start is not None and start > ref:
        return True, "upcoming", days
    if raw in ("upcoming", "created", "scheduled", "future", "registration"):
        return True, "upcoming", days
    if end is None:
        return True, "ongoing", None
    if days is not None and days <= ENDING_SOON_DAYS:
        return True, "ending_soon", days
    return True, "active", days


def infer_difficulty(challenge_type: str, prize_usd: float, title: str, description: str, nsloc: Optional[int] = None) -> str:
    hay = _haystack(title, description[:400])
    if challenge_type == "practice" or "first flight" in hay or "beginner" in hay:
        return "Beginner"
    if challenge_type == "hackathon":
        return "Intermediate"
    if _matches(hay, ("zk", "zkp", "circuit*", "consensus", "execution client", "cryptograph*", "fault proof*", "l1", "hard fork", "network upgrade")):
        return "Expert"
    if nsloc and nsloc > 4000:
        return "Expert"
    if challenge_type == "bug_bounty" and prize_usd >= 1_000_000:
        return "Expert"
    if prize_usd >= 100_000 or (nsloc and nsloc > 1500):
        return "Advanced"
    if prize_usd and prize_usd < 15_000:
        return "Beginner" if challenge_type == "audit_contest" and prize_usd < 5_000 else "Intermediate"
    return "Intermediate"


def clean_text(text: Optional[str], limit: int = 420) -> str:
    if not text:
        return ""
    t = re.sub(r"<[^>]+>", " ", str(text))
    t = re.sub(r"[#*_`>\[\]]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[: limit - 1] + "…" if len(t) > limit else t


def build_record(
    *,
    title: str,
    platform: str,
    source: str,
    url: str,
    challenge_type: str,
    prize: Optional[Union[str, float, int]] = None,
    prize_currency: str = "USD",
    start_date: Optional[Union[str, int, float]] = None,
    end_date: Optional[Union[str, int, float]] = None,
    raw_status: str = "",
    category: Optional[str] = None,
    ecosystem: Optional[str] = None,
    languages: Optional[List[str]] = None,
    tags: Optional[Iterable[str]] = None,
    description: str = "",
    organizer: str = "",
    difficulty: Optional[str] = None,
    kyc_required: Optional[bool] = None,
    participants_count: Optional[int] = None,
    findings_count: Optional[int] = None,
    repo_url: Optional[str] = None,
    logo_url: Optional[str] = None,
    nsloc: Optional[int] = None,
    category_hint: str = "",
    now: Optional[datetime] = None,
) -> Optional[ChallengeRecord]:
    """Normalise raw scraped fields into a ChallengeRecord, or None if inactive/invalid."""
    title = re.sub(r"\s+", " ", (title or "")).strip()
    if not title or not url:
        return None
    if challenge_type not in CHALLENGE_TYPES:
        challenge_type = "audit_contest"

    start_iso = parse_date(start_date)
    end_iso = parse_date(end_date)
    active, status, days = resolve_status(start_iso, end_iso, raw_status, now)
    if not active:
        return None
    if challenge_type in ("bug_bounty", "practice") and end_iso is None:
        status = "ongoing"

    label, usd, currency = parse_prize(prize, prize_currency)
    tag_list = [t.strip().lower() for t in (tags or []) if t and str(t).strip()]
    desc = clean_text(description)

    eco = ecosystem or infer_ecosystem(title, desc, tag_list, category_hint)
    if not eco:
        eco = "Multi-chain / General" if challenge_type in ("hackathon", "ctf") else "EVM"
    cat = category or infer_category(title, desc, tag_list, category_hint) or DEFAULT_CATEGORY_BY_TYPE[challenge_type]
    langs = languages if languages else infer_languages(title, desc, tag_list, eco)
    langs = list(dict.fromkeys(LANGUAGE_CANON.get(str(l).lower(), str(l)) for l in langs))[:4]

    return ChallengeRecord(
        id=make_record_id(platform, title, url),
        title=title,
        platform=platform,
        source=source,
        url=url,
        prize=label,
        prize_usd=usd,
        prize_currency=currency,
        prize_raw=str(prize) if prize is not None else "",
        start_date=start_iso,
        end_date=end_iso,
        days_remaining=days,
        status=status,
        challenge_type=challenge_type,
        category=cat,
        ecosystem=eco,
        languages=langs,
        tags=sorted(set(tag_list))[:10],
        description=desc,
        organizer=organizer or "",
        difficulty=difficulty or infer_difficulty(challenge_type, usd, title, desc, nsloc),
        kyc_required=kyc_required,
        participants_count=participants_count,
        findings_count=findings_count,
        repo_url=repo_url,
        logo_url=logo_url,
        scraped_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def refresh_status(rec: ChallengeRecord, now: Optional[datetime] = None) -> bool:
    """Recompute status/days for a cached record. Returns False if it has expired."""
    active, status, days = resolve_status(rec.start_date, rec.end_date, "", now)
    if not active:
        return False
    rec.status = "ongoing" if rec.challenge_type in ("bug_bounty", "practice") and not rec.end_date else status
    rec.days_remaining = days
    return True


def today_utc() -> date:
    return datetime.now(timezone.utc).date()
