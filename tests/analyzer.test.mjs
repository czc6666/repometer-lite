import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogText,
  analyzeEvents,
  formatUsd,
} from '../src/analyzer.mjs';

const sampleEvents = [
  {
    timestamp: '2026-07-13T10:00:00Z',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    usage: { input_tokens: 33000, output_tokens: 1200, cache_read_tokens: 8000 },
    tool: { name: 'Read', path: '/work/acme/src/app.ts' },
  },
  {
    timestamp: '2026-07-13T10:01:00Z',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    usage: { input_tokens: 12000, output_tokens: 900 },
    tool: { name: 'Read', path: '/work/acme/src/app.ts' },
  },
  {
    timestamp: '2026-07-13T10:02:00Z',
    provider: 'openai',
    model: 'gpt-5.4',
    usage: { input_tokens: 7000, output_tokens: 600 },
    tool: { name: 'Bash', path: '/work/acme/scripts/deploy.sh' },
  },
];

test('parseLogText accepts JSON arrays and JSONL', () => {
  const arrayResult = parseLogText(JSON.stringify(sampleEvents));
  const jsonlResult = parseLogText(sampleEvents.map(JSON.stringify).join('\n'));
  assert.equal(arrayResult.length, 3);
  assert.deepEqual(jsonlResult, arrayResult);
});

test('analyzeEvents totals tokens and reports repeated file access without exposing full paths', () => {
  const report = analyzeEvents(sampleEvents, {
    prices: {
      'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5 },
      'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0 },
    },
  });

  assert.deepEqual(report.totals, {
    events: 3,
    inputTokens: 52000,
    outputTokens: 2700,
    cacheReadTokens: 8000,
    toolCalls: 3,
    uniqueFiles: 2,
  });
  assert.equal(report.files[0].displayPath, '…/src/app.ts');
  assert.equal(report.files[0].accesses, 2);
  assert.equal(report.files.some((file) => file.displayPath.includes('/work/acme')), false);
  assert.ok(report.estimatedCostUsd > 0);
});

test('analyzeEvents flags high startup load, repeated reads, and sensitive paths', () => {
  const report = analyzeEvents([
    ...sampleEvents,
    {
      model: 'gpt-5.4',
      usage: { input_tokens: 500, output_tokens: 10 },
      tool: { name: 'Read', path: '/work/acme/.env' },
    },
  ]);
  const codes = report.findings.map((finding) => finding.code);
  assert.ok(codes.includes('HIGH_STARTUP_INPUT'));
  assert.ok(codes.includes('REPEATED_FILE_ACCESS'));
  assert.ok(codes.includes('SENSITIVE_PATH_TOUCHED'));
});

test('unknown or malformed usage fields are ignored safely', () => {
  const report = analyzeEvents([
    { usage: { input_tokens: 'nope', output_tokens: -3 } },
    { nonsense: true },
  ]);
  assert.equal(report.totals.inputTokens, 0);
  assert.equal(report.totals.outputTokens, 0);
  assert.equal(report.estimatedCostUsd, 0);
});

test('formatUsd keeps tiny non-zero costs visible', () => {
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(0.0042), '$0.0042');
  assert.equal(formatUsd(12.345), '$12.35');
});
