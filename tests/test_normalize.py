from datetime import datetime, timezone

import pytest

from scraper import fx
from scraper.normalize import (
    build_record,
    canonicalize_url,
    infer_category,
    infer_ecosystem,
    infer_languages,
    parse_date,
    parse_prize,
    resolve_status,
)

NOW = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def fixed_fx(monkeypatch):
    rates = dict(fx.FALLBACK_TO_USD)
    rates.update({"ETH": 3000.0, "OP": 1.5, "INR": 0.012})
    monkeypatch.setattr(fx, "_MEMO_RATES", rates)


@pytest.mark.parametrize(
    "raw,currency,label,usd",
    [
        ("$$135,000 in USDC", "USDC", "$135K USDC", 135000.0),
        ("50000 USDC", "USDC", "$50K USDC", 50000.0),
        ("7.25 ETH", "ETH", "7.25 ETH", 21750.0),
        ("$<span data-currency-value>3,000</span>", "USD", "$3K", 3000.0),
        ("1st Place - $300\r\n2nd Place - $200", "USD", "$300", 300.0),
        ("- 1st Place: 15,000 INR\n- 2nd Place: 9,000 INR", "INR", "15,000 INR", 180.0),
    ],
)
def test_parse_prize_amounts(raw, currency, label, usd):
    got_label, got_usd, got_cur = parse_prize(raw, "USD")
    assert got_cur == currency
    assert got_label == label
    assert got_usd == pytest.approx(usd)


def test_parse_prize_ignores_words_that_look_like_tokens():
    # "Top 5 Open teams" must not be parsed as "5 OP"
    label, usd, _ = parse_prize("Top 5 Open teams qualify for finals")
    assert usd == 0.0
    assert label == "Top 5 Open teams qualify for finals"


def test_parse_prize_long_free_text_fallback():
    label, usd, _ = parse_prize("Eligible teams will qualify for the on-site finals, which are held in Nanjing")
    assert usd == 0.0
    assert label == "Prizes (see page)"


def test_parse_date_handles_epoch_and_iso():
    assert parse_date(1760367600) == "2025-10-13T15:00:00Z"
    assert parse_date("2026-11-03T18:30:00Z") == "2026-11-03T18:30:00Z"
    assert parse_date("2026-10-18T21:00:00+00:00") == "2026-10-18T21:00:00Z"
    assert parse_date("not a date") is None


def test_resolve_status_variants():
    assert resolve_status("2026-10-01T00:00:00Z", "2026-11-03T00:00:00Z", now=NOW)[:2] == (True, "active")
    assert resolve_status("2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z", now=NOW)[:2] == (True, "ending_soon")
    assert resolve_status("2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z", now=NOW)[:2] == (True, "upcoming")
    assert resolve_status("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z", now=NOW)[0] is False
    assert resolve_status(None, None, "finished", now=NOW)[0] is False
    assert resolve_status("2024-01-01T00:00:00Z", None, now=NOW)[:2] == (True, "ongoing")


def test_ecosystem_inference_uses_word_boundaries():
    assert infer_ecosystem("Uniswap Bug Bounty", "Protect the button and the cotton") == "EVM"
    assert infer_ecosystem("Jito Restaking", "Solana liquid staking protocol") == "Solana"
    assert infer_ecosystem("Cetus", "", ["sui", "move"]) == "Move (Sui / Aptos)"
    assert infer_ecosystem("Generic", "We move funds between accounts") is None


def test_category_and_language_inference():
    assert infer_category("LayerZero Bug Bounty", hint="bridge cross-chain") == "Bridges & Cross-chain"
    assert infer_category("K2", "DeFi lending to Stellar through pooled, isolated markets") == "Lending & Credit"
    assert infer_category("Something", "") is None
    assert infer_languages("Vault", "", [], "Solana") == ["Rust"]
    assert "Go" not in infer_languages("Euler", "Ready to go live with the new module")


def test_build_record_drops_ended_and_sets_defaults():
    assert (
        build_record(
            title="Old",
            platform="Sherlock",
            source="sherlock",
            url="https://x.y/1",
            challenge_type="audit_contest",
            end_date="2020-01-01",
        )
        is None
    )
    rec = build_record(
        title="ETHGlobal Mumbai",
        platform="ETHGlobal",
        source="ethglobal",
        url="https://ethglobal.com/events/mumbai",
        challenge_type="hackathon",
        start_date="2099-11-05",
        end_date="2099-11-07",
        prize="Sponsor prize pool",
    )
    assert rec is not None
    assert rec.status == "upcoming"
    assert rec.prize_usd == 0.0
    assert rec.category == "Web3 Building (General)"
    assert rec.ecosystem == "Multi-chain / General"


def test_bug_bounty_without_deadline_is_ongoing():
    rec = build_record(
        title="LayerZero Bug Bounty",
        platform="Immunefi",
        source="immunefi",
        url="https://immunefi.com/bug-bounty/layerzero/information/",
        challenge_type="bug_bounty",
        prize=15_000_000,
        start_date="2023-05-17T17:00:00.000Z",
    )
    assert rec.status == "ongoing"
    assert rec.days_remaining is None
    assert rec.prize == "$15M"
    assert rec.difficulty == "Expert"


def test_canonicalize_url_strips_tracking_and_www():
    assert canonicalize_url("http://www.Example.com/a/?utm_source=x&id=2") == "https://example.com/a?id=2"

