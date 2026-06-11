/**
 * traffic-simulator — Realistic user behavior simulation through proxy.
 *
 * Simulates real user traffic patterns using fetch (undici) with proxy agent
 * support. Measures latency, throughput, error rates, and produces statistical
 * distributions for comprehensive proxy evaluation.
 *
 *   - ProxyFetchClient    fetch() through SOCKS5/HTTP proxy with timing
 *   - BehaviorProfile     Pre-built user behavior profiles (web-browsing,
 *                         video-streaming, api-heavy, social-media, general)
 *   - PatternGenerator    Generates realistic burst patterns from profiles
 *   - MetricsCollector    Aggregates timing stats (p50/p95/p99, throughput)
 *   - BenchmarkRunner     End-to-end benchmark orchestration
 *
 * Usage:
 *   const { BenchmarkRunner } = require('./traffic-simulator');
 *   const results = await new BenchmarkRunner({
 *     proxy: 'socks5://127.0.0.1:1080',
 *     profile: 'web-browsing',
 *     duration: 30000,
 *   }).run();
 */

const { ProxyFetchClient } = require("./ProxyFetchClient");
const { BehaviorProfile } = require("./BehaviorProfile");
const { PatternGenerator } = require("./PatternGenerator");
const { MetricsCollector } = require("./MetricsCollector");
const { BenchmarkRunner } = require("./BenchmarkRunner");

module.exports = {
  ProxyFetchClient,
  BehaviorProfile,
  PatternGenerator,
  MetricsCollector,
  BenchmarkRunner,
};
