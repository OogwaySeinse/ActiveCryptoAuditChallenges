import json

from scraper.dedupe import deduplicate_records
from scraper.flight import decode_array_after, extract_flight_text, iter_objects_with_prefix, parse_rows, resolve
from scraper.models import ChallengeRecord
from scraper.sources.code4rena import _extract_live_contests
from scraper.sources.codehawks import extract_competitions
from scraper.sources.devpost import parse_submission_period


def _flight_html(payload: str) -> str:
    """Wrap a raw RSC payload the way Next.js embeds it in HTML."""
    return f"<script>self.__next_f.push([1,{json.dumps(payload)}])</script>"


def test_flight_rows_and_refs_resolve():
    payload = '14:{"Active":"$15","Upcoming":"$16"}\n15:["$18"]\n16:[]\n18:{"slug":"2026-10-foo","org":"$19"}\n19:{"name":"Foo"}\n'
    rows = parse_rows(extract_flight_text(_flight_html(payload)))
    assert resolve(rows["14"], rows) == {"Active": [{"slug": "2026-10-foo", "org": {"name": "Foo"}}], "Upcoming": []}


def test_code4rena_extracts_active_and_upcoming_buckets():
    payload = (
        '14:{"Active":"$15","Upcoming":"$16","Submissions closed":"$17","Completed":"$1c"}\n'
        '15:["$18"]\n16:["$1a"]\n17:[]\n1c:[]\n'
        '18:{"auditType":"Audit","slug":"2026-10-alpha","title":"Alpha","status":"Active","org":"$19"}\n'
        '19:{"name":"Alpha Labs"}\n'
        '1a:{"auditType":"Audit","slug":"2026-11-beta","title":"Beta","status":"Upcoming","org":"$19"}\n'
    )
    contests = _extract_live_contests(_flight_html(payload))
    assert [(c["slug"], c["_bucket"]) for c in contests] == [("2026-10-alpha", "Active"), ("2026-11-beta", "Upcoming")]
    assert contests[0]["org"]["name"] == "Alpha Labs"


def test_iter_objects_and_decode_array():
    text = 'xx{"auditType":"A","n":1} yy {"auditType":"B","n":2} "bounties":[{"slug":"a"},{"slug":"b"}]'
    assert [o["n"] for o in iter_objects_with_prefix(text, '{"auditType"')] == [1, 2]
    assert [b["slug"] for b in decode_array_after(text, '"bounties":')] == ["a", "b"]


def test_codehawks_sveltekit_payload():
    body = json.dumps([{"result": {"data": [{"urlSlug": "2026-10-x", "name": "X", "finalised": False}]}}])
    outer = json.dumps({"status": 200, "body": body}).replace("&", "&amp;")
    html = (
        '<script type="application/json" data-sveltekit-fetched '
        'data-url="/trpc/competitions.getCompetitions?batch=1&amp;input=%7B%7D" data-hash="x">'
        f"{outer}</script>"
    )
    comps = extract_competitions(html)
    assert comps and comps[0]["urlSlug"] == "2026-10-x"


def test_devpost_submission_period_parser():
    assert parse_submission_period("Oct 05 - 25, 2026") == ("2026-10-05", "2026-10-25T23:59:00Z")
    assert parse_submission_period("Sep 20 - Nov 05, 2026") == ("2026-09-20", "2026-11-05T23:59:00Z")
    assert parse_submission_period("Dec 20, 2026 - Jan 10, 2027") == ("2026-12-20", "2027-01-10T23:59:00Z")
    assert parse_submission_period("") == (None, None)


def _rec(**kw):
    base = dict(id="1", title="Alpha Audit", platform="Code4rena", source="code4rena", url="https://code4rena.com/audits/a")
    base.update(kw)
    return ChallengeRecord(**base)


def test_dedupe_merges_same_url_and_keeps_richer_fields():
    a = _rec(prize_usd=0.0, description="")
    b = _rec(id="2", prize="$50K", prize_usd=50_000.0, description="Longer description of the audit")
    out = deduplicate_records([a, b])
    assert len(out) == 1
    assert out[0].prize_usd == 50_000.0
    assert out[0].description.startswith("Longer")


def test_dedupe_keeps_distinct_types_apart():
    contest = _rec(url="https://cantina.xyz/competitions/1", platform="Cantina", title="Uniswap", challenge_type="audit_contest")
    bounty = _rec(id="2", url="https://cantina.xyz/bounties/2", platform="Cantina", title="Uniswap", challenge_type="bug_bounty")
    assert len(deduplicate_records([contest, bounty])) == 2

