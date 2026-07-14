# RepoMeter Lite

A local-first proof-of-concept that turns AI coding session logs into a shareable cost and file-access receipt.

## Run

```bash
npm test
npm run serve
```

Open <http://localhost:4173>.

## Supported input

- Native Codex CLI rollout (`rollout-*.jsonl`)
- Generic JSON array
- JSON object with an `events` array
- Generic JSONL, one event per line

Codex CLI rollouts are usually stored at:

- Linux / macOS / WSL: `~/.codex/sessions/YYYY/MM/DD/`
- Windows: `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\`

The Codex adapter extracts only model, token counters, timestamps, and tool names. It discards prompts, replies, function arguments, command output, and other free text. Native Codex rollouts do not currently expose trustworthy structured file paths, so file scope remains unavailable for that adapter.

Generic recognized fields include common variants of:

- `model`
- `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_tokens`
- `tool.name`, `tool.path`

The browser processes files locally. The MVP has no upload server.

## Validation boundary

This is an external-demand MVP, not a production security scanner. It estimates cost from logged fields and cannot infer events omitted by the source tool.
