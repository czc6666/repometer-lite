import { analyzeEvents, formatUsd, parseLogText } from './analyzer.mjs';
import { isCodexRolloutText, parseCodexRollout } from './codex-adapter.mjs';
import { createTelemetry } from './telemetry.mjs';

const telemetry = createTelemetry();
let inputSource = 'paste';
void telemetry.track('page_view');

const elements = {
  input: document.querySelector('#logInput'),
  file: document.querySelector('#fileInput'),
  drop: document.querySelector('#dropZone'),
  analyze: document.querySelector('#analyzeButton'),
  sample: document.querySelector('#sampleButton'),
  error: document.querySelector('#errorMessage'),
  report: document.querySelector('#report'),
  metrics: document.querySelector('#metricGrid'),
  findings: document.querySelector('#findings'),
  findingCount: document.querySelector('#findingCount'),
  models: document.querySelector('#modelRows'),
  files: document.querySelector('#fileRows'),
  caveats: document.querySelector('#caveatList'),
  generatedAt: document.querySelector('#generatedAt'),
  print: document.querySelector('#printButton'),
  feedback: document.querySelector('#feedbackButton'),
};

const integer = new Intl.NumberFormat('en-US');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function metric(label, value, note) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function render(report) {
  elements.metrics.innerHTML = [
    metric('Input tokens', integer.format(report.totals.inputTokens), 'logged'),
    metric('Output tokens', integer.format(report.totals.outputTokens), 'logged'),
    metric('Estimated cost', formatUsd(report.estimatedCostUsd), 'editable price assumptions'),
    metric('File scope', integer.format(report.totals.uniqueFiles), `${report.totals.toolCalls} tool calls`),
  ].join('');

  elements.findingCount.textContent = `${report.findings.length} signal${report.findings.length === 1 ? '' : 's'}`;
  elements.findings.innerHTML = report.findings
    .map((finding) => `<article class="finding ${escapeHtml(finding.severity)}"><div class="severity-dot"></div><div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.detail)}</p></div></article>`)
    .join('');

  elements.models.innerHTML = report.models
    .map((model) => `<tr><td>${escapeHtml(model.model)}</td><td>${integer.format(model.inputTokens)}</td><td>${integer.format(model.outputTokens)}</td><td>${formatUsd(model.estimatedCostUsd)}</td></tr>`)
    .join('') || '<tr><td colspan="4">No model usage found in this log.</td></tr>';

  elements.files.innerHTML = report.files
    .map((file) => `<tr><td><code>${escapeHtml(file.displayPath)}</code></td><td>${file.accesses}</td><td>${escapeHtml(file.tools.join(', '))}</td><td>${file.sensitive ? '<span class="flag danger">Sensitive pattern</span>' : '<span class="flag">Logged</span>'}</td></tr>`)
    .join('') || '<tr><td colspan="4">No file paths were present in this log.</td></tr>';

  elements.caveats.innerHTML = report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join('');
  elements.generatedAt.textContent = `Generated locally · ${new Date().toLocaleString()}`;
  elements.report.hidden = false;
  elements.report.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function analyze() {
  elements.error.hidden = true;
  try {
    const source = elements.input.value;
    const codexRollout = isCodexRolloutText(source);
    const events = codexRollout ? parseCodexRollout(source) : parseLogText(source);
    if (!events.length) {
      throw new Error(codexRollout
        ? 'This Codex rollout contains no token or tool-call events yet.'
        : 'Paste a JSON / JSONL log or load the sample first.');
    }
    const report = analyzeEvents(events);
    render(report);
    void telemetry.track('receipt_generated', {
      eventCount: report.totals.events,
      fileCount: report.totals.uniqueFiles,
    });
    if (inputSource === 'file') {
      void telemetry.track('own_log_parse_succeeded', {
        eventCount: report.totals.events,
        fileCount: report.totals.uniqueFiles,
      });
    }
  } catch (error) {
    elements.error.textContent = error instanceof Error ? error.message : String(error);
    elements.error.hidden = false;
    if (inputSource === 'file') void telemetry.track('own_log_parse_failed');
  }
}

async function readFile(file) {
  if (!file) return;
  inputSource = 'file';
  void telemetry.track('file_selected');
  elements.input.value = await file.text();
  elements.error.hidden = true;
}

elements.analyze.addEventListener('click', analyze);
elements.input.addEventListener('input', () => { inputSource = 'paste'; });
elements.file.addEventListener('change', (event) => readFile(event.target.files?.[0]));
elements.sample.addEventListener('click', async () => {
  inputSource = 'sample';
  void telemetry.track('sample_loaded');
  const response = await fetch('./sample/session.json');
  if (!response.ok) throw new Error('Could not load the sample log.');
  elements.input.value = await response.text();
  analyze();
});
elements.print.addEventListener('click', () => window.print());
elements.feedback.addEventListener('click', () => { void telemetry.track('feedback_clicked'); });

for (const type of ['dragenter', 'dragover']) {
  elements.drop.addEventListener(type, (event) => {
    event.preventDefault();
    elements.drop.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop']) {
  elements.drop.addEventListener(type, (event) => {
    event.preventDefault();
    elements.drop.classList.remove('dragging');
  });
}
elements.drop.addEventListener('drop', (event) => readFile(event.dataTransfer?.files?.[0]));
