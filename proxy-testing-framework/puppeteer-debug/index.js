/**
 * puppeteer-debug — Puppeteer debug capability encapsulated as a Node.js module.
 *
 * Provides browser automation through proxy with full network introspection:
 *   - ProxyBrowser      Launch Puppeteer with proxy configuration
 *   - NetworkRecorder   Capture all requests/responses with timing
 *   - HARCollector      Generate HAR 1.2 files for Chrome DevTools
 *   - ScreenshotTool    Scheduled/on-demand screenshots
 *   - ConsoleCapture    Collect browser console logs
 *   - DebugSession      Unified orchestrator for complete debug capture
 *
 * Usage:
 *   const { DebugSession } = require('./puppeteer-debug');
 *   const report = await new DebugSession({
 *     proxy: 'socks5://127.0.0.1:1080',
 *     targets: ['https://example.com'],
 *   }).run();
 */

const { ProxyBrowser } = require("./ProxyBrowser");
const { NetworkRecorder } = require("./NetworkRecorder");
const { HARCollector } = require("./HARCollector");
const { ScreenshotTool } = require("./ScreenshotTool");
const { ConsoleCapture } = require("./ConsoleCapture");
const { DebugSession } = require("./DebugSession");

module.exports = {
  ProxyBrowser,
  NetworkRecorder,
  HARCollector,
  ScreenshotTool,
  ConsoleCapture,
  DebugSession,
};
