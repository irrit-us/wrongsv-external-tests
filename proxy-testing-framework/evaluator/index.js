/**
 * evaluator — Combine Puppeteer debug and traffic simulation into
 * comprehensive proxy evaluations with scoring and reports.
 *
 * Usage:
 *   const { Evaluator } = require('./evaluator');
 *   const evaluator = new Evaluator({ proxy: 'socks5://...' });
 *   const report = await evaluator.runSuite('latency');
 */

const { DebugSession } = require("../puppeteer-debug");
const { BenchmarkRunner } = require("../traffic-simulator");
const { TestSuite } = require("./TestSuite");
const { ResultAggregator } = require("./ResultAggregator");
const { ReportGenerator } = require("./ReportGenerator");

class Evaluator {
  /**
   * @param {Object} options
   * @param {string} options.proxy       - proxy URL
   * @param {string} [options.outputDir] - output directory (default: ./results)
   * @param {boolean} [options.verbose]  - verbose logging
   */
  constructor(options = {}) {
    this.proxy = options.proxy;
    this.outputDir = options.outputDir || "./results";
    this.verbose = options.verbose || false;
  }

  /**
   * Run a named test suite and return the aggregated report.
   *
   * @param {string} suiteName - e.g. "latency-test", "stability-test"
   * @param {Object} [overrides] - override suite defaults
   * @returns {Promise<Object>} aggregated report
   */
  async runSuite(suiteName, overrides = {}) {
    const suite = TestSuite.load(suiteName);

    // Apply overrides
    if (overrides.duration && suite.traffic) {
      suite.traffic.duration = overrides.duration;
    }
    if (overrides.puppeteer && suite.puppeteer) {
      suite.puppeteer.enabled = true;
    }

    let puppeteerResult = null;
    let trafficResult = null;

    // Puppeteer
    if (suite.puppeteer && suite.puppeteer.enabled) {
      const session = new DebugSession({
        proxy: this.proxy,
        targets: suite.puppeteer.targets,
        outputDir: `${this.outputDir}/puppeteer`,
        headless: suite.puppeteer.headless !== false,
        captureHar: suite.puppeteer.captureHar !== false,
        screenshots: suite.puppeteer.screenshots || false,
      });
      try {
        puppeteerResult = await session.run();
        await session.close();
      } catch (err) {
        puppeteerResult = { error: err.message };
      }
    }

    // Traffic
    if (suite.traffic && suite.traffic.enabled) {
      const runner = new BenchmarkRunner({
        proxy: this.proxy,
        profile: suite.traffic.profile,
        duration: suite.traffic.duration,
        concurrency: suite.traffic.concurrency,
        maxRetries: suite.traffic.maxRetries || 0,
        verbose: this.verbose,
      });
      try {
        trafficResult = await runner.run();
      } catch (err) {
        trafficResult = { error: err.message };
      }
    }

    // Aggregate
    const aggregator = new ResultAggregator(puppeteerResult, trafficResult, suite);
    const report = aggregator.aggregate();

    // Generate reports
    const generator = new ReportGenerator(report, { outputDir: this.outputDir });
    await generator.generateAll();

    return report;
  }
}

module.exports = { Evaluator, TestSuite, ResultAggregator, ReportGenerator };
