"""Helpers for extracting data embedded in Next.js App Router (RSC "flight") HTML pages.

Many audit platforms (Code4rena, Immunefi, ETHGlobal) render with React Server
Components. The page HTML contains `self.__next_f.push([1, "..."])` chunks which,
once concatenated, form newline-delimited rows like `1a:{"title": ...}`. Values may
reference other rows via `"$1a"` strings.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterator, List

_PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', re.S)
_ROW_RE = re.compile(r"^([0-9a-f]{1,6}):(.*)$")
_REF_RE = re.compile(r"^\$([0-9a-f]{1,6})$")
_DECODER = json.JSONDecoder()


def extract_flight_text(html: str) -> str:
    out: List[str] = []
    for chunk in _PUSH_RE.findall(html or ""):
        try:
            out.append(json.loads(f'"{chunk}"'))
        except json.JSONDecodeError:
            continue
    return "".join(out)


def parse_rows(flight: str) -> Dict[str, Any]:
    rows: Dict[str, Any] = {}
    for line in flight.split("\n"):
        m = _ROW_RE.match(line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2)
        if not raw or raw[0] not in "[{\"":
            continue
        try:
            rows[key] = json.loads(raw)
        except json.JSONDecodeError:
            continue
    return rows


def resolve(value: Any, rows: Dict[str, Any], depth: int = 0) -> Any:
    """Recursively replace `"$id"` references with their row values."""
    if depth > 12:
        return value
    if isinstance(value, str):
        m = _REF_RE.match(value)
        if m and m.group(1) in rows:
            return resolve(rows[m.group(1)], rows, depth + 1)
        return value
    if isinstance(value, list):
        return [resolve(v, rows, depth + 1) for v in value]
    if isinstance(value, dict):
        return {k: resolve(v, rows, depth + 1) for k, v in value.items()}
    return value


def iter_objects_with_prefix(text: str, prefix: str) -> Iterator[Dict[str, Any]]:
    """Yield every JSON object in `text` that starts with the literal `prefix` (e.g. '{"auditType"')."""
    start = 0
    while True:
        idx = text.find(prefix, start)
        if idx < 0:
            return
        try:
            obj, end = _DECODER.raw_decode(text, idx)
            if isinstance(obj, dict):
                yield obj
            start = end
        except json.JSONDecodeError:
            start = idx + len(prefix)


def decode_array_after(text: str, marker: str) -> List[Any]:
    """Decode the JSON array that immediately follows `marker` (e.g. '"bounties":')."""
    idx = text.find(marker)
    if idx < 0:
        return []
    try:
        arr, _ = _DECODER.raw_decode(text, idx + len(marker))
        return arr if isinstance(arr, list) else []
    except json.JSONDecodeError:
        return []

