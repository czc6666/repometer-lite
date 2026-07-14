#!/usr/bin/env python3
"""Bounded watcher for the first RepoMeter external-validation signal."""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

BASELINE_PATH = Path(__file__).with_name("launch-baseline.json")
COMMENT_URL = "https://github.com/openai/codex/issues/27131#issuecomment-4967194567"
POLL_SECONDS = 300
MAX_POLLS = 72  # six hours


def run(*args: str) -> str:
    return subprocess.check_output(args, text=True, timeout=30)


def counters() -> dict[str, int]:
    output = run("python3", "scripts/funnel.py")
    values: dict[str, int] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0].replace("_", "").isalpha() and parts[1].isdigit():
            values[parts[0]] = int(parts[1])
    return values


def replies() -> list[dict]:
    raw = run("gh", "api", "repos/openai/codex/issues/27131/comments", "--paginate")
    comments = json.loads(raw)
    return [
        {"author": item["user"]["login"], "url": item["html_url"], "body": item["body"][:500]}
        for item in comments
        if item["html_url"] != COMMENT_URL and item["created_at"] > "2026-07-14T08:59:29Z"
    ]


def main() -> None:
    baseline = json.loads(BASELINE_PATH.read_text())["baseline_before_publication"]
    for _ in range(MAX_POLLS):
        try:
            current = counters()
            new_replies = replies()
            delta = {key: current.get(key, 0) - int(value) for key, value in baseline.items()}
            meaningful = any(delta.get(key, 0) > 0 for key in (
                "file_selected", "own_log_parse_succeeded", "own_log_parse_failed", "feedback_clicked"
            ))
            if new_replies or meaningful:
                print(json.dumps({
                    "status": "external-signal-candidate",
                    "delta_since_publication": delta,
                    "new_issue_replies": new_replies,
                    "warning": "Anonymous event deltas are candidates, not proof of user identity; replies are attributable evidence.",
                }, ensure_ascii=False, indent=2))
                return
        except Exception:
            pass
        time.sleep(POLL_SECONDS)
    print(json.dumps({"status": "no-meaningful-signal-within-six-hours"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
