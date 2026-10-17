"""Live & cached FX + crypto token rates (base USD).

Audit contests are frequently paid in USDC, but some pools are denominated in ETH,
OP, ARB, etc. We fetch fiat FX from open.er-api.com and token spot prices from the
public CoinGecko simple-price endpoint, falling back to conservative constants.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict

import requests

logger = logging.getLogger(__name__)

CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "cache" / "fx_rates.json"
CACHE_TTL_SECONDS = 86400  # 24 hours

# USD value of 1 unit of each currency / token (fallbacks only)
FALLBACK_TO_USD: Dict[str, float] = {
    "USD": 1.0,
    "USDC": 1.0,
    "USDT": 1.0,
    "DAI": 1.0,
    "USDS": 1.0,
    "PYUSD": 1.0,
    "EUR": 1.09,
    "GBP": 1.28,
    "INR": 0.012,
    "CNY": 0.14,
    "JPY": 0.0066,
    "SGD": 0.75,
    "CHF": 1.13,
    "ETH": 3000.0,
    "WETH": 3000.0,
    "BTC": 60000.0,
    "SOL": 150.0,
    "OP": 1.5,
    "ARB": 0.6,
    "NEAR": 3.0,
    "SUI": 2.0,
    "APT": 6.0,
    "MATIC": 0.5,
    "POL": 0.5,
    "AVAX": 25.0,
    "STRK": 0.4,
}

COINGECKO_IDS = {
    "ETH": "ethereum",
    "WETH": "weth",
    "BTC": "bitcoin",
    "SOL": "solana",
    "OP": "optimism",
    "ARB": "arbitrum",
    "NEAR": "near",
    "SUI": "sui",
    "APT": "aptos",
    "POL": "polygon-ecosystem-token",
    "AVAX": "avalanche-2",
    "STRK": "starknet",
}

_MEMO_RATES: Dict[str, float] | None = None


def get_fx_rates(refresh: bool = False) -> Dict[str, float]:
    """Return mapping of currency/token code -> USD value of one unit."""
    global _MEMO_RATES
    if _MEMO_RATES is not None and not refresh:
        return _MEMO_RATES

    if not refresh and CACHE_PATH.exists():
        try:
            if (time.time() - CACHE_PATH.stat().st_mtime) < CACHE_TTL_SECONDS:
                data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
                if isinstance(data, dict) and "USD" in data:
                    merged = dict(FALLBACK_TO_USD)
                    merged.update({k: float(v) for k, v in data.items()})
                    _MEMO_RATES = merged
                    return merged
        except Exception as exc:  # noqa: BLE001
            logger.debug("FX cache read failed: %s", exc)

    rates = dict(FALLBACK_TO_USD)
    fetched = False
    try:
        resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=8)
        if resp.status_code == 200:
            for code, units_per_usd in (resp.json().get("rates") or {}).items():
                try:
                    val = float(units_per_usd)
                    if val > 0:
                        rates[code.upper()] = round(1.0 / val, 6)
                except (TypeError, ValueError):
                    continue
            fetched = True
    except Exception as exc:  # noqa: BLE001
        logger.debug("Live FX fetch failed (using fallback): %s", exc)

    try:
        ids = ",".join(sorted(set(COINGECKO_IDS.values())))
        resp = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": ids, "vs_currencies": "usd"},
            timeout=8,
        )
        if resp.status_code == 200:
            prices = resp.json()
            for sym, cg_id in COINGECKO_IDS.items():
                usd = (prices.get(cg_id) or {}).get("usd")
                if usd:
                    rates[sym] = float(usd)
            fetched = True
    except Exception as exc:  # noqa: BLE001
        logger.debug("Live token price fetch failed (using fallback): %s", exc)

    for stable in ("USDC", "USDT", "DAI", "USDS", "PYUSD"):
        rates[stable] = 1.0
    rates["RMB"] = rates.get("CNY", 0.14)
    rates["MATIC"] = rates.get("POL", rates.get("MATIC", 0.5))

    if fetched:
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CACHE_PATH.write_text(json.dumps(rates, indent=2, sort_keys=True), encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            logger.debug("FX cache write failed: %s", exc)

    _MEMO_RATES = rates
    return rates

