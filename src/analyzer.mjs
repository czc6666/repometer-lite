const DEFAULT_PRICES = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0 },
};

function asTokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function usageOf(event) {
  const usage = event?.usage ?? event?.message?.usage ?? {};
  return {
    input: asTokenCount(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens),
    output: asTokenCount(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens),
    cacheRead: asTokenCount(usage.cache_read_tokens ?? usage.cacheReadTokens),
  };
}

function toolOf(event) {
  const tool = event?.tool ?? event?.tool_call ?? event?.toolCall;
  if (!tool || typeof tool !== 'object') return null;
  const name = String(tool.name ?? tool.tool_name ?? 'Tool');
  const path = tool.path ?? tool.file_path ?? tool.input?.path ?? tool.input?.file_path;
  return { name, path: typeof path === 'string' ? path : null };
}

function modelOf(event) {
  return String(event?.model ?? event?.message?.model ?? 'unknown');
}

function redactPath(path) {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  const isAbsolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
  if (isAbsolute) return `…/${parts.slice(-2).join('/')}`;
  if (parts.length <= 2) return normalized;
  return `…/${parts.slice(-2).join('/')}`;
}

function isSensitivePath(path) {
  return /(^|\/)(\.env(?:\.|$)|id_rsa$|id_ed25519$|credentials(?:\.|$)|secrets?(?:\.|$)|\.aws\/|\.ssh\/)/i.test(
    path.replaceAll('\\', '/'),
  );
}

export function parseLogText(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.events)) return parsed.events;
    return [parsed];
  } catch {
    return source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`Line ${index + 1} is not valid JSON.`);
        }
      });
  }
}

export function analyzeEvents(events, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const totals = {
    events: list.length,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    toolCalls: 0,
    uniqueFiles: 0,
  };
  const models = new Map();
  const files = new Map();
  let estimatedCostUsd = 0;
  let firstInputTokens = 0;

  list.forEach((event, index) => {
    const usage = usageOf(event);
    const model = modelOf(event);
    const price = prices[model] ?? { input: 0, output: 0, cacheRead: 0 };
    if (index === 0) firstInputTokens = usage.input;
    totals.inputTokens += usage.input;
    totals.outputTokens += usage.output;
    totals.cacheReadTokens += usage.cacheRead;
    estimatedCostUsd +=
      (usage.input / 1_000_000) * price.input +
      (usage.output / 1_000_000) * price.output +
      (usage.cacheRead / 1_000_000) * price.cacheRead;

    const modelRow = models.get(model) ?? {
      model,
      events: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      estimatedCostUsd: 0,
    };
    modelRow.events += 1;
    modelRow.inputTokens += usage.input;
    modelRow.outputTokens += usage.output;
    modelRow.cacheReadTokens += usage.cacheRead;
    modelRow.estimatedCostUsd +=
      (usage.input / 1_000_000) * price.input +
      (usage.output / 1_000_000) * price.output +
      (usage.cacheRead / 1_000_000) * price.cacheRead;
    models.set(model, modelRow);

    const tool = toolOf(event);
    if (tool) totals.toolCalls += 1;
    if (tool?.path) {
      const row = files.get(tool.path) ?? {
        path: tool.path,
        displayPath: redactPath(tool.path),
        accesses: 0,
        tools: new Set(),
        sensitive: isSensitivePath(tool.path),
      };
      row.accesses += 1;
      row.tools.add(tool.name);
      files.set(tool.path, row);
    }
  });

  totals.uniqueFiles = files.size;
  const fileRows = [...files.values()]
    .map((row) => ({ ...row, tools: [...row.tools] }))
    .sort((a, b) => b.accesses - a.accesses || a.displayPath.localeCompare(b.displayPath));
  const findings = [];
  if (firstInputTokens >= 20_000) {
    findings.push({
      code: 'HIGH_STARTUP_INPUT',
      severity: 'high',
      title: 'High startup input load',
      detail: `The first event carried ${firstInputTokens.toLocaleString()} input tokens before later work.`,
    });
  }
  const repeated = fileRows.filter((file) => file.accesses >= 2);
  if (repeated.length) {
    const repeatedCount = repeated.reduce((sum, file) => sum + (file.accesses - 1), 0);
    findings.push({
      code: 'REPEATED_FILE_ACCESS',
      severity: 'medium',
      title: 'Repeated file access',
      detail: `${repeated.length} ${repeated.length === 1 ? 'file was' : 'files were'} accessed more than once, adding ${repeatedCount} repeat ${repeatedCount === 1 ? 'read' : 'reads'}.`,
    });
  }
  const sensitive = fileRows.filter((file) => file.sensitive);
  if (sensitive.length) {
    findings.push({
      code: 'SENSITIVE_PATH_TOUCHED',
      severity: 'high',
      title: 'Sensitive path touched',
      detail: `${sensitive.length} path${sensitive.length === 1 ? '' : 's'} matched a local secret or credential pattern.`,
    });
  }
  if (!findings.length) {
    findings.push({
      code: 'NO_OBVIOUS_ANOMALY',
      severity: 'low',
      title: 'No obvious anomaly in this sample',
      detail: 'This is not a security guarantee; it only reflects fields present in the uploaded log.',
    });
  }

  return {
    totals,
    estimatedCostUsd,
    models: [...models.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    files: fileRows,
    findings,
    caveats: [
      'All analysis runs locally in this browser.',
      'Token buckets reflect logged fields. ChatGPT plan limits are not API dollar charges, so this receipt does not convert subscription usage into money.',
      'A missing path or token field cannot be inferred from the log.',
    ],
  };
}

export function formatUsd(value) {
  const number = Number(value) || 0;
  if (number === 0) return '$0.00';
  if (number < 0.01) return `$${number.toFixed(4)}`;
  return `$${number.toFixed(2)}`;
}
