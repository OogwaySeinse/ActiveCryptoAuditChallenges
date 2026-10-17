from datetime import date

from scraper import history
from scraper.models import ChallengeRecord


def _rec(url: str, prize: float = 10_000.0, end: str = "2026-11-01T00:00:00Z") -> ChallengeRecord:
    return ChallengeRecord(id=url, title=url, platform="Cantina", source="cantina", url=url, prize_usd=prize, end_date=end)


def test_bootstrap_records_never_flagged_new_and_new_ones_are(tmp_path, monkeypatch):
    monkeypatch.setattr(history, "HISTORY_DIR", tmp_path)
    monkeypatch.setattr(history, "FIRST_SEEN_PATH", tmp_path / "first_seen.json")
    monkeypatch.setattr(history, "SNAPSHOT_DIR", tmp_path / "snapshots")

    day1 = [_rec("https://a.xyz/1")]
    meta1 = history.annotate_with_history(day1, today=date(2026, 10, 17))
    assert meta1["new_challenges"] == 0 and not day1[0].is_new

    day2 = [_rec("https://a.xyz/1", prize=12_000.0, end="2026-11-05T00:00:00Z"), _rec("https://a.xyz/2")]
    meta2 = history.annotate_with_history(day2, today=date(2026, 10, 18))
    assert not day2[0].is_new  # discovered during bootstrap
    assert day2[1].is_new  # genuinely new
    assert meta2["new_challenges"] == 1
    assert day2[0].prize_delta_usd == 2_000.0
    assert day2[0].days_shift == 4
    assert (tmp_path / "snapshots" / "2026-10-18.json").exists()

