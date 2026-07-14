import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCodexDiagnostics, parseCodexRollout } from '../src/codex-adapter.mjs';

const codexLog = [
  {
    timestamp: '2026-07-14T00:00:00Z',
    type: 'turn_context',
    payload: { model: 'gpt-5.4' },
  },
  {
    timestamp: '2026-07-14T00:00:01Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 5,
          total_tokens: 125,
        },
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 5,
          total_tokens: 125,
        },
      },
    },
  },
  {
    timestamp: '2026-07-14T00:00:02Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"cat /home/alice/private.txt"}',
      call_id: 'call_1',
    },
  },
];

test('Codex rollout adapter uses token_count deltas and model context', () => {
  const events = parseCodexRollout(codexLog.map(JSON.stringify).join('\n'));
  const usage = events.find((event) => event.usage);
  assert.deepEqual(usage, {
    timestamp: '2026-07-14T00:00:01Z',
    provider: 'openai',
    model: 'gpt-5.4',
    usage: {
      input_tokens: 60,
      output_tokens: 20,
      cache_read_tokens: 40,
    },
  });
});

test('Codex rollout adapter counts tools without retaining arguments or private content', () => {
  const events = parseCodexRollout(codexLog.map(JSON.stringify).join('\n'));
  const tool = events.find((event) => event.tool);
  assert.deepEqual(tool, {
    timestamp: '2026-07-14T00:00:02Z',
    provider: 'openai',
    model: 'gpt-5.4',
    tool: { name: 'exec_command' },
  });
  assert.equal(JSON.stringify(events).includes('private.txt'), false);
  assert.equal(JSON.stringify(events).includes('cat '), false);
});

test('Codex adapter never produces negative uncached input when counters are inconsistent', () => {
  const text = JSON.stringify({
    timestamp: '2026-07-14T00:00:01Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 40, output_tokens: 2 } },
    },
  });
  const events = parseCodexRollout(text);
  assert.equal(events[0].usage.input_tokens, 0);
  assert.equal(events[0].usage.cache_read_tokens, 40);
});

test('Codex diagnostics detect self-log ingestion without retaining command text', () => {
  const text = [
    JSON.stringify({
      timestamp: '2026-07-14T00:00:00Z', type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: "sed -n '1,80p' ~/.codex/sessions/2026/07/14/rollout-secret.jsonl" }) },
    }),
    JSON.stringify({
      timestamp: '2026-07-14T00:00:01Z', type: 'response_item',
      payload: { type: 'function_call_output', output: 'private transcript content', call_id: 'x' },
    }),
  ].join('\n');
  const result = analyzeCodexDiagnostics(text);
  assert.equal(result.selfLogReads, 1);
  assert.equal(result.findings.some((item) => item.code === 'CODEX_SELF_LOG_READ'), true);
  assert.equal(JSON.stringify(result).includes('rollout-secret'), false);
  assert.equal(JSON.stringify(result).includes('private transcript'), false);
});

test('Codex diagnostics detect sharp per-turn input growth', () => {
  const token = (input, cached, timestamp) => JSON.stringify({
    timestamp, type: 'event_msg', payload: { type: 'token_count', info: {
      last_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: 10 },
    } },
  });
  const result = analyzeCodexDiagnostics([
    token(23000, 4000, 'a'),
    token(24000, 5000, 'b'),
    token(101000, 52000, 'c'),
  ].join('\n'));
  assert.equal(result.maxInputTokens, 101000);
  assert.equal(result.largestInputJump, 77000);
  assert.equal(result.findings.some((item) => item.code === 'SHARP_INPUT_GROWTH'), true);
});

test('Codex adapter ignores messages, prompts, outputs, and malformed lines', () => {
  const text = [
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'secret prompt' } }),
    '{broken json',
    JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', output: 'private output' } }),
  ].join('\n');
  const events = parseCodexRollout(text);
  assert.deepEqual(events, []);
  assert.equal(JSON.stringify(events).includes('secret'), false);
});
