#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { CLIENT_CAPABILITIES } = require("../e2e-harness/capabilities");

const root = path.resolve(__dirname, "..");
const auditPath = path.join(root, "docs", "client-capability-audit.md");
const hiddifyDebugPath = path.join(root, "docs", "client-debugging", "hiddify.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function markdownSection(markdown, heading) {
  const marker = `### ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) {
    throw new Error(`missing audit section: ${heading}`);
  }
  const rest = markdown.slice(start);
  const next = rest.slice(marker.length).search(/\n### /);
  return next === -1 ? rest : rest.slice(0, marker.length + next);
}

function bulletBlock(section, label) {
  const marker = `- ${label}:`;
  const start = section.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const rest = section.slice(start + marker.length);
  const next = rest.search(/\n- [A-Z][^:\n]*:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasRunnable(client, scenario) {
  return CLIENT_CAPABILITIES[client]?.runnableScenarios?.includes(scenario) === true;
}

function hasGap(client, scenario) {
  return CLIENT_CAPABILITIES[client]?.harnessGaps?.includes(scenario) === true;
}

const audit = read(auditPath);
const hiddifyDebug = read(hiddifyDebugPath);
const hiddifySection = markdownSection(audit, "Hiddify");
const hiddifyCovered = bulletBlock(hiddifySection, "Covered");
const hiddifyGaps = bulletBlock(hiddifySection, "Harness gaps");

const staleAnyTlsPatterns = [
  /anytls[\s\S]{0,80}still blocked/i,
  /packaged core[\s\S]{0,120}rejects[\s\S]{0,80}anytls/i,
  /type:\s*["`]?anytls["`]?[\s\S]{0,120}unknown outbound/i,
  /unknown outbound[\s\S]{0,120}type:\s*["`]?anytls["`]?/i,
];

for (const text of [audit, hiddifyDebug]) {
  for (const pattern of staleAnyTlsPatterns) {
    assert(!pattern.test(text), `stale AnyTLS capability wording remains: ${pattern}`);
  }
}

assert(hasRunnable("flclash", "anytls_tcp"), "FlClash must keep anytls_tcp runnable");
assert(
  hasRunnable("flclash", "vless_reality_vision"),
  "FlClash must keep vless_reality_vision runnable"
);
assert(!hasGap("flclash", "anytls_tcp"), "FlClash anytls_tcp must not be a harness gap");

assert(
  hasRunnable("clash-verge-rev", "anytls_tcp"),
  "clash-verge-rev/Mihomo must keep anytls_tcp runnable"
);
assert(hasRunnable("sing-box", "anytls_tcp"), "sing-box must keep anytls_tcp runnable");

assert(!hasRunnable("xray-core", "anytls_tcp"), "xray-core must not advertise AnyTLS");
assert(!hasRunnable("v2ray", "anytls_tcp"), "V2Ray/V2Fly must not advertise AnyTLS");

if (hasRunnable("hiddify", "anytls_tcp")) {
  assert(
    !/`anytls_tcp`/.test(hiddifyGaps),
    "Hiddify audit still lists anytls_tcp as a gap while capability says runnable"
  );
} else {
  assert(
    hasGap("hiddify", "anytls_tcp"),
    "Hiddify anytls_tcp must be listed as a gap when not runnable"
  );
  assert(
    /`anytls_tcp`/.test(hiddifyGaps),
    "Hiddify audit must document anytls_tcp as a gap"
  );
  assert(
    !/`anytls_tcp`/.test(hiddifyCovered),
    "Hiddify audit must not list anytls_tcp as covered while not runnable"
  );
}

console.log("capability docs OK");
