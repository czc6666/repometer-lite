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

export function analyzeCodexDiagnostics(text) {
  const records = parseLines(text);
  const inputTimeline = [];
  let selfLogReads = 0;

  for (const record of records) {
    const payload = record?.payload;
    if (!payload || typeof payload !== 'object') continue;

    if (record.type === 'event_msg' && payload.type === 'token_count') {
      const usage = payload.info?.last_token_usage;
      if (usage && typeof usage === 'object') inputTimeline.push(positive(usage.input_tokens));
    }

    if (
      record.type === 'response_item' &&
      (payload.type === 'function_call' || payload.type === 'custom_tool_call')
    ) {
      const argumentsText = typeof payload.arguments === 'string' ? payload.arguments : '';
      const inputText = typeof payload.input === 'string' ? payload.input : '';
      const privateCommand = `${argumentsText}\n${inputText}`;
      if (/(?:\.codex[\\/]sessions|\.codex[\\/]archived_sessions|rollout-[^\s"']*\.jsonl)/i.test(privateCommand)) {
        selfLogReads += 1;
      }
    }
  }

  let largestInputJump = 0;
  for (let index = 1; index < inputTimeline.length; index += 1) {
    largestInputJump = Math.max(largestInputJump, inputTimeline[index] - inputTimeline[index - 1]);
  }
  const maxInputTokens = inputTimeline.length ? Math.max(...inputTimeline) : 0;
  const findings = [];
  if (selfLogReads > 0) {
    findings.push({
      code: 'CODEX_SELF_LOG_READ',
      severity: 'high',
      title: 'Codex read its own session log',
      detail: `${selfLogReads} tool call${selfLogReads === 1 ? '' : 's'} targeted a Codex rollout or session-log directory. Command text was discarded.`,
    });
  }
  if (largestInputJump >= 20_000 && maxInputTokens >= 50_000) {
    findings.push({
      code: 'SHARP_INPUT_GROWTH',
      severity: 'high',
      title: 'Sharp per-turn input growth',
      detail: `The largest observed input jump was ${largestInputJump.toLocaleString()} tokens; peak per-turn input reached ${maxInputTokens.toLocaleString()}.`,
    });
  }

  return { selfLogReads, maxInputTokens, largestInputJump, findings };
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
      const cachedInput = positive(usage.cached_input_tokens);
      events.push({
        timestamp: record.timestamp,
        provider: 'openai',
        model,
        usage: {
          // Codex input_tokens includes cached input. Normalize to uncached
          // input so the analyzer can display and price each bucket once.
          input_tokens: Math.max(0, positive(usage.input_tokens) - cachedInput),
          output_tokens: positive(usage.output_tokens),
          cache_read_tokens: cachedInput,
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
