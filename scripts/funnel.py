#!/usr/bin/env python3
"""Read RepoMeter Lite's anonymous funnel counters.

No log content, paths, filenames, prompts, model names, IPs, or user IDs are stored.
CounterAPI holds one aggregate integer per allowlisted event.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

NAMESPACE = "repometer-lite-prod-v1"
EVENTS = [
    "page_view",
    "sample_loaded",
    "file_selected",
    "own_log_parse_succeeded",
    "own_log_parse_failed",
    "receipt_generated",
    "feedback_clicked",
]


def get_count(event: str) -> int:
    url = f"https://api.counterapi.dev/v1/{NAMESPACE}/{event}/"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 RepoMeter-Lite-Funnel/1.0",
            "Origin": "https://czc6666.github.io",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return int(json.load(response).get("count", 0))
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                return 0
            if error.code in (429, 502, 503, 504) and attempt < 2:
                time.sleep(1 + attempt)
                continue
            raise
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(1 + attempt)
                continue
            raise
    return 0


def pct(value: int, denominator: int) -> str:
    return "—" if denominator == 0 else f"{value / denominator * 100:.1f}%"


def main() -> None:
    counts = {event: get_count(event) for event in EVENTS}
    views = counts["page_view"]
    selected = counts["file_selected"]
    print("RepoMeter Lite anonymous funnel")
    print("=" * 36)
    for event in EVENTS:
        print(f"{event:27} {counts[event]:>6}")
    print("-" * 36)
    print(f"sample / view              {pct(counts['sample_loaded'], views):>6}")
    print(f"file selected / view       {pct(selected, views):>6}")
    print(f"own log success / selected {pct(counts['own_log_parse_succeeded'], selected):>6}")
    print(f"own log failure / selected {pct(counts['own_log_parse_failed'], selected):>6}")
    print(f"feedback / view            {pct(counts['feedback_clicked'], views):>6}")


if __name__ == "__main__":
    main()
