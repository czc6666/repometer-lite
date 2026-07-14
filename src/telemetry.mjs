export const ALLOWED_EVENTS = new Set([
  'page_view',
  'sample_loaded',
  'file_selected',
  'own_log_parse_succeeded',
  'own_log_parse_failed',
  'receipt_generated',
  'feedback_clicked',
]);

export function bucketCount(value) {
  const count = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 10) return '6-10';
  if (count <= 50) return '11-50';
  if (count <= 100) return '51-100';
  return '101+';
}

export function sanitizeEvent(name, metadata = {}) {
  if (!ALLOWED_EVENTS.has(name)) {
    throw new Error(`Telemetry event is not allowlisted: ${name}`);
  }
  const payload = { name };
  if (name === 'own_log_parse_succeeded' || name === 'receipt_generated') {
    payload.eventCountBucket = bucketCount(metadata.eventCount);
    payload.fileCountBucket = bucketCount(metadata.fileCount);
  }
  return payload;
}

export function createTelemetry({
  namespace = 'repometer-lite-prod-v1',
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  async function track(name, metadata = {}) {
    const event = sanitizeEvent(name, metadata);
    if (!fetchImpl) return event;
    const url = `https://api.counterapi.dev/v1/${encodeURIComponent(namespace)}/${encodeURIComponent(event.name)}/up`;
    try {
      await fetchImpl(url, { mode: 'cors', cache: 'no-store' });
    } catch {
      // Telemetry must never block local analysis.
    }
    return event;
  }

  return { track };
}
