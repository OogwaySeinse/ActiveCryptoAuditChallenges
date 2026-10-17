from __future__ import annotations

import argparse
import logging
import sys

from scraper.pipeline import run_pipeline
from scraper.sources import ALL_SCRAPERS


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scrape and normalise live crypto audit contests, bug bounties, CTFs and Web3 hackathons."
    )
    parser.add_argument("--only", nargs="*", choices=sorted(ALL_SCRAPERS.keys()), help="Run a subset of sources.")
    parser.add_argument("--min-records", type=int, default=1, help="Minimum active records required for exit code 0.")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    payload = run_pipeline(selected_sources=args.only)
    meta = payload["metadata"]
    logging.info(
        "Pipeline complete: %d active challenges (%s) | contest pools $%s | max bounty $%s",
        meta["total_active"],
        ", ".join(f"{k}={v}" for k, v in meta["by_type"].items()),
        f"{meta['contest_prize_usd']:,.0f}",
        f"{meta['max_bounty_usd']:,.0f}",
    )
    if meta["total_active"] < args.min_records:
        logging.error("Active challenges (%d) below minimum threshold (%d)", meta["total_active"], args.min_records)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

