import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexRollout } from '../src/codex-adapter.mjs';

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
      input_tokens: 100,
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
