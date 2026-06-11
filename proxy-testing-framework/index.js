/**
 * proxy-testing-framework
 *
 * Comprehensive proxy evaluation combining Puppeteer browser automation
 * and fetch-based traffic simulation. Tests proxy reliability, stability,
 * and efficiency under realistic usage patterns.
 *
 * Modules:
 *   puppeteer-debug/    — Browser automation through proxy with HAR, screenshots, console capture
 *   traffic-simulator/  — fetch-based user behavior simulation with metrics collection
 *   user-simulator/     — Puppeteer-based real user behavior simulation (6 behaviors)
 *   evaluator/          — Combined test suites with scoring and reports (JSON/MD/HTML)
 *
 * Usage:
 *   // Programmatic
 *   const { Evaluator } = require('proxy-testing-framework/evaluator');
 *   const report = await new Evaluator({ proxy: 'socks5://127.0.0.1:1080' }).runSuite('comprehensive');
 *
 *   // CLI
 *   node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite latency
 */

const puppeteerDebug = require("./puppeteer-debug");
const trafficSimulator = require("./traffic-simulator");
const evaluator = require("./evaluator");
const userSimulator = require("./user-simulator");

module.exports = {
  puppeteerDebug,
  trafficSimulator,
  evaluator,
  userSimulator,
  Evaluator: evaluator.Evaluator,
  UserSimulator: userSimulator.UserSimulator,
  BehaviorRunner: userSimulator.BehaviorRunner,
  listBehaviors: userSimulator.listBehaviors,
  parseProxyUrl: userSimulator.parseProxyUrl,
  buildLaunchOptions: userSimulator.buildLaunchOptions,
};
