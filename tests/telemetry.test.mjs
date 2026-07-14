import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_EVENTS,
  bucketCount,
  createTelemetry,
  sanitizeEvent,
} from '../src/telemetry.mjs';

test('only fixed allowlisted event names are accepted', () => {
  assert.ok(ALLOWED_EVENTS.has('page_view'));
  assert.ok(ALLOWED_EVENTS.has('own_log_parse_succeeded'));
  assert.throws(() => sanitizeEvent('uploaded_/Users/alice/.env'));
});

test('sanitizeEvent never accepts paths, filenames, prompts, models, or free text', () => {
  const payload = sanitizeEvent('own_log_parse_succeeded', {
    eventCount: 23,
    fileCount: 7,
    path: '/Users/alice/project/.env',
    filename: 'session-secret.jsonl',
    prompt: 'fix customer database',
    model: 'private-model-name',
  });
  assert.deepEqual(payload, {
    name: 'own_log_parse_succeeded',
    eventCountBucket: '11-50',
    fileCountBucket: '6-10',
  });
  assert.equal(JSON.stringify(payload).includes('alice'), false);
  assert.equal(JSON.stringify(payload).includes('private-model'), false);
});

test('count buckets minimize event metadata', () => {
  assert.equal(bucketCount(0), '0');
  assert.equal(bucketCount(1), '1');
  assert.equal(bucketCount(8), '6-10');
  assert.equal(bucketCount(25), '11-50');
  assert.equal(bucketCount(900), '101+');
});

test('telemetry sends only the event name in the remote URL and never blocks product flow', async () => {
  const calls = [];
  const telemetry = createTelemetry({
    namespace: 'repometer-lite-test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      throw new Error('network down');
    },
  });
  await telemetry.track('file_selected', { filename: 'secret.json', fileCount: 2 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/file_selected\/up$/);
  assert.equal(calls[0].url.includes('secret'), false);
  assert.deepEqual(calls[0].options, { mode: 'cors', cache: 'no-store' });
});
