/**
 * ReportGenerator — produces evaluation reports in JSON, Markdown, and HTML.
 */

const path = require("path");
const fs = require("fs");

class ReportGenerator {
  /**
   * @param {Object} aggregatedResult - from ResultAggregator.aggregate()
   * @param {Object} [options]
   * @param {string} [options.outputDir] - output directory
   */
  constructor(aggregatedResult, options = {}) {
    this.result = aggregatedResult;
    this.outputDir = options.outputDir || "./results";
  }

  /** Generate all formats. */
  async generateAll() {
    fs.mkdirSync(this.outputDir, { recursive: true });

    const jsonPath = await this.toJSON();
    const mdPath = await this.toMarkdown();
    const htmlPath = await this.toHTML();

    return { json: jsonPath, markdown: mdPath, html: htmlPath };
  }

  /** Generate JSON report. */
  async toJSON() {
    const filePath = path.join(this.outputDir, "report.json");
    fs.writeFileSync(filePath, JSON.stringify(this.result, null, 2), "utf-8");
    return filePath;
  }

  /** Generate Markdown report. */
  async toMarkdown() {
    const r = this.result;
    const score = r.scores?.overall || 0;
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : score >= 25 ? "D" : "F";

    let md = `# Proxy Evaluation Report\n\n`;
    md += `**Suite:** ${r.suite}  \n`;
    md += `**Proxy:** ${r.proxy}  \n`;
    md += `**Timestamp:** ${r.timestamp}  \n`;
    md += `**Overall Score:** ${score}/100 (Grade: ${grade})  \n\n`;
    md += `> ${r.recommendation}\n\n`;
    md += `---\n\n`;

    // Traffic section
    if (r.traffic && r.scores?.traffic) {
      md += `## Traffic Simulation\n\n`;
      md += `| Metric | Value |\n`;
      md += `|--------|-------|\n`;
      md += `| Profile | ${r.traffic.profile} |\n`;
      md += `| Duration | ${(r.traffic.durationMs / 1000).toFixed(1)}s |\n`;
      md += `| Total Requests | ${r.traffic.totalRequests} |\n`;
      md += `| Throughput | ${r.traffic.throughput} req/s |\n`;

      const ts = r.scores.traffic;
      md += `| Score | ${ts.total}/100 |\n`;
      md += `| Latency (p50/p95) | ${r.traffic.p50Latency}ms / ${r.traffic.p95Latency}ms |\n`;
      md += `| Error Rate | ${(r.traffic.errorRate * 100).toFixed(2)}% |\n\n`;

      md += `### Score Breakdown\n\n`;
      md += `| Component | Score |\n`;
      md += `|-----------|-------|\n`;
      for (const [name, s] of Object.entries(ts.components)) {
        md += `| ${name} | ${s}/100 |\n`;
      }
      md += `\n`;

      // Latency distribution
      if (r.traffic.latencyMs) {
        md += `### Latency Distribution\n\n`;
        md += `| Percentile | Latency |\n`;
        md += `|------------|---------|\n`;
        const lm = r.traffic.latencyMs;
        md += `| p50 | ${lm.p50}ms |\n`;
        md += `| p95 | ${lm.p95}ms |\n`;
        md += `| avg | ${lm.avg}ms |\n\n`;
      }
    }

    // Puppeteer section
    if (r.puppeteer && r.scores?.puppeteer) {
      md += `## Browser (Puppeteer)\n\n`;
      md += `| Metric | Value |\n`;
      md += `|--------|-------|\n`;
      md += `| Targets Visited | ${r.puppeteer.targetsVisited} |\n`;
      md += `| Network Requests | ${r.puppeteer.totalNetworkRequests} |\n`;
      md += `| Console Errors | ${r.puppeteer.consoleErrors} |\n`;
      md += `| Screenshots | ${r.puppeteer.screenshots} |\n`;
      if (r.puppeteer.harPath) {
        md += `| HAR File | ${r.puppeteer.harPath} |\n`;
      }
      md += `\n`;
    }

    const filePath = path.join(this.outputDir, "report.md");
    fs.writeFileSync(filePath, md, "utf-8");
    return filePath;
  }

  /** Generate HTML report. */
  async toHTML() {
    const r = this.result;
    const score = r.scores?.overall || 0;
    const scoreColor =
      score >= 75 ? "#4caf50" : score >= 50 ? "#ff9800" : "#f44336";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proxy Evaluation — ${r.proxy}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
  .card { background: white; border-radius: 8px; padding: 20px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .score { font-size: 48px; font-weight: bold; color: ${scoreColor}; }
  .grade { font-size: 24px; margin-left: 12px; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { color: #666; font-weight: 600; }
  .rec { padding: 12px; border-radius: 6px; background: #e3f2fd; }
</style>
</head>
<body>
  <h1>Proxy Evaluation Report</h1>
  <div class="card">
    <span class="score">${score}</span><span class="grade">/100 — Grade ${score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : score >= 25 ? "D" : "F"}</span>
    <p><strong>Proxy:</strong> ${r.proxy}</p>
    <p><strong>Suite:</strong> ${r.suite} | <strong>Time:</strong> ${r.timestamp}</p>
    <div class="rec">${r.recommendation}</div>
  </div>
  ${r.traffic ? ReportGenerator._trafficHtml(r) : ""}
  ${r.puppeteer ? ReportGenerator._puppeteerHtml(r) : ""}
</body>
</html>`;

    const filePath = path.join(this.outputDir, "report.html");
    fs.writeFileSync(filePath, html, "utf-8");
    return filePath;
  }

  static _trafficHtml(r) {
    return `<div class="card">
      <h2>Traffic Simulation</h2>
      <table>
        <tr><th>Profile</th><td>${r.traffic.profile}</td></tr>
        <tr><th>Duration</th><td>${(r.traffic.durationMs / 1000).toFixed(1)}s</td></tr>
        <tr><th>Total Requests</th><td>${r.traffic.totalRequests}</td></tr>
        <tr><th>Throughput</th><td>${r.traffic.throughput} req/s</td></tr>
        <tr><th>P50 Latency</th><td>${r.traffic.p50Latency}ms</td></tr>
        <tr><th>P95 Latency</th><td>${r.traffic.p95Latency}ms</td></tr>
        <tr><th>Error Rate</th><td>${(r.traffic.errorRate * 100).toFixed(2)}%</td></tr>
      </table>
    </div>`;
  }

  static _puppeteerHtml(r) {
    return `<div class="card">
      <h2>Browser (Puppeteer)</h2>
      <table>
        <tr><th>Targets Visited</th><td>${r.puppeteer.targetsVisited}</td></tr>
        <tr><th>Network Requests</th><td>${r.puppeteer.totalNetworkRequests}</td></tr>
        <tr><th>Console Errors</th><td>${r.puppeteer.consoleErrors}</td></tr>
        <tr><th>Screenshots</th><td>${r.puppeteer.screenshots}</td></tr>
        ${r.puppeteer.harPath ? `<tr><th>HAR File</th><td>${r.puppeteer.harPath}</td></tr>` : ""}
      </table>
    </div>`;
  }
}

module.exports = { ReportGenerator };
