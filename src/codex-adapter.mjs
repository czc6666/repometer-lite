function parseLines(text) {
  const records = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Real rollout files may be partially written; ignore malformed tails.
    }
  }
  return records;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function isCodexRolloutText(text) {
  const first = parseLines(text).slice(0, 20);
  return first.some((record) =>
    ['session_meta', 'turn_context', 'event_msg', 'response_item'].includes(record?.type),
  );
}

export function parseCodexRollout(text) {
  const records = parseLines(text);
  const events = [];
  let model = 'unknown';

  for (const record of records) {
    const payload = record?.payload;
    if (!payload || typeof payload !== 'object') continue;

    if (record.type === 'turn_context' && typeof payload.model === 'string') {
      model = payload.model;
      continue;
    }

    if (record.type === 'event_msg' && payload.type === 'token_count') {
      const usage = payload.info?.last_token_usage;
      if (!usage || typeof usage !== 'object') continue;
      events.push({
        timestamp: record.timestamp,
        provider: 'openai',
        model,
        usage: {
          input_tokens: positive(usage.input_tokens),
          output_tokens: positive(usage.output_tokens),
          cache_read_tokens: positive(usage.cached_input_tokens),
        },
      });
      continue;
    }

    if (
      record.type === 'response_item' &&
      (payload.type === 'function_call' || payload.type === 'custom_tool_call') &&
      typeof payload.name === 'string'
    ) {
      events.push({
        timestamp: record.timestamp,
        provider: 'openai',
        model,
        tool: { name: payload.name },
      });
    }
  }

  return events;
}
