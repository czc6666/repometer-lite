# A real Codex CLI receipt — generated locally

I ran RepoMeter Lite against one personal Codex CLI `rollout-*.jsonl` session.

## What the local receipt found

- Model: `gpt-5.4`
- Uncached input: **21,992 tokens**
- Cached input: **53,120 tokens**
- Output: **569 tokens**
- Tool calls: **6**
- Structured file paths exposed by this Codex log: **0**

The distinction matters: Codex reports cached input inside its input counter, so RepoMeter normalizes it into separate uncached and cached buckets instead of double-counting it.

## Privacy boundary

The adapter discarded prompts, assistant replies, function arguments, command output, code, and free text. The source file stayed in the browser. Only fixed anonymous funnel events are counted remotely.

This is **not** an explanation of ChatGPT Plus/Pro quota depletion and does not convert subscription limits into API dollars. It is a local receipt for fields actually present in one rollout.

Try it with a personal, non-sensitive Codex session:

<https://czc6666.github.io/repometer-lite/>

Typical rollout locations:

- Linux / macOS / WSL: `~/.codex/sessions/YYYY/MM/DD/`
- Windows: `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\`

The validation question is narrow: does this breakdown help explain a real Codex session, and what is the first missing field you need?
