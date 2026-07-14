# RepoMeter Lite

A local-first proof-of-concept that turns AI coding session logs into a shareable cost and file-access receipt.

## Run

```bash
npm test
npm run serve
```

Open <http://localhost:4173>.

## Supported input

- JSON array
- JSON object with an `events` array
- JSONL, one event per line

Recognized fields include common variants of:

- `model`
- `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_tokens`
- `tool.name`, `tool.path`

The browser processes files locally. The MVP has no upload server.

## Validation boundary

This is an external-demand MVP, not a production security scanner. It estimates cost from logged fields and cannot infer events omitted by the source tool.
